import type { Direction } from 'src/constants/options';
import type { InvoiceSummary } from 'src/lib/notify/messages';
import type { Currency, InvoiceRecord, LineRecord } from 'src/lib/sync/mapping';

// Dostęp do danych Twenty używany przez synchronizację. Interfejs pozwala testować logikę bez serwera.

export type PendingInvoice = {
  id: string;
  ksefNumber: string;
  direction: Direction;
  issueDate: string | null;
  permanentStorageDate: string | null;
  companyId: string | null;
  paymentStatus: string | null;
  grossAmount: Currency | null;
};

export type StoredXmlInvoice = PendingInvoice & { xmlUrl: string | null };

export type InvoiceUpdate = Partial<{
  saleDate: string | null;
  exchangeRate: number | null;
  netAmountPln: Currency | null;
  correctedKsefNumber: string | null;
  correctedInvoiceId: string | null;
  xmlFile: { fileId: string; label: string }[];
  syncStatus: string;
  syncError: string | null;
  dueDate: string | null;
  dueDateSource: string | null;
  paymentStatus: string;
  paidAt: string | null;
  paidAmount: Currency | null;
  paymentMethod: string | null;
  bankAccount: string | null;
  ksefPaymentId: string | null;
  newInvoiceNotifiedAt: string;
}>;

export type InvoiceStore = {
  findExistingKsefNumbers: (ksefNumbers: string[]) => Promise<Set<string>>;
  createInvoices: (records: InvoiceRecord[]) => Promise<void>;
  findPendingInvoices: (limit: number) => Promise<PendingInvoice[]>;
  // faktury ze statusem COMPLETE i zapisanym XML, stronicowane kursorem
  listInvoicesWithXml: (
    after: string | null,
    limit: number,
  ) => Promise<{ invoices: StoredXmlInvoice[]; nextCursor: string | null }>;
  replaceLines: (invoiceId: string, lines: LineRecord[]) => Promise<void>;
  updateInvoice: (id: string, data: InvoiceUpdate) => Promise<void>;
  findInvoiceIdByKsefNumber: (ksefNumber: string) => Promise<string | null>;
  // null = pole company.nip nie istnieje w workspace (brak dodatku regon-nip)
  findCompanyIdsByNip: (nips: string[]) => Promise<Map<string, string> | null>;
  linkCompanyByNip: (nip: string, companyId: string) => Promise<{ invoices: number; lines: number }>;
  uploadXml: (xml: string, filename: string) => Promise<{ fileId: string; label: string }>;
  // niezapłacone (UNPAID/PARTIAL) faktury obu kierunków z terminem w jednym z podanych dni
  findUnpaidDueOn: (dates: string[]) => Promise<InvoiceSummary[]>;
  // kompletne faktury zakupowe zapisane w KSeF od `since`, jeszcze bez powiadomienia na czat
  findUnnotifiedPurchases: (since: string) => Promise<InvoiceSummary[]>;
};
