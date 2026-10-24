// Wartości pól SELECT współdzielone przez obiekty, widoki i logikę synchronizacji.

export const DIRECTION = { SALE: 'SALE', PURCHASE: 'PURCHASE' } as const;
export type Direction = (typeof DIRECTION)[keyof typeof DIRECTION];

export const DIRECTION_OPTIONS = [
  { value: DIRECTION.SALE, label: 'Sprzedaż', position: 0, color: 'green' },
  { value: DIRECTION.PURCHASE, label: 'Zakup', position: 1, color: 'orange' },
] as const;

// Rodzaje faktur z metadanych KSeF (InvoiceType) zapisane jako SCREAMING_SNAKE_CASE.
export const INVOICE_TYPE_OPTIONS = [
  { value: 'VAT', label: 'Podstawowa', position: 0, color: 'blue' },
  { value: 'KOR', label: 'Korygująca', position: 1, color: 'red' },
  { value: 'ZAL', label: 'Zaliczkowa', position: 2, color: 'sky' },
  { value: 'ROZ', label: 'Rozliczeniowa', position: 3, color: 'iris' },
  { value: 'UPR', label: 'Uproszczona', position: 4, color: 'gray' },
  { value: 'KOR_ZAL', label: 'Korekta zaliczkowej', position: 5, color: 'tomato' },
  { value: 'KOR_ROZ', label: 'Korekta rozliczeniowej', position: 6, color: 'crimson' },
  { value: 'VAT_PEF', label: 'PEF podstawowa', position: 7, color: 'blue' },
  { value: 'VAT_PEF_SP', label: 'PEF specjalizowana', position: 8, color: 'blue' },
  { value: 'KOR_PEF', label: 'PEF korygująca', position: 9, color: 'red' },
  { value: 'VAT_RR', label: 'VAT RR', position: 10, color: 'lime' },
  { value: 'KOR_VAT_RR', label: 'Korekta VAT RR', position: 11, color: 'red' },
] as const;
export type InvoiceType = (typeof INVOICE_TYPE_OPTIONS)[number]['value'];

export const SYNC_STATUS = { PENDING: 'PENDING', COMPLETE: 'COMPLETE', ERROR: 'ERROR' } as const;
export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export const SYNC_STATUS_OPTIONS = [
  { value: SYNC_STATUS.PENDING, label: 'Czeka na XML', position: 0, color: 'yellow' },
  { value: SYNC_STATUS.COMPLETE, label: 'Kompletna', position: 1, color: 'green' },
  { value: SYNC_STATUS.ERROR, label: 'Błąd', position: 2, color: 'red' },
] as const;

// Skąd pochodzi faktura: import z KSeF albo ręczny import pliku z programu księgowego (faktury B2C spoza KSeF).
export const SOURCE = { KSEF: 'KSEF', MANUAL: 'MANUAL' } as const;
export type Source = (typeof SOURCE)[keyof typeof SOURCE];

export const SOURCE_OPTIONS = [
  // etykiety nie zmieniać: id opcji wynika z etykiety, nowa etykieta to nowa opcja dla 54+ faktur z KSeF
  { value: SOURCE.KSEF, label: 'KSeF', position: 0, color: 'blue' },
  { value: SOURCE.MANUAL, label: 'Import manualny', position: 1, color: 'purple' },
] as const;

export const PAYMENT_STATUS = { UNPAID: 'UNPAID', PARTIAL: 'PARTIAL', PAID: 'PAID' } as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_OPTIONS = [
  { value: PAYMENT_STATUS.UNPAID, label: 'Niezapłacona', position: 0, color: 'red' },
  { value: PAYMENT_STATUS.PARTIAL, label: 'Częściowo', position: 1, color: 'yellow' },
  { value: PAYMENT_STATUS.PAID, label: 'Zapłacona', position: 2, color: 'green' },
] as const;

export const DUE_DATE_SOURCE = { INVOICE: 'INVOICE', DESCRIPTION: 'DESCRIPTION' } as const;
export type DueDateSource = (typeof DUE_DATE_SOURCE)[keyof typeof DUE_DATE_SOURCE];

export const DUE_DATE_SOURCE_OPTIONS = [
  { value: DUE_DATE_SOURCE.INVOICE, label: 'Data z faktury', position: 0, color: 'blue' },
  { value: DUE_DATE_SOURCE.DESCRIPTION, label: 'Wyliczony z opisu', position: 1, color: 'sky' },
] as const;

// Kody FormaPlatnosci z FA(3) (1–7) plus "inna" (PlatnoscInna + OpisPlatnosci).
export const PAYMENT_METHOD_BY_CODE: Record<string, string> = {
  '1': 'CASH',
  '2': 'CARD',
  '3': 'VOUCHER',
  '4': 'CHEQUE',
  '5': 'CREDIT',
  '6': 'TRANSFER',
  '7': 'MOBILE',
};

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'TRANSFER', label: 'Przelew', position: 0, color: 'blue' },
  { value: 'CARD', label: 'Karta', position: 1, color: 'purple' },
  { value: 'CASH', label: 'Gotówka', position: 2, color: 'green' },
  { value: 'MOBILE', label: 'Płatność mobilna', position: 3, color: 'cyan' },
  { value: 'CREDIT', label: 'Kredyt', position: 4, color: 'orange' },
  { value: 'VOUCHER', label: 'Bon', position: 5, color: 'amber' },
  { value: 'CHEQUE', label: 'Czek', position: 6, color: 'brown' },
  { value: 'OTHER', label: 'Inna', position: 7, color: 'gray' },
] as const;

export const COST_CATEGORY_OPTIONS = [
  { value: 'SUBCONTRACTOR', label: 'Podwykonawca', position: 0, color: 'purple' },
  { value: 'MATERIAL', label: 'Materiał', position: 1, color: 'amber' },
  { value: 'LICENSE', label: 'Licencja / oprogramowanie', position: 2, color: 'cyan' },
  { value: 'OVERHEAD', label: 'Koszt ogólny', position: 3, color: 'gray' },
  { value: 'OTHER', label: 'Inne', position: 4, color: 'brown' },
] as const;

// Transakcje z wyciągu bankowego (Enable Banking): wpływ albo wydatek, kwota zawsze dodatnia.
export const BANK_DIRECTION = { CREDIT: 'CREDIT', DEBIT: 'DEBIT' } as const;
export type BankDirection = (typeof BANK_DIRECTION)[keyof typeof BANK_DIRECTION];

export const BANK_DIRECTION_OPTIONS = [
  { value: BANK_DIRECTION.CREDIT, label: 'Wpływ', position: 0, color: 'green' },
  { value: BANK_DIRECTION.DEBIT, label: 'Wydatek', position: 1, color: 'orange' },
] as const;

// Jak transakcja została rozliczona; na co poszły pieniądze mówi osobne pole "Cel płatności".
export const MATCH_STATUS = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
  UNMATCHED: 'UNMATCHED',
} as const;
export type MatchStatus = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

export const MATCH_STATUS_OPTIONS = [
  { value: MATCH_STATUS.AUTO, label: 'Dopasowana automatycznie', position: 0, color: 'green' },
  { value: MATCH_STATUS.MANUAL, label: 'Przypisana ręcznie', position: 1, color: 'blue' },
  { value: MATCH_STATUS.UNMATCHED, label: 'Nieprzypisana', position: 2, color: 'yellow' },
] as const;

// Cel płatności rozliczonej transakcji: faktura albo wydatek bez faktury (wynagrodzenie, ZUS, urząd skarbowy).
export const PAYMENT_PURPOSE = { INVOICE: 'INVOICE', SALARY: 'SALARY', ZUS: 'ZUS', TAX: 'TAX' } as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];

export const PAYMENT_PURPOSE_OPTIONS = [
  { value: PAYMENT_PURPOSE.INVOICE, label: 'Faktura', position: 0, color: 'green' },
  { value: PAYMENT_PURPOSE.SALARY, label: 'Wynagrodzenia', position: 1, color: 'blue' },
  { value: PAYMENT_PURPOSE.ZUS, label: 'ZUS', position: 2, color: 'orange' },
  { value: PAYMENT_PURPOSE.TAX, label: 'Urząd skarbowy', position: 3, color: 'red' },
] as const;

// Wydatki bez faktury: cele płatności poza fakturą.
export const EXPENSE_CATEGORY = {
  SALARY: PAYMENT_PURPOSE.SALARY,
  ZUS: PAYMENT_PURPOSE.ZUS,
  TAX: PAYMENT_PURPOSE.TAX,
} as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORY)[keyof typeof EXPENSE_CATEGORY];

export const EXPENSE_CATEGORY_OPTIONS = PAYMENT_PURPOSE_OPTIONS.filter(
  (o): o is Extract<(typeof PAYMENT_PURPOSE_OPTIONS)[number], { value: ExpenseCategory }> => o.value !== PAYMENT_PURPOSE.INVOICE,
);

export const isExpenseCategory = (value: string | null | undefined): value is ExpenseCategory =>
  Object.values(EXPENSE_CATEGORY).some((c) => c === value);

// Skąd pochodzi rozliczenie transakcji z fakturą.
export const ALLOCATION_ORIGIN = { AUTO: 'AUTO', MANUAL: 'MANUAL' } as const;

export const ALLOCATION_ORIGIN_OPTIONS = [
  { value: ALLOCATION_ORIGIN.AUTO, label: 'Automatyczne', position: 0, color: 'green' },
  { value: ALLOCATION_ORIGIN.MANUAL, label: 'Ręczne', position: 1, color: 'blue' },
] as const;
