import type { OpenInvoice } from 'src/lib/bank/match';
import type { InvoicePayment } from 'src/lib/bank/payment';
import type { BankTransactionRecord } from 'src/lib/bank/transactions';
import type { Currency } from 'src/lib/sync/mapping';

// Dostęp do danych Twenty używany przez wyciągi bankowe. Interfejs pozwala testować logikę bez serwera.

export type TransactionMatch = {
  invoiceId: string | null;
  matchStatus: string;
  matchNote: string | null;
};

export type StoredTransaction = BankTransactionRecord & TransactionMatch & { id: string };

export type BankStore = {
  findExistingTransactionIds: (externalIds: string[]) => Promise<Set<string>>;
  createTransactions: (records: (BankTransactionRecord & TransactionMatch)[]) => Promise<void>;
  // nieprzypisane transakcje zaksięgowane od `since` – ponowna próba, gdy faktura dotarła później niż przelew
  findUnmatchedTransactions: (since: string) => Promise<StoredTransaction[]>;
  updateTransaction: (id: string, data: Partial<TransactionMatch>) => Promise<void>;
  // faktury obu kierunków ze statusem Niezapłacona/Częściowo
  findOpenInvoices: () => Promise<OpenInvoice[]>;
  // faktury już zapłacone (wystawione od `since`); paidAmount = suma przypiętych transakcji (bez pominiętych)
  findPaidInvoices: (since: string) => Promise<OpenInvoice[]>;
  getInvoiceGross: (invoiceId: string) => Promise<Currency | null>;
  listInvoiceTransactions: (
    invoiceId: string,
  ) => Promise<{ amount: Currency | null; bookingDate: string | null; matchStatus: string | null }[]>;
  updateInvoicePayment: (invoiceId: string, payment: InvoicePayment) => Promise<void>;
};
