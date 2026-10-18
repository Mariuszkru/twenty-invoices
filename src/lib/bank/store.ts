import type { OpenInvoice } from 'src/lib/bank/match';
import type { InvoicePayment } from 'src/lib/bank/payment';
import type { BankTransactionRecord } from 'src/lib/bank/transactions';
import type { Currency } from 'src/lib/sync/mapping';

// Dostęp do danych Twenty używany przez wyciągi bankowe. Interfejs pozwala testować logikę bez serwera.

export type TransactionStatus = {
  matchStatus: string;
  matchNote: string | null;
};

export type StoredTransaction = BankTransactionRecord & TransactionStatus & { id: string };

export type AllocationRecord = {
  transactionId: string;
  invoiceId: string;
  name: string;
  amount: Currency;
  origin: string;
};

export type StoredAllocation = AllocationRecord & { id: string };

export type BankStore = {
  findExistingTransactionIds: (externalIds: string[]) => Promise<Set<string>>;
  // zwraca externalId -> id utworzonych rekordów (potrzebne do rozliczeń)
  createTransactions: (records: (BankTransactionRecord & TransactionStatus)[]) => Promise<Map<string, string>>;
  getTransaction: (id: string) => Promise<StoredTransaction | null>;
  // nieprzypisane transakcje zaksięgowane od `since` – ponowna próba, gdy faktura dotarła później niż przelew
  findUnmatchedTransactions: (since: string) => Promise<StoredTransaction[]>;
  updateTransaction: (id: string, data: Partial<TransactionStatus>) => Promise<void>;
  createAllocations: (records: AllocationRecord[]) => Promise<void>;
  listTransactionAllocations: (transactionId: string) => Promise<StoredAllocation[]>;
  deleteAllocations: (ids: string[]) => Promise<void>;
  // faktury obu kierunków ze statusem Niezapłacona/Częściowo
  findOpenInvoices: () => Promise<OpenInvoice[]>;
  // faktury już zapłacone (wystawione od `since`); paidAmount = suma rozliczeń (bez pominiętych transakcji)
  findPaidInvoices: (since: string) => Promise<OpenInvoice[]>;
  getInvoices: (ids: string[]) => Promise<OpenInvoice[]>;
  getInvoiceGross: (invoiceId: string) => Promise<Currency | null>;
  // rozliczenia faktury z datą księgowania i statusem ich transakcji
  listInvoiceAllocations: (
    invoiceId: string,
  ) => Promise<{ amount: Currency | null; bookingDate: string | null; matchStatus: string | null }[]>;
  updateInvoicePayment: (invoiceId: string, payment: InvoicePayment) => Promise<void>;
};
