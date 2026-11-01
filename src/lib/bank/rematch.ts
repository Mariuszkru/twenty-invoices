import { ALLOCATION_ORIGIN, MATCH_STATUS, PAYMENT_PURPOSE } from 'src/constants/options';
import {
  AMOUNT_TOLERANCE_MICROS,
  matchTransaction,
  remainingMicros,
  type MatchableTransaction,
  type MatchResult,
  type OpenInvoice,
} from 'src/lib/bank/match';
import { allocationName, recomputeInvoicePayment } from 'src/lib/bank/payment';
import type { AllocationRecord, BankStore } from 'src/lib/bank/store';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMATCH_DAYS = 60;
// zapłacone faktury, do których jeszcze przypinamy transakcje (bez zmiany statusu)
export const PAID_LOOKBACK_DAYS = 120;

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Dopasowanie transakcji do faktur z listami trzymanymi w pamięci: przydział zmniejsza pozostałą kwotę,
// żeby kolejna transakcja w tym samym przebiegu jej nie dublowała.
export const createInvoiceMatcher = (openInvoices: OpenInvoice[], paidInvoices: OpenInvoice[]) => {
  const touchedInvoices = new Set<string>();
  let linkedToPaid = 0;
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
  const findMatch = (t: MatchableTransaction): MatchResult => {
    const open = matchTransaction(t, openInvoices);
    if (open.allocations.length) {
      for (const a of open.allocations) {
        touchedInvoices.add(a.invoiceId);
        consume(openInvoices, a.invoiceId, a.amountMicros);
      }
      return open;
    }
    const paid = matchTransaction(t, paidInvoices);
    if (paid.allocations.length) {
      linkedToPaid++;
      for (const a of paid.allocations) consume(paidInvoices, a.invoiceId, a.amountMicros);
      return { ...paid, note: `${paid.note}; faktura była już oznaczona jako zapłacona` };
    }
    return open;
  };
  return { findMatch, touchedInvoices, linkedToPaid: () => linkedToPaid };
};

export const allocationRecords = (transactionId: string, t: MatchableTransaction, match: MatchResult): AllocationRecord[] =>
  match.allocations.map((a) => ({
    transactionId,
    invoiceId: a.invoiceId,
    name: allocationName(a.invoiceName, a.amountMicros, t.amount.currencyCode),
    amount: { amountMicros: a.amountMicros, currencyCode: t.amount.currencyCode },
    origin: ALLOCATION_ORIGIN.AUTO,
  }));

// Faktura (np. zakupowa z KSeF) mogła dotrzeć później niż przelew, a płatność bywa wykonana przed wystawieniem faktury.
// Po pobraniu faktur ponawiamy dopasowanie nieprzypisanych transakcji; nie dotyka banku.
export const rematchUnmatched = async (store: BankStore, nowMs: number) => {
  const matcher = createInvoiceMatcher(
    await store.findOpenInvoices(),
    await store.findPaidInvoices(isoDate(nowMs - PAID_LOOKBACK_DAYS * DAY_MS)),
  );
  let rematched = 0;
  for (const t of await store.findUnmatchedTransactions(isoDate(nowMs - REMATCH_DAYS * DAY_MS))) {
    const match = matcher.findMatch(t);
    if (!match.allocations.length) continue;
    await store.createAllocations(allocationRecords(t.id, t, match));
    await store.updateTransaction(t.id, {
      matchStatus: MATCH_STATUS.AUTO,
      matchNote: match.note,
      paymentPurpose: PAYMENT_PURPOSE.INVOICE,
    });
    rematched++;
  }
  for (const invoiceId of matcher.touchedInvoices) await recomputeInvoicePayment(store, invoiceId);
  return { rematched, invoicesUpdated: matcher.touchedInvoices.size };
};
