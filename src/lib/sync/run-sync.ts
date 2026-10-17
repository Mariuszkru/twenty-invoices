import { DIRECTION, SYNC_STATUS, type Direction } from 'src/constants/options';
import { Fa3ParseError } from 'src/lib/ksef/fa3-parser';
import { KsefApiError, KsefRateLimitError, type KsefHttpClient } from 'src/lib/ksef/http';
import {
  downloadInvoiceXml,
  fetchMetadataSince,
  type SubjectType,
} from 'src/lib/ksef/invoices';
import { obtainAccessToken, type SessionStore } from 'src/lib/ksef/session';
import { errorMessage, importInvoiceDetails } from 'src/lib/sync/import-details';
import { invoiceFromMetadata } from 'src/lib/sync/mapping';
import { KSEF_LIMITS, loadRateBudget, type KvStore } from 'src/lib/sync/rate-budget';
import { newPurchaseInvoicesMessage } from 'src/lib/notify/messages';
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
  // refresh token KSeF przechowywany między przebiegami; bez niego każdy przebieg uwierzytelnia się od nowa
  session?: SessionStore;
  now?: () => Date;
  // czas, po którym nie zaczynamy kolejnego pobrania XML (zapas względem timeoutSeconds funkcji)
  budgetMs?: number;
  log?: (message: string) => void;
  // powiadomienie na czat o nowych fakturach zakupowych; brak = bez powiadomień
  notify?: { send: (text: string) => Promise<void>; crmUrl: string | null };
};

type LockValue = { until: number };

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
    const accessToken = await obtainAccessToken({
      http: deps.http,
      nip: deps.nip,
      ksefToken: deps.ksefToken,
      session: deps.session,
      now,
      log,
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
        await importInvoiceDetails(deps, invoice, xml, { uploadXml: true });
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
    // także po przerwaniu przebiegu; nieudana wysyłka zostanie ponowiona w kolejnym
    if (deps.notify) await notifyNewPurchases(deps, deps.notify, now, log);
    await metadataBudget.persist();
    await downloadBudget.persist();
    summary.finishedAt = now().toISOString();
    await deps.kv.set(KV_KEYS.lastRun, summary);
    await deps.kv.set(KV_KEYS.lock, { until: 0 } satisfies LockValue);
  }
  return summary;
};

// Tylko świeże faktury (zapisane w KSeF w ostatnich dniach): pierwszy import 90 dni wstecz
// ani ponowne pobranie starej faktury nie zasypują czatu.
export const NEW_INVOICE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const notifyNewPurchases = async (
  deps: SyncDeps,
  notify: NonNullable<SyncDeps['notify']>,
  now: () => Date,
  log: (message: string) => void,
) => {
  try {
    const since = new Date(now().getTime() - NEW_INVOICE_WINDOW_MS).toISOString();
    const invoices = await deps.store.findUnnotifiedPurchases(since);
    if (invoices.length === 0) return;
    await notify.send(newPurchaseInvoicesMessage(invoices, notify.crmUrl));
    for (const invoice of invoices) {
      await deps.store.updateInvoice(invoice.id, { newInvoiceNotifiedAt: now().toISOString() });
    }
  } catch (e) {
    // brak powiadomienia nie zatrzymuje synchronizacji; faktury bez znacznika wyślemy w kolejnym przebiegu
    log(`Powiadomienie o nowych fakturach nieudane: ${errorMessage(e)}`);
  }
};
