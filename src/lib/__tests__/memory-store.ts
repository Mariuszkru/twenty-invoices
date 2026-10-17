import { PAYMENT_STATUS } from 'src/constants/options';
import type { InvoiceRecord, LineRecord } from 'src/lib/sync/mapping';
import type { KvStore } from 'src/lib/sync/rate-budget';
import type { InvoiceStore, InvoiceUpdate, PendingInvoice } from 'src/lib/sync/store';

// Pamięciowe odpowiedniki magazynów Twenty dla testów synchronizacji.

export type StoredInvoice = Omit<InvoiceRecord, 'syncStatus'> &
  InvoiceUpdate & { id: string; syncStatus: string };

const toPending = (i: StoredInvoice): PendingInvoice => ({
  id: i.id,
  ksefNumber: i.ksefNumber,
  direction: i.direction,
  issueDate: i.issueDate,
  permanentStorageDate: i.permanentStorageDate,
  companyId: i.companyId,
  paymentStatus: i.paymentStatus ?? PAYMENT_STATUS.UNPAID,
  grossAmount: i.grossAmount,
});

export const createMemoryStore = () => {
  const invoices: StoredInvoice[] = [];
  const lines: LineRecord[] = [];
  const files = new Map<string, string>();
  const companies = new Map([['7740001454', 'company-dostawca']]);
  const byStorageDate = (a: StoredInvoice, b: StoredInvoice) =>
    a.permanentStorageDate.localeCompare(b.permanentStorageDate);

  const store: InvoiceStore = {
    findExistingKsefNumbers: async (nums) =>
      new Set(invoices.filter((i) => nums.includes(i.ksefNumber)).map((i) => i.ksefNumber)),
    createInvoices: async (records) => {
      for (const r of records) {
        if (invoices.some((i) => i.ksefNumber === r.ksefNumber)) throw new Error('duplicate ksefNumber');
        invoices.push({ ...r, id: `inv-${invoices.length + 1}` });
      }
    },
    findPendingInvoices: async (limit) =>
      invoices
        .filter((i) => i.syncStatus === 'PENDING')
        .sort(byStorageDate)
        .slice(0, limit)
        .map(toPending),
    listInvoicesWithXml: async (after, limit) => {
      const complete = invoices.filter((i) => i.syncStatus === 'COMPLETE').sort(byStorageDate);
      const start = after ? Number(after) : 0;
      const page = complete.slice(start, start + limit);
      return {
        invoices: page.map((i) => ({ ...toPending(i), xmlUrl: i.xmlFile?.[0] ? `mem://${i.xmlFile[0].fileId}` : null })),
        nextCursor: start + limit < complete.length ? String(start + limit) : null,
      };
    },
    replaceLines: async (invoiceId, newLines) => {
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i].invoiceId === invoiceId) lines.splice(i, 1);
      lines.push(...newLines);
    },
    updateInvoice: async (id, data) => {
      Object.assign(invoices.find((i) => i.id === id)!, data);
    },
    findInvoiceIdByKsefNumber: async (n) => invoices.find((i) => i.ksefNumber === n)?.id ?? null,
    findCompanyIdsByNip: async (nips) =>
      new Map(nips.filter((n) => companies.has(n)).map((n) => [n, companies.get(n)!])),
    linkCompanyByNip: async () => ({ invoices: 0, lines: 0 }),
    uploadXml: async (xml, filename) => {
      const fileId = `file-${filename}`;
      files.set(fileId, xml);
      return { fileId, label: filename };
    },
  };
  const readFile = async (url: string) => {
    const xml = files.get(url.replace('mem://', ''));
    if (!xml) throw new Error(`brak pliku ${url}`);
    return xml;
  };
  return { store, invoices, lines, files, readFile };
};

export const createMemoryKv = () => {
  const data = new Map<string, unknown>();
  const kv: KvStore = {
    get: async <T>(key: string) => (data.has(key) ? (structuredClone(data.get(key)) as T) : null),
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
  };
  return { kv, data };
};
