import { DIRECTION, SYNC_STATUS, type Direction } from 'src/constants/options';
import { sumMicros } from 'src/lib/decimal';
import { authenticateWithKsefToken } from 'src/lib/ksef/auth';
import { Fa3ParseError, parseFa3 } from 'src/lib/ksef/fa3-parser';
import { KsefApiError, KsefRateLimitError, type KsefHttpClient } from 'src/lib/ksef/http';
import {
  downloadInvoiceXml,
  fetchMetadataSince,
  type SubjectType,
} from 'src/lib/ksef/invoices';
import { invoiceFromMetadata, lineNetPln, lineRecord } from 'src/lib/sync/mapping';
import { KSEF_LIMITS, loadRateBudget, type KvStore } from 'src/lib/sync/rate-budget';
import type { InvoiceStore } from 'src/lib/sync/store';

// Synchronizacja dwufazowa, bo KSeF pozwala pobrać tylko ~64 XML na godzinę:
// 1) metadane (do 250 faktur na zapytanie) -> nagłówki od razu widoczne w CRM, status PENDING,
// 2) XML dla faktur PENDING w ramach budżetu -> pozycje, plik XML, status COMPLETE.
// Kolejne przebiegi crona dobierają resztę.

export const INITIAL_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_METADATA_REQUESTS_PER_DIRECTION = 4;
const MAX_DOWNLOADS_PER_RUN = 14;

const SUBJECT_BY_DIRECTION: Record<Direction, SubjectType> = {
  [DIRECTION.SALE]: 'Subject1',
  [DIRECTION.PURCHASE]: 'Subject2',
};

export const KV_KEYS = {
  lock: 'ksef:lock',
  lastRun: 'ksef:last-run',
  cursor: (direction: Direction) => `ksef:cursor:${direction}`,
};

export type SyncSummary = {
  ok: boolean;
  skipped?: 'LOCKED';
  finishedAt: string;
  created: number;
  completed: number;
  failed: number;
  pendingLeft: boolean;
  catchingUp: boolean;
  message?: string;
};

export type SyncDeps = {
  http: KsefHttpClient;
  kv: KvStore;
  store: InvoiceStore;
  nip: string;
  ksefToken: string;
  nbpRate: (currency: string, date: string) => Promise<number | null>;
  now?: () => Date;
  // czas, po którym nie zaczynamy kolejnego pobrania XML (zapas względem timeoutSeconds funkcji)
  budgetMs?: number;
  log?: (message: string) => void;
};

type LockValue = { until: number };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

export const runSync = async (deps: SyncDeps): Promise<SyncSummary> => {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const startedAt = now().getTime();
  const budgetMs = deps.budgetMs ?? 4 * 60 * 1000;

  const lock = await deps.kv.get<LockValue>(KV_KEYS.lock);
  if (lock && lock.until > startedAt) {
    return {
      ok: true,
      skipped: 'LOCKED',
      finishedAt: now().toISOString(),
      created: 0,
      completed: 0,
      failed: 0,
      pendingLeft: true,
      catchingUp: false,
      message: 'Poprzednia synchronizacja jeszcze trwa.',
    };
  }
  await deps.kv.set(KV_KEYS.lock, { until: startedAt + LOCK_TTL_MS } satisfies LockValue);

  const summary: SyncSummary = {
    ok: true,
    finishedAt: '',
    created: 0,
    completed: 0,
    failed: 0,
    pendingLeft: false,
    catchingUp: false,
  };
  const metadataBudget = await loadRateBudget(deps.kv, 'metadata', KSEF_LIMITS.metadata, () =>
    now().getTime(),
  );
  const downloadBudget = await loadRateBudget(deps.kv, 'download', KSEF_LIMITS.download, () =>
    now().getTime(),
  );

  try {
    const accessToken = await authenticateWithKsefToken({
      http: deps.http,
      nip: deps.nip,
      ksefToken: deps.ksefToken,
      now,
    });

    // Faza 1: metadane obu kierunków
    for (const direction of [DIRECTION.SALE, DIRECTION.PURCHASE]) {
      const allowed = Math.min(metadataBudget.available(), MAX_METADATA_REQUESTS_PER_DIRECTION);
      if (allowed === 0) {
        summary.catchingUp = true;
        break;
      }
      const cursor =
        (await deps.kv.get<string>(KV_KEYS.cursor(direction))) ??
        new Date(startedAt - INITIAL_LOOKBACK_DAYS * DAY_MS).toISOString();

      const batch = await fetchMetadataSince({
        http: deps.http,
        accessToken,
        subjectType: SUBJECT_BY_DIRECTION[direction],
        from: cursor,
        now: now(),
        maxRequests: allowed,
      });
      metadataBudget.record(batch.requests);
      summary.catchingUp ||= batch.hasMoreWindows;

      const existing = await deps.store.findExistingKsefNumbers(
        batch.invoices.map((i) => i.ksefNumber),
      );
      const fresh = batch.invoices.filter((i) => !existing.has(i.ksefNumber));
      if (fresh.length > 0) {
        const companies = await deps.store.findCompanyIdsByNip([
          ...new Set(
            fresh
              .map((i) => (direction === DIRECTION.SALE ? i.buyer.identifier.value : i.seller.nip))
              .filter((n): n is string => !!n),
          ),
        ]);
        const records = fresh.map((meta) => {
          const record = invoiceFromMetadata(meta, direction, null);
          return {
            ...record,
            companyId: (record.counterpartyTaxId && companies?.get(record.counterpartyTaxId)) || null,
          };
        });
        await deps.store.createInvoices(records);
        summary.created += records.length;
      }
      // kursor zapisujemy dopiero po utworzeniu nagłówków – po awarii zakres zostanie pobrany ponownie
      await deps.kv.set(KV_KEYS.cursor(direction), batch.nextCursor);
      log(`${direction}: ${batch.invoices.length} w KSeF, ${fresh.length} nowych, kursor ${batch.nextCursor}`);
    }

    // Faza 2: XML i pozycje
    const allowedDownloads = Math.min(downloadBudget.available(), MAX_DOWNLOADS_PER_RUN);
    const pending = await deps.store.findPendingInvoices(allowedDownloads + 1);
    summary.pendingLeft = pending.length > allowedDownloads;

    for (const invoice of pending.slice(0, allowedDownloads)) {
      if (now().getTime() - startedAt > budgetMs) {
        summary.pendingLeft = true;
        break;
      }
      let xml: string;
      try {
        downloadBudget.record();
        xml = await downloadInvoiceXml(deps.http, accessToken, invoice.ksefNumber);
      } catch (e) {
        if (e instanceof KsefRateLimitError) {
          summary.pendingLeft = true;
          log(e.message);
          break;
        }
        if (e instanceof KsefApiError && e.status < 500) {
          await deps.store.updateInvoice(invoice.id, {
            syncStatus: SYNC_STATUS.ERROR,
            syncError: errorMessage(e),
          });
          summary.failed++;
          continue;
        }
        throw e;
      }

      try {
        await importInvoiceDetails(deps, invoice, xml);
        summary.completed++;
      } catch (e) {
        if (!(e instanceof Fa3ParseError)) throw e;
        await deps.store.updateInvoice(invoice.id, {
          syncStatus: SYNC_STATUS.ERROR,
          syncError: errorMessage(e),
        });
        summary.failed++;
      }
    }
  } catch (e) {
    summary.ok = false;
    summary.message = errorMessage(e);
    log(`Synchronizacja przerwana: ${summary.message}`);
  } finally {
    await metadataBudget.persist();
    await downloadBudget.persist();
    summary.finishedAt = now().toISOString();
    await deps.kv.set(KV_KEYS.lastRun, summary);
    await deps.kv.set(KV_KEYS.lock, { until: 0 } satisfies LockValue);
  }
  return summary;
};

const importInvoiceDetails = async (
  deps: SyncDeps,
  invoice: { id: string; ksefNumber: string; direction: Direction; issueDate: string | null; companyId: string | null },
  xml: string,
) => {
  const parsed = parseFa3(xml);
  const currency = parsed.currency;

  // Kurs dla faktur w walucie obcej: nagłówek, a gdy go brak i pozycje też go nie mają – NBP z dnia poprzedzającego.
  let invoiceRate = parsed.headerExchangeRate;
  const needsRate =
    currency !== 'PLN' && invoiceRate === null && parsed.lines.some((l) => l.exchangeRate === null);
  if (needsRate) {
    const rateDate = parsed.saleDate ?? parsed.issueDate ?? invoice.issueDate;
    invoiceRate = rateDate ? await deps.nbpRate(currency, rateDate) : null;
  }

  const ctx = {
    invoiceId: invoice.id,
    direction: invoice.direction,
    currency,
    invoiceRate,
    issueDate: parsed.issueDate ?? invoice.issueDate,
    companyId: invoice.companyId,
  };
  await deps.store.replaceLines(invoice.id, parsed.lines.map((line) => lineRecord(line, ctx)));

  const linesPln = parsed.lines.map((line) => lineNetPln(line, ctx));
  const netPln = linesPln.every((v): v is number => v !== null) ? sumMicros(linesPln) : null;

  const correctedKsefNumber = parsed.correctedKsefNumbers[0] ?? null;
  const correctedInvoiceId = correctedKsefNumber
    ? await deps.store.findInvoiceIdByKsefNumber(correctedKsefNumber)
    : null;

  // XML w polu plikowym jest dodatkiem – jego błąd nie blokuje importu pozycji
  let xmlFile: { fileId: string; label: string }[] | undefined;
  let xmlError: string | null = null;
  try {
    xmlFile = [await deps.store.uploadXml(xml, `${invoice.ksefNumber}.xml`)];
  } catch (e) {
    xmlError = `Nie zapisano pliku XML: ${errorMessage(e)}`;
  }

  await deps.store.updateInvoice(invoice.id, {
    saleDate: parsed.saleDate,
    exchangeRate: currency === 'PLN' ? null : invoiceRate,
    ...(parsed.lines.length > 0 && netPln !== null
      ? { netAmountPln: { amountMicros: netPln, currencyCode: 'PLN' } }
      : {}),
    correctedKsefNumber,
    correctedInvoiceId,
    ...(xmlFile ? { xmlFile } : {}),
    syncStatus: SYNC_STATUS.COMPLETE,
    syncError: xmlError,
  });
};
