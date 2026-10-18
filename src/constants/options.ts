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

export const ALLOCATION_STATUS = {
  UNASSIGNED: 'UNASSIGNED',
  PARTIAL: 'PARTIAL',
  ASSIGNED: 'ASSIGNED',
} as const;

export const ALLOCATION_STATUS_OPTIONS = [
  { value: ALLOCATION_STATUS.UNASSIGNED, label: 'Nieprzypisana', position: 0, color: 'gray' },
  { value: ALLOCATION_STATUS.PARTIAL, label: 'Częściowo', position: 1, color: 'yellow' },
  { value: ALLOCATION_STATUS.ASSIGNED, label: 'Przypisana', position: 2, color: 'green' },
] as const;
