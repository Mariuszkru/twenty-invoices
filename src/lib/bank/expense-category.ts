import { BANK_DIRECTION, EXPENSE_CATEGORY, EXPENSE_CATEGORY_OPTIONS, type ExpenseCategory } from 'src/constants/options';
import type { MatchableTransaction } from 'src/lib/bank/match';
import type { Employee } from 'src/lib/bank/store';

// Wydatki bez faktury (status "Bez faktury"): ZUS, podatki i wynagrodzenia. Sprawdzamy dopiero wtedy, gdy przelew
// nie pasuje do żadnej faktury. Rachunki ZUS i urzędów skarbowych to mikrorachunki o stałym numerze rozliczeniowym,
// więc rozpoznajemy je pewnie; wynagrodzenie tylko po słowie w tytule.

export type ExpenseClassification = { category: ExpenseCategory; note: string };

// wielkie litery bez polskich znaków ("ZAKŁAD" -> "ZAKLAD")
const normalize = (text: string | null) =>
  (text ?? '')
    .toUpperCase()
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// 26 cyfr NRB: 2 cyfry kontrolne, 8 cyfr numeru rozliczeniowego banku, reszta to numer rachunku
const nrb = (account: string | null) => {
  const digits = (account ?? '').replace(/^PL/i, '').replace(/\D/g, '');
  return digits.length === 26 ? digits : null;
};

// mikrorachunek ZUS: NBP oddział ZUS 6000 0002 026...
const isZusAccount = (account: string | null) => nrb(account)?.slice(2, 10) === '60000002';
// mikrorachunek podatkowy: NBP 1010 0071 + 222 + identyfikator podatnika
const isTaxAccount = (account: string | null) => nrb(account)?.slice(2, 13) === '10100071222';

export const classifyExpense = (tx: MatchableTransaction): ExpenseClassification | null => {
  if (tx.direction !== BANK_DIRECTION.DEBIT) return null;
  const name = normalize(tx.counterpartyName);
  const title = normalize(tx.remittanceInformation);

  if (isZusAccount(tx.counterpartyAccount)) return { category: EXPENSE_CATEGORY.ZUS, note: 'rachunek ZUS' };
  if (name.includes('ZAKLAD UBEZPIECZEN SPOLECZNYCH')) return { category: EXPENSE_CATEGORY.ZUS, note: 'odbiorca ZUS' };
  if (isTaxAccount(tx.counterpartyAccount)) return { category: EXPENSE_CATEGORY.TAX, note: 'mikrorachunek podatkowy' };
  if (name.includes('URZAD SKARBOWY')) return { category: EXPENSE_CATEGORY.TAX, note: 'odbiorca urząd skarbowy' };
  if (/WYNAGRODZ|PENSJ/.test(title)) return { category: EXPENSE_CATEGORY.SALARY, note: 'wynagrodzenie w tytule' };
  return null;
};

export const expenseLabel = (category: string | null | undefined) =>
  EXPENSE_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category ?? '';

// Pracownik po odbiorcy przelewu: te same słowa imienia i nazwiska w dowolnej kolejności, tylko jednoznaczne trafienie.
const nameKey = (text: string | null) => normalize(text).split(/[^A-Z0-9]+/).filter(Boolean).sort().join(' ');

export const findEmployeeId = (employees: Employee[], counterpartyName: string | null): string | null => {
  const key = nameKey(counterpartyName);
  if (!key.includes(' ')) return null;
  const hits = employees.filter((e) => nameKey(e.name) === key);
  return hits.length === 1 ? hits[0].id : null;
};
