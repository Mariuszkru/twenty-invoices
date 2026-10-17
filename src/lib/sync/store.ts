import type { Direction } from 'src/constants/options';
import type { InvoiceRecord, LineRecord } from 'src/lib/sync/mapping';

// Dostęp do danych Twenty używany przez synchronizację. Interfejs pozwala testować logikę bez serwera.

export type PendingInvoice = {
  id: string;
  ksefNumber: string;
  direction: Direction;
  issueDate: string | null;
  companyId: string | null;
};

export type InvoiceUpdate = Partial<{
  saleDate: string | null;
  exchangeRate: number | null;
  netAmountPln: { amountMicros: number; currencyCode: string } | null;
  correctedKsefNumber: string | null;
  correctedInvoiceId: string | null;
  xmlFile: { fileId: string; label: string }[];
  syncStatus: string;
  syncError: string | null;
}>;

export type InvoiceStore = {
  findExistingKsefNumbers: (ksefNumbers: string[]) => Promise<Set<string>>;
  createInvoices: (records: InvoiceRecord[]) => Promise<void>;
  findPendingInvoices: (limit: number) => Promise<PendingInvoice[]>;
  replaceLines: (invoiceId: string, lines: LineRecord[]) => Promise<void>;
  updateInvoice: (id: string, data: InvoiceUpdate) => Promise<void>;
  findInvoiceIdByKsefNumber: (ksefNumber: string) => Promise<string | null>;
  // null = pole company.nip nie istnieje w workspace (brak dodatku regon-nip)
  findCompanyIdsByNip: (nips: string[]) => Promise<Map<string, string> | null>;
  linkCompanyByNip: (nip: string, companyId: string) => Promise<{ invoices: number; lines: number }>;
  uploadXml: (xml: string, filename: string) => Promise<{ fileId: string; label: string }>;
};
