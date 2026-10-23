import { ALLOCATION_ORIGIN, BANK_DIRECTION, DIRECTION, EXPENSE_CATEGORY, MATCH_STATUS } from 'src/constants/options';
import { classifyExpense, expenseLabel, findEmployeeId } from 'src/lib/bank/expense-category';
import {
  AMOUNT_TOLERANCE_MICROS,
  matchTransaction,
  normalizeAccount,
  remainingMicros,
  type OpenInvoice,
} from 'src/lib/bank/match';
import { allocationName, recomputeInvoicePayment } from 'src/lib/bank/payment';
import type { BankStore, Employee, StoredTransaction } from 'src/lib/bank/store';

// Ręczne rozliczenie transakcji w panelu "Rozlicz przelew": lista faktur do wyboru i zapis rozliczeń.
// Zapis zastępuje wszystkie rozliczenia transakcji i przelicza płatność faktur, których dotyczył przed i po zmianie.
// Wydatek bez faktury (ZUS, podatki, wynagrodzenia) zapisuje rodzaj wydatku zamiast rozliczeń.
// Nierozliczona transakcja dostaje propozycję z tego samego dopasowania co przebieg dzienny – panel ją zaznacza,
// ale zapisuje dopiero osoba.

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
  // faktura ma już status Zapłacona (np. opłacona z góry) – przypięcie przelewu jest śladem zapłaty
  alreadyPaid: boolean;
  // pozostała kwota faktury równa kwocie transakcji – najbardziej prawdopodobny wybór
  sameAmount: boolean;
};

export type AllocationContext = {
  transaction: Pick<
    StoredTransaction,
    | 'id'
    | 'name'
    | 'bookingDate'
    | 'direction'
    | 'amount'
    | 'counterpartyName'
    | 'remittanceInformation'
    | 'matchStatus'
    | 'expenseCategory'
    | 'employeeId'
  >;
  candidates: AllocationCandidate[];
  // lista do wyboru przy wynagrodzeniu i pracownik podpowiedziany po odbiorcy przelewu
  employees: Employee[];
  suggestedEmployeeId: string | null;
  // automatyczna propozycja rozliczenia (bez zapisu); null, gdy transakcja jest już rozliczona albo nic nie pasuje
  proposal: AllocationProposal | null;
};

export type AllocationProposal =
  | { kind: 'invoices'; allocations: ManualAllocation[]; note: string }
  | { kind: 'expense'; category: string; employeeId: string | null; note: string };

const MAX_CANDIDATES = 100;
// zapłacone faktury pokazywane w panelu (np. opłacone z góry, do których trzeba przypiąć przelew)
const PAID_LOOKBACK_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

const loadTransaction = async (store: BankStore, transactionId: string) => {
  const transaction = await store.getTransaction(transactionId);
  if (!transaction) throw new AllocationError('Nie znaleziono transakcji.');
  return transaction;
};

const fitsTransaction = (transaction: StoredTransaction, invoice: OpenInvoice) =>
  invoice.direction === (transaction.direction === BANK_DIRECTION.CREDIT ? DIRECTION.SALE : DIRECTION.PURCHASE) &&
  invoice.grossAmount?.currencyCode === transaction.amount.currencyCode;

const grossSign = (invoice: OpenInvoice) => ((invoice.grossAmount?.amountMicros ?? 0) < 0 ? -1 : 1);

const normalizeName =(value: string | null) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

export const allocationContext = async (store: BankStore, transactionId: string): Promise<AllocationContext> => {
  const transaction = await loadTransaction(store, transactionId);
  const current = await store.listTransactionAllocations(transactionId);
  const allocatedByInvoice = new Map<string, number>();
  for (const a of current) allocatedByInvoice.set(a.invoiceId, (allocatedByInvoice.get(a.invoiceId) ?? 0) + a.amount.amountMicros);

  // otwarte faktury pasujące kierunkiem i walutą, zapłacone z ostatnich 180 dni i faktury już przypisane do tej transakcji
  const open = await store.findOpenInvoices();
  const paid = await store.findPaidInvoices(new Date(Date.now() - PAID_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10));
  const listed = [...open, ...paid];
  const assigned = await store.getInvoices([...allocatedByInvoice.keys()].filter((id) => !listed.some((i) => i.id === id)));
  const paidIds = new Set(paid.map((i) => i.id));
  const txAccount = normalizeAccount(transaction.counterpartyAccount);
  const txName = normalizeName(transaction.counterpartyName);

  const candidates = [...listed, ...assigned]
    // korekty in minus (ujemne brutto) też są kandydatami: pomniejszają przelew zbiorczy
    .filter((i) => allocatedByInvoice.has(i.id) || (fitsTransaction(transaction, i) && (i.grossAmount?.amountMicros ?? 0) !== 0))
    .map((i): AllocationCandidate => {
      const allocated = allocatedByInvoice.get(i.id) ?? 0;
      const sameCounterparty =
        (txAccount !== null && normalizeAccount(i.bankAccount) === txAccount) ||
        (txName.length >= 4 && normalizeName(i.counterpartyName) === txName);
      // pozostała kwota nie przechodzi przez zero: dla korekty in minus jest ujemna albo 0
      const unpaid = remainingMicros(i) + allocated;
      const remaining = grossSign(i) < 0 ? Math.min(0, unpaid) : Math.max(0, unpaid);
      return {
        id: i.id,
        name: i.name,
        counterpartyName: i.counterpartyName,
        issueDate: i.issueDate,
        grossMicros: i.grossAmount?.amountMicros ?? 0,
        // paidAmount (suma rozliczeń) zawiera już rozliczenia tej transakcji – oddajemy je do puli
        remainingMicros: remaining,
        allocatedMicros: allocated,
        sameCounterparty,
        alreadyPaid: paidIds.has(i.id),
        sameAmount: Math.abs(remaining - transaction.amount.amountMicros) < AMOUNT_TOLERANCE_MICROS,
      };
    })
    .sort(
      (a, b) =>
        Number(b.allocatedMicros !== 0) - Number(a.allocatedMicros !== 0) ||
        Number(b.sameAmount) - Number(a.sameAmount) ||
        Number(a.alreadyPaid) - Number(b.alreadyPaid) ||
        Number(b.sameCounterparty) - Number(a.sameCounterparty) ||
        (b.issueDate ?? '').localeCompare(a.issueDate ?? ''),
    );

  const { id, name, bookingDate, direction, amount, counterpartyName, remittanceInformation, matchStatus } = transaction;
  const noInvoice = matchStatus === MATCH_STATUS.NO_INVOICE;
  const expenseCategory = noInvoice ? (transaction.expenseCategory ?? null) : null;
  const employeeId = noInvoice ? (transaction.employeeId ?? null) : null;
  const employees = direction === BANK_DIRECTION.DEBIT ? await store.listEmployees() : [];
  const proposal = current.length || noInvoice ? null : propose(transaction, open, paid, employees);
  // proponowana faktura musi być na liście, nawet poza pierwszą setką
  const proposedIds = new Set(proposal?.kind === 'invoices' ? proposal.allocations.map((a) => a.invoiceId) : []);
  const shown = candidates.slice(0, MAX_CANDIDATES);
  for (const c of candidates.slice(MAX_CANDIDATES)) if (proposedIds.has(c.id)) shown.push(c);
  return {
    transaction: {
      id,
      name,
      bookingDate,
      direction,
      amount,
      counterpartyName,
      remittanceInformation,
      matchStatus,
      expenseCategory,
      employeeId,
    },
    candidates: shown,
    employees,
    suggestedEmployeeId: employeeId ?? findEmployeeId(employees, counterpartyName),
    proposal,
  };
};

// Jak przebieg dzienny: najpierw faktury otwarte, potem już zapłacone, na końcu ZUS, podatek albo wynagrodzenie.
const propose = (
  transaction: StoredTransaction,
  open: OpenInvoice[],
  paid: OpenInvoice[],
  employees: Employee[],
): AllocationProposal | null => {
  for (const [invoices, suffix] of [
    [open, ''],
    [paid, '; faktura jest już oznaczona jako zapłacona'],
  ] as const) {
    const match = matchTransaction(transaction, invoices);
    if (match.allocations.length) {
      return {
        kind: 'invoices',
        allocations: match.allocations.map(({ invoiceId, amountMicros }) => ({ invoiceId, amountMicros })),
        note: match.note + suffix,
      };
    }
  }
  const expense = classifyExpense(transaction);
  if (!expense) return null;
  const employeeId = expense.category === EXPENSE_CATEGORY.SALARY ? findEmployeeId(employees, transaction.counterpartyName) : null;
  const employee = employees.find((e) => e.id === employeeId);
  return {
    kind: 'expense',
    category: expense.category,
    employeeId,
    note: `${expenseLabel(expense.category)}${employee?.name ? ` – ${employee.name}` : ''} (${expense.note})`,
  };
};

export type ManualAllocation = { invoiceId: string; amountMicros: number };

// wydatek bez faktury zamiast faktur; pracownik wymagany przy wynagrodzeniu
export type ManualExpense = { category: string; employeeId: string | null };

export const saveManualAllocation = async (
  store: BankStore,
  transactionId: string,
  items: ManualAllocation[],
  expense: ManualExpense | null = null,
) => {
  const transaction = await loadTransaction(store, transactionId);
  if (expense) return saveExpense(store, transaction, items, expense);
  if (items.some((i) => !Number.isFinite(i.amountMicros))) throw new AllocationError('Niepoprawna kwota.');
  // kwota ujemna = korekta in minus pomniejszająca przelew zbiorczy
  const wanted = items.filter((i) => i.amountMicros !== 0);
  if (new Set(wanted.map((i) => i.invoiceId)).size !== wanted.length) {
    throw new AllocationError('Każda faktura może wystąpić tylko raz.');
  }
  const total = wanted.reduce((sum, i) => sum + i.amountMicros, 0);
  if (total > transaction.amount.amountMicros + AMOUNT_TOLERANCE_MICROS) {
    throw new AllocationError('Suma rozliczeń przekracza kwotę transakcji.');
  }
  if (wanted.length && total < 0) {
    throw new AllocationError('Suma rozliczeń nie może być ujemna – korekty muszą pomniejszać faktury z tego przelewu.');
  }

  const invoices = await store.getInvoices(wanted.map((i) => i.invoiceId));
  for (const item of wanted) {
    const invoice = invoices.find((i) => i.id === item.invoiceId);
    if (!invoice) throw new AllocationError('Nie znaleziono faktury.');
    if (!fitsTransaction(transaction, invoice)) {
      throw new AllocationError(`Faktura ${invoice.name ?? ''} nie pasuje kierunkiem albo walutą do transakcji.`);
    }
    if (Math.sign(item.amountMicros) !== grossSign(invoice)) {
      throw new AllocationError(
        grossSign(invoice) < 0
          ? `Korekta ${invoice.name ?? ''} ma ujemne brutto – wpisz kwotę z minusem.`
          : `Faktura ${invoice.name ?? ''} wymaga kwoty dodatniej.`,
      );
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
    expenseCategory: null,
    employeeId: null,
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

const saveExpense = async (
  store: BankStore,
  transaction: StoredTransaction,
  items: ManualAllocation[],
  { category, employeeId }: ManualExpense,
) => {
  if (!Object.values(EXPENSE_CATEGORY).some((c) => c === category)) throw new AllocationError('Nieznany rodzaj wydatku.');
  const salary = category === EXPENSE_CATEGORY.SALARY;
  if (salary && !employeeId) throw new AllocationError('Wybierz pracownika, którego dotyczy wynagrodzenie.');
  const employee = salary ? (await store.listEmployees()).find((e) => e.id === employeeId) : null;
  if (salary && !employee) throw new AllocationError('Nie znaleziono pracownika.');
  if (transaction.direction !== BANK_DIRECTION.DEBIT) throw new AllocationError('Rodzaj wydatku dotyczy tylko wydatków.');
  if (items.some((i) => i.amountMicros !== 0)) {
    throw new AllocationError('Wydatek bez faktury nie może jednocześnie opłacać faktur.');
  }
  const previous = await store.listTransactionAllocations(transaction.id);
  await store.deleteAllocations(previous.map((a) => a.id));
  await store.updateTransaction(transaction.id, {
    matchStatus: MATCH_STATUS.NO_INVOICE,
    matchNote: `Bez faktury: ${expenseLabel(category)}${employee?.name ? ` – ${employee.name}` : ''} (ręcznie)`,
    expenseCategory: category,
    employeeId: employee?.id ?? null,
  });
  const affected = new Set(previous.map((a) => a.invoiceId));
  for (const invoiceId of affected) await recomputeInvoicePayment(store, invoiceId);
  return { allocations: 0, expenseCategory: category, employeeId: employee?.id ?? null, invoicesUpdated: affected.size };
};
