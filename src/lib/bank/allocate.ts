import { ALLOCATION_ORIGIN, BANK_DIRECTION, DIRECTION, MATCH_STATUS } from 'src/constants/options';
import { AMOUNT_TOLERANCE_MICROS, normalizeAccount, remainingMicros, type OpenInvoice } from 'src/lib/bank/match';
import { allocationName, recomputeInvoicePayment } from 'src/lib/bank/payment';
import type { BankStore, StoredTransaction } from 'src/lib/bank/store';

// Ręczne rozliczenie transakcji w panelu "Rozlicz przelew": lista faktur do wyboru i zapis rozliczeń.
// Zapis zastępuje wszystkie rozliczenia transakcji i przelicza płatność faktur, których dotyczył przed i po zmianie.

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocationError';
  }
}

export type AllocationCandidate = {
  id: string;
  name: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
  grossMicros: number;
  // pozostało do zapłaty bez rozliczeń tej transakcji
  remainingMicros: number;
  // kwota tej transakcji już przypisana do faktury
  allocatedMicros: number;
  sameCounterparty: boolean;
};

export type AllocationContext = {
  transaction: Pick<
    StoredTransaction,
    'id' | 'name' | 'bookingDate' | 'direction' | 'amount' | 'counterpartyName' | 'remittanceInformation' | 'matchStatus'
  >;
  candidates: AllocationCandidate[];
};

const MAX_CANDIDATES = 100;

const loadTransaction = async (store: BankStore, transactionId: string) => {
  const transaction = await store.getTransaction(transactionId);
  if (!transaction) throw new AllocationError('Nie znaleziono transakcji.');
  return transaction;
};

const fitsTransaction = (transaction: StoredTransaction, invoice: OpenInvoice) =>
  invoice.direction === (transaction.direction === BANK_DIRECTION.CREDIT ? DIRECTION.SALE : DIRECTION.PURCHASE) &&
  invoice.grossAmount?.currencyCode === transaction.amount.currencyCode;

const normalizeName = (value: string | null) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

export const allocationContext = async (store: BankStore, transactionId: string): Promise<AllocationContext> => {
  const transaction = await loadTransaction(store, transactionId);
  const current = await store.listTransactionAllocations(transactionId);
  const allocatedByInvoice = new Map<string, number>();
  for (const a of current) allocatedByInvoice.set(a.invoiceId, (allocatedByInvoice.get(a.invoiceId) ?? 0) + a.amount.amountMicros);

  // otwarte faktury pasujące kierunkiem i walutą oraz faktury już przypisane do tej transakcji (także zapłacone)
  const open = await store.findOpenInvoices();
  const assigned = await store.getInvoices([...allocatedByInvoice.keys()].filter((id) => !open.some((i) => i.id === id)));
  const txAccount = normalizeAccount(transaction.counterpartyAccount);
  const txName = normalizeName(transaction.counterpartyName);

  const candidates = [...open, ...assigned]
    .filter((i) => allocatedByInvoice.has(i.id) || (fitsTransaction(transaction, i) && (i.grossAmount?.amountMicros ?? 0) > 0))
    .map((i): AllocationCandidate => {
      const allocated = allocatedByInvoice.get(i.id) ?? 0;
      const sameCounterparty =
        (txAccount !== null && normalizeAccount(i.bankAccount) === txAccount) ||
        (txName.length >= 4 && normalizeName(i.counterpartyName) === txName);
      return {
        id: i.id,
        name: i.name,
        counterpartyName: i.counterpartyName,
        issueDate: i.issueDate,
        grossMicros: i.grossAmount?.amountMicros ?? 0,
        // paidAmount otwartej faktury zawiera już rozliczenia tej transakcji – oddajemy je do puli
        remainingMicros: Math.max(0, remainingMicros(i) + allocated),
        allocatedMicros: allocated,
        sameCounterparty,
      };
    })
    .sort(
      (a, b) =>
        Number(b.allocatedMicros > 0) - Number(a.allocatedMicros > 0) ||
        Number(b.sameCounterparty) - Number(a.sameCounterparty) ||
        (b.issueDate ?? '').localeCompare(a.issueDate ?? ''),
    )
    .slice(0, MAX_CANDIDATES);

  const { id, name, bookingDate, direction, amount, counterpartyName, remittanceInformation, matchStatus } = transaction;
  return {
    transaction: { id, name, bookingDate, direction, amount, counterpartyName, remittanceInformation, matchStatus },
    candidates,
  };
};

export type ManualAllocation = { invoiceId: string; amountMicros: number };

export const saveManualAllocation = async (store: BankStore, transactionId: string, items: ManualAllocation[]) => {
  const transaction = await loadTransaction(store, transactionId);
  const wanted = items.filter((i) => i.amountMicros > 0);
  if (wanted.some((i) => !Number.isFinite(i.amountMicros))) throw new AllocationError('Niepoprawna kwota.');
  if (new Set(wanted.map((i) => i.invoiceId)).size !== wanted.length) {
    throw new AllocationError('Każda faktura może wystąpić tylko raz.');
  }
  const total = wanted.reduce((sum, i) => sum + i.amountMicros, 0);
  if (total > transaction.amount.amountMicros + AMOUNT_TOLERANCE_MICROS) {
    throw new AllocationError('Suma rozliczeń przekracza kwotę transakcji.');
  }

  const invoices = await store.getInvoices(wanted.map((i) => i.invoiceId));
  for (const item of wanted) {
    const invoice = invoices.find((i) => i.id === item.invoiceId);
    if (!invoice) throw new AllocationError('Nie znaleziono faktury.');
    if (!fitsTransaction(transaction, invoice)) {
      throw new AllocationError(`Faktura ${invoice.name ?? ''} nie pasuje kierunkiem albo walutą do transakcji.`);
    }
  }

  const previous = await store.listTransactionAllocations(transactionId);
  await store.deleteAllocations(previous.map((a) => a.id));
  await store.createAllocations(
    wanted.map((item) => ({
      transactionId,
      invoiceId: item.invoiceId,
      name: allocationName(invoices.find((i) => i.id === item.invoiceId)?.name ?? null, item.amountMicros, transaction.amount.currencyCode),
      amount: { amountMicros: item.amountMicros, currencyCode: transaction.amount.currencyCode },
      origin: ALLOCATION_ORIGIN.MANUAL,
    })),
  );

  const left = transaction.amount.amountMicros - total;
  await store.updateTransaction(transactionId, {
    matchStatus: wanted.length ? MATCH_STATUS.MANUAL : MATCH_STATUS.UNMATCHED,
    matchNote: wanted.length
      ? `Rozliczona ręcznie: ${wanted.length} ${wanted.length === 1 ? 'faktura' : 'faktury'}` +
        (left > AMOUNT_TOLERANCE_MICROS ? `, nierozliczone ${(left / 1_000_000).toFixed(2)}` : '')
      : 'Rozliczenie usunięte ręcznie',
  });

  const affected = new Set([...previous.map((a) => a.invoiceId), ...wanted.map((i) => i.invoiceId)]);
  for (const invoiceId of affected) await recomputeInvoicePayment(store, invoiceId);
  return { allocations: wanted.length, invoicesUpdated: affected.size };
};
