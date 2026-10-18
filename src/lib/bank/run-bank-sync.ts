import { MATCH_STATUS } from 'src/constants/options';
import type { StoredBankSession } from 'src/lib/bank/consent';
import { isConsentError, type EnableBankingClient } from 'src/lib/bank/enablebanking-http';
import {
  AMOUNT_TOLERANCE_MICROS,
  matchTransaction,
  remainingMicros,
  type MatchableTransaction,
  type OpenInvoice,
} from 'src/lib/bank/match';
import {
  bankErrorMessage,
  bankSummaryMessage,
  consentExpiringMessage,
  noConsentMessage,
} from 'src/lib/bank/messages';
import { recomputeInvoicePayment } from 'src/lib/bank/payment';
import type { BankStore, TransactionMatch } from 'src/lib/bank/store';
import { fetchBookedTransactions, type BankTransactionRecord } from 'src/lib/bank/transactions';
import { errorMessage } from 'src/lib/sync/import-details';
import type { KvStore } from 'src/lib/sync/rate-budget';

// Dzienny przebieg wyciągu: transakcje zaksięgowane od ostatniego kursora (z zakładką na późne księgowania),
// zapis nowych, dopasowanie do faktur, ponowna próba dla nieprzypisanych i przeliczenie płatności faktur.
// PSD2 pozwala na ok. 4 zapytania bez udziału użytkownika na rachunek dziennie, więc cron chodzi raz na dobę.

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;
export const INITIAL_LOOKBACK_DAYS = 30;
// banki potrafią zaksięgować transakcję z datą sprzed kilku dni
const OVERLAP_DAYS = 5;
const REMATCH_DAYS = 60;
// zapłacone faktury, do których jeszcze przypinamy transakcje (bez zmiany statusu)
const PAID_LOOKBACK_DAYS = 120;
export const CONSENT_WARNING_DAYS = [14, 3];

export const BANK_KV_KEYS = {
  lock: 'bank:lock',
  lastRun: 'bank:last-run',
  state: 'bank:state',
  cursor: (accountUid: string) => `bank:cursor:${accountUid}`,
  consentWarned: (days: number) => `bank:consent-warned:${days}`,
};

export type BankSyncSummary = {
  ok: boolean;
  skipped?: 'LOCKED' | 'NO_CONSENT';
  finishedAt: string;
  fetched: number;
  created: number;
  matched: number;
  // z tego przypięte do faktur, które już wcześniej były zapłacone (status bez zmian)
  linkedToPaid: number;
  unmatched: number;
  rematched: number;
  invoicesUpdated: number;
  message?: string;
};

export type BankSyncDeps = {
  client: EnableBankingClient;
  kv: KvStore;
  store: BankStore;
  session: StoredBankSession | null;
  now?: () => Date;
  log?: (message: string) => void;
  notify?: { send: (text: string) => Promise<void>; crmUrl: string | null };
};

type LockValue = { until: number };

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const runBankSync = async (deps: BankSyncDeps): Promise<BankSyncSummary> => {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const startedAt = now().getTime();
  const summary: BankSyncSummary = {
    ok: true,
    finishedAt: '',
    fetched: 0,
    created: 0,
    matched: 0,
    linkedToPaid: 0,
    unmatched: 0,
    rematched: 0,
    invoicesUpdated: 0,
  };
  // powiadomienie nie może przerwać przebiegu ani zmienić jego wyniku
  const notify = async (text: string) => {
    if (!deps.notify) return;
    try {
      await deps.notify.send(text);
    } catch (e) {
      log(`powiadomienie nie wysłane: ${errorMessage(e)}`);
    }
  };
  const finish = async (result: BankSyncSummary) => {
    result.finishedAt = now().toISOString();
    await deps.kv.set(BANK_KV_KEYS.lastRun, result);
    return result;
  };

  const lock = await deps.kv.get<LockValue>(BANK_KV_KEYS.lock);
  if (lock && lock.until > startedAt) {
    return { ...summary, skipped: 'LOCKED', finishedAt: now().toISOString(), message: 'Poprzednie pobieranie jeszcze trwa.' };
  }

  const session = deps.session;
  if (!session || Date.parse(session.validUntil) <= startedAt) {
    const reason = session ? 'zgoda na odczyt rachunku wygasła.' : 'brak połączenia z bankiem.';
    await notify(noConsentMessage(reason));
    return finish({ ...summary, ok: false, skipped: 'NO_CONSENT', message: reason });
  }

  await deps.kv.set(BANK_KV_KEYS.lock, { until: startedAt + LOCK_TTL_MS } satisfies LockValue);
  try {
    await warnAboutConsentExpiry(deps, session, startedAt, notify);

    const openInvoices: OpenInvoice[] = await deps.store.findOpenInvoices();
    const paidInvoices: OpenInvoice[] = await deps.store.findPaidInvoices(isoDate(startedAt - PAID_LOOKBACK_DAYS * DAY_MS));
    const touchedInvoices = new Set<string>();
    // dopasowanie zmniejsza pozostałą kwotę w pamięci, żeby kolejna transakcja w tym samym przebiegu jej nie dublowała
    const consume = (list: OpenInvoice[], invoiceId: string, amountMicros: number) => {
      const invoice = list.find((i) => i.id === invoiceId);
      if (!invoice?.grossAmount) return;
      invoice.paidAmount = {
        amountMicros: (invoice.grossAmount.amountMicros - remainingMicros(invoice)) + amountMicros,
        currencyCode: invoice.grossAmount.currencyCode,
      };
      if (remainingMicros(invoice) <= AMOUNT_TOLERANCE_MICROS) list.splice(list.indexOf(invoice), 1);
    };
    // najpierw faktury otwarte (zmiana statusu), potem już zapłacone – tylko przypięcie jako ślad zapłaty
    const findMatch = (t: MatchableTransaction) => {
      const open = matchTransaction(t, openInvoices);
      if (open.invoiceId) {
        touchedInvoices.add(open.invoiceId);
        consume(openInvoices, open.invoiceId, t.amount.amountMicros);
        return open;
      }
      const paid = matchTransaction(t, paidInvoices);
      if (paid.invoiceId) {
        summary.linkedToPaid++;
        consume(paidInvoices, paid.invoiceId, t.amount.amountMicros);
        return { invoiceId: paid.invoiceId, note: `${paid.note}; faktura była już oznaczona jako zapłacona` };
      }
      return open;
    };

    const today = isoDate(startedAt);
    const freshUnmatched = new Set<string>();
    for (const account of session.accounts) {
      const cursor = await deps.kv.get<string>(BANK_KV_KEYS.cursor(account.uid));
      const dateFrom = cursor
        ? isoDate(Date.parse(`${cursor}T00:00:00Z`) - OVERLAP_DAYS * DAY_MS)
        : isoDate(startedAt - INITIAL_LOOKBACK_DAYS * DAY_MS);
      const fetched = await fetchBookedTransactions({ client: deps.client, account, dateFrom, dateTo: today });
      summary.fetched += fetched.length;

      const unique = [...new Map(fetched.map((t) => [t.externalId, t])).values()];
      const existing = await deps.store.findExistingTransactionIds(unique.map((t) => t.externalId));
      const fresh = unique
        .filter((t) => !existing.has(t.externalId))
        .sort((a, b) => (a.bookingDate ?? '').localeCompare(b.bookingDate ?? ''));

      const records: (BankTransactionRecord & TransactionMatch)[] = fresh.map((t) => {
        const match = findMatch(t);
        if (match.invoiceId) {
          summary.matched++;
        } else {
          summary.unmatched++;
          freshUnmatched.add(t.externalId);
        }
        return {
          ...t,
          invoiceId: match.invoiceId,
          matchStatus: match.invoiceId ? MATCH_STATUS.AUTO : MATCH_STATUS.UNMATCHED,
          matchNote: match.note,
        };
      });
      if (records.length) await deps.store.createTransactions(records);
      summary.created += records.length;
      await deps.kv.set(BANK_KV_KEYS.cursor(account.uid), today);
      log(`rachunek ${account.iban ?? account.uid}: ${fetched.length} transakcji od ${dateFrom}, nowe ${records.length}`);
    }

    // faktura (np. zakupowa z KSeF) mogła dotrzeć później niż przelew – ponawiamy dopasowanie nieprzypisanych
    const pending = await deps.store.findUnmatchedTransactions(isoDate(startedAt - REMATCH_DAYS * DAY_MS));
    for (const t of pending) {
      const match = findMatch(t);
      if (!match.invoiceId) continue;
      await deps.store.updateTransaction(t.id, {
        invoiceId: match.invoiceId,
        matchStatus: MATCH_STATUS.AUTO,
        matchNote: match.note,
      });
      // nowa transakcja z tego przebiegu nie jest "wcześniejsza" – tylko przestaje być nieprzypisana
      if (freshUnmatched.delete(t.externalId)) {
        summary.unmatched--;
        summary.matched++;
      } else {
        summary.rematched++;
      }
    }

    for (const invoiceId of touchedInvoices) {
      await recomputeInvoicePayment(deps.store, invoiceId);
    }
    summary.invoicesUpdated = touchedInvoices.size;

    if (summary.created > 0 || summary.rematched > 0) {
      await notify(bankSummaryMessage(summary, deps.notify?.crmUrl ?? null));
    }
    return await finish(summary);
  } catch (e) {
    if (isConsentError(e)) {
      const reason = 'bank odrzucił zgodę (wygasła albo została cofnięta).';
      await notify(noConsentMessage(reason));
      return await finish({ ...summary, ok: false, skipped: 'NO_CONSENT', message: reason });
    }
    const message = errorMessage(e);
    log(`błąd: ${message}`);
    await notify(bankErrorMessage(message));
    return await finish({ ...summary, ok: false, message });
  } finally {
    await deps.kv.set(BANK_KV_KEYS.lock, { until: 0 } satisfies LockValue);
  }
};

const warnAboutConsentExpiry = async (
  deps: BankSyncDeps,
  session: StoredBankSession,
  nowMs: number,
  notify: (text: string) => Promise<void>,
) => {
  const daysLeft = Math.ceil((Date.parse(session.validUntil) - nowMs) / DAY_MS);
  // najbliższy przekroczony próg; zapisana data zgody sprawia, że nowa zgoda zaczyna ostrzeżenia od nowa
  const threshold = [...CONSENT_WARNING_DAYS].sort((a, b) => a - b).find((days) => daysLeft <= days);
  if (threshold === undefined) return;
  const key = BANK_KV_KEYS.consentWarned(threshold);
  if ((await deps.kv.get<string>(key)) === session.validUntil) return;
  await notify(consentExpiringMessage(session.validUntil, daysLeft));
  await deps.kv.set(key, session.validUntil);
};
