import { MATCH_STATUS } from 'src/constants/options';
import { EnableBankingApiError, type EnableBankingClient } from 'src/lib/bank/enablebanking-http';
import type { OpenInvoice } from 'src/lib/bank/match';
import type { InvoicePayment } from 'src/lib/bank/payment';
import type { BankStore, StoredTransaction } from 'src/lib/bank/store';
import type { ApiTransaction } from 'src/lib/bank/transactions';

// Fałszywe API Enable Banking (bez sieci) i magazyn transakcji w pamięci do testów wyciągów.

export type FakeEnableBankingOptions = {
  // transakcje per uid rachunku; strona = `pageSize` transakcji
  transactions?: Record<string, ApiTransaction[]>;
  pageSize?: number;
  aspsps?: { name: string; country: string; maximum_consent_validity?: number; psu_types?: string[] }[];
  failWith?: EnableBankingApiError;
};

export const createFakeEnableBanking = (options: FakeEnableBankingOptions = {}) => {
  const calls: { method: string; path: string; query?: Record<string, string | undefined>; body?: unknown }[] = [];
  const pageSize = options.pageSize ?? 100;

  const client: EnableBankingClient = {
    get: async <T>(path: string, query?: Record<string, string | undefined>) => {
      calls.push({ method: 'GET', path, query });
      if (options.failWith) throw options.failWith;
      if (path === '/aspsps') return { aspsps: options.aspsps ?? [] } as T;
      const match = /^\/accounts\/([^/]+)\/transactions$/.exec(path);
      if (!match) throw new EnableBankingApiError(`nieznana ścieżka ${path}`, 404);
      const all = (options.transactions?.[decodeURIComponent(match[1])] ?? []).filter((t) => {
        const date = t.booking_date ?? t.value_date ?? '';
        return (!query?.date_from || date >= query.date_from) && (!query?.date_to || date <= query.date_to);
      });
      const start = Number(query?.continuation_key ?? 0);
      const next = start + pageSize;
      return {
        transactions: all.slice(start, next),
        continuation_key: next < all.length ? String(next) : null,
      } as T;
    },
    post: async <T>(path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body });
      if (options.failWith) throw options.failWith;
      if (path === '/auth') return { url: 'https://bank.example/login?x=1', authorization_id: 'auth-1' } as T;
      if (path === '/sessions') {
        return {
          session_id: 'session-1',
          accounts: [{ uid: 'acc-1', account_id: { iban: 'PL61109010140000071219812874' }, currency: 'PLN' }],
          aspsp: { name: 'mBank', country: 'PL' },
          psu_type: 'business',
          access: { valid_until: '2027-04-16T08:00:00Z' },
        } as T;
      }
      throw new EnableBankingApiError(`nieznana ścieżka ${path}`, 404);
    },
  };
  return { client, calls };
};

export const apiTransaction = (overrides: Partial<ApiTransaction> & { amount?: string }): ApiTransaction => {
  const { amount = '100.00', ...rest } = overrides;
  return {
    entry_reference: 'ref-1',
    transaction_amount: { amount, currency: 'PLN' },
    credit_debit_indicator: 'CRDT',
    status: 'BOOK',
    booking_date: '2026-10-16',
    value_date: '2026-10-16',
    remittance_information: ['Przelew'],
    debtor: { name: 'Klient S.A.' },
    debtor_account: { iban: 'PL27114020040000300201355387' },
    creditor: { name: 'Recoop' },
    creditor_account: { iban: 'PL61109010140000071219812874' },
    ...rest,
  };
};

export type MemoryInvoice = OpenInvoice & { paymentStatus: string; paidAt: string | null };

export const createMemoryBankStore = (invoices: MemoryInvoice[]) => {
  const transactions: StoredTransaction[] = [];

  const store: BankStore = {
    findExistingTransactionIds: async (ids) =>
      new Set(transactions.filter((t) => ids.includes(t.externalId)).map((t) => t.externalId)),
    createTransactions: async (records) => {
      for (const r of records) {
        if (transactions.some((t) => t.externalId === r.externalId)) throw new Error('duplicate externalId');
        transactions.push({ ...r, id: `tx-${transactions.length + 1}` });
      }
    },
    findUnmatchedTransactions: async (since) =>
      transactions.filter((t) => t.matchStatus === MATCH_STATUS.UNMATCHED && (t.bookingDate ?? '') >= since),
    updateTransaction: async (id, data) => {
      Object.assign(transactions.find((t) => t.id === id)!, data);
    },
    findOpenInvoices: async () =>
      invoices.filter((i) => i.paymentStatus !== 'PAID').map((i) => structuredClone(i)),
    getInvoiceGross: async (id) => invoices.find((i) => i.id === id)?.grossAmount ?? null,
    listInvoiceTransactions: async (id) =>
      transactions
        .filter((t) => t.invoiceId === id)
        .map((t) => ({ amount: t.amount, bookingDate: t.bookingDate, matchStatus: t.matchStatus })),
    updateInvoicePayment: async (id, payment: InvoicePayment) => {
      Object.assign(invoices.find((i) => i.id === id)!, payment);
    },
  };
  return { store, transactions, invoices };
};

export const openInvoice = (overrides: Partial<MemoryInvoice>): MemoryInvoice => ({
  id: 'inv-1',
  name: 'FV/10/2026/001',
  ksefNumber: null,
  ksefPaymentId: null,
  direction: 'SALE',
  grossAmount: { amountMicros: 1_230_000_000, currencyCode: 'PLN' },
  paidAmount: null,
  bankAccount: null,
  counterpartyName: 'Klient S.A.',
  paymentStatus: 'UNPAID',
  paidAt: null,
  ...overrides,
});
