import { CoreApiClient } from 'twenty-client-sdk/core';

import { MATCH_STATUS, PAYMENT_STATUS } from 'src/constants/options';
import type { OpenInvoice } from 'src/lib/bank/match';
import type { BankStore, StoredAllocation, StoredTransaction } from 'src/lib/bank/store';
import type { Currency } from 'src/lib/sync/mapping';
import { chunks, type Edges, type LooseClient } from 'src/lib/sync/twenty-store';

const PAGE = 200;

const TRANSACTION_SELECTION = {
  id: true,
  externalId: true,
  name: true,
  bookingDate: true,
  valueDate: true,
  direction: true,
  amount: { amountMicros: true, currencyCode: true },
  counterpartyName: true,
  counterpartyAccount: true,
  remittanceInformation: true,
  accountIban: true,
  matchStatus: true,
  matchNote: true,
  expenseCategory: true,
} as const;

const OPEN_INVOICE_SELECTION = {
  id: true,
  name: true,
  ksefNumber: true,
  ksefPaymentId: true,
  direction: true,
  grossAmount: { amountMicros: true, currencyCode: true },
  paidAmount: { amountMicros: true, currencyCode: true },
  bankAccount: true,
  counterpartyName: true,
  issueDate: true,
} as const;

type RawCurrency = { amountMicros: number | null; currencyCode: string } | null;

// Pusta waluta w Twenty to amountMicros = null – dla logiki dopasowania to brak kwoty.
const currencyOrNull = (value: RawCurrency): Currency | null =>
  value && value.amountMicros !== null ? { amountMicros: Number(value.amountMicros), currencyCode: value.currencyCode } : null;

type Connection<T> = Edges<T> & { pageInfo: { endCursor: string | null; hasNextPage: boolean } };

export const createTwentyBankStore = (): BankStore => {
  // cron działa bez osoby – zawsze uprawnienia aplikacji
  const client = new CoreApiClient({ runAs: 'application' }) as LooseClient;

  const queryAll = async <T>(objectName: string, args: Record<string, unknown>, node: unknown): Promise<T[]> => {
    const items: T[] = [];
    let after: string | null = null;
    do {
      const result = await client.query({
        [objectName]: {
          __args: { ...args, first: PAGE, ...(after ? { after } : {}) },
          edges: { node },
          pageInfo: { endCursor: true, hasNextPage: true },
        },
      });
      const connection = result[objectName] as Connection<T>;
      items.push(...connection.edges.map((e) => e.node));
      after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    } while (after);
    return items;
  };

  const toTransaction = (t: StoredTransaction & { amount: RawCurrency }): StoredTransaction | null => {
    const amount = currencyOrNull(t.amount);
    return amount ? { ...t, amount } : null;
  };

  // suma rozliczeń per faktura, bez transakcji oznaczonych jako pominięte
  const allocatedByInvoice = async (invoiceIds: string[]) => {
    const totals = new Map<string, number>();
    for (const part of chunks(invoiceIds, PAGE)) {
      const rows = await queryAll<{ invoiceId: string; amount: RawCurrency; transaction: { matchStatus: string | null } | null }>(
        'paymentAllocations',
        { filter: { invoiceId: { in: part } } },
        { invoiceId: true, amount: { amountMicros: true, currencyCode: true }, transaction: { matchStatus: true } },
      );
      for (const a of rows) {
        if (a.transaction?.matchStatus === MATCH_STATUS.IGNORED) continue;
        totals.set(a.invoiceId, (totals.get(a.invoiceId) ?? 0) + (currencyOrNull(a.amount)?.amountMicros ?? 0));
      }
    }
    return totals;
  };

  // paidAmount do dopasowania = suma rozliczeń z wyciągu, a nie pole faktury: to pole bywa wypełnione z FA(3)
  // (faktura opłacona z góry) albo ręcznie i wtedy blokowałoby przypięcie przelewu
  const withAllocatedAmount = async (rows: OpenInvoice[]): Promise<OpenInvoice[]> => {
    const allocated = await allocatedByInvoice(rows.map((r) => r.id));
    return rows.map((i) => {
      const grossAmount = currencyOrNull(i.grossAmount);
      const paid = allocated.get(i.id);
      return {
        ...i,
        grossAmount,
        paidAmount: paid && grossAmount ? { amountMicros: paid, currencyCode: grossAmount.currencyCode } : null,
      };
    });
  };

  return {
    findExistingTransactionIds: async (externalIds) => {
      const found = new Set<string>();
      for (const part of chunks(externalIds, PAGE)) {
        const result = await client.query({
          bankTransactions: {
            __args: { filter: { externalId: { in: part } }, first: part.length },
            edges: { node: { externalId: true } },
          },
        });
        for (const { node } of (result.bankTransactions as Edges<{ externalId: string }>).edges) {
          found.add(node.externalId);
        }
      }
      return found;
    },

    createTransactions: async (records) => {
      const ids = new Map<string, string>();
      for (const part of chunks(records)) {
        const result = await client.mutation({
          createBankTransactions: { __args: { data: part }, id: true, externalId: true },
        });
        for (const row of result.createBankTransactions as { id: string; externalId: string }[]) {
          ids.set(row.externalId, row.id);
        }
      }
      return ids;
    },

    getTransaction: async (id) => {
      const result = await client.query({
        bankTransactions: {
          __args: { filter: { id: { eq: id } }, first: 1 },
          edges: { node: TRANSACTION_SELECTION },
        },
      });
      const node = (result.bankTransactions as Edges<StoredTransaction & { amount: RawCurrency }>).edges[0]?.node;
      return node ? toTransaction(node) : null;
    },

    findUnmatchedTransactions: async (since) => {
      const rows = await queryAll<StoredTransaction & { amount: RawCurrency }>(
        'bankTransactions',
        {
          filter: { matchStatus: { eq: MATCH_STATUS.UNMATCHED }, bookingDate: { gte: since } },
          orderBy: [{ bookingDate: 'AscNullsLast' }],
        },
        TRANSACTION_SELECTION,
      );
      return rows.flatMap((t) => toTransaction(t) ?? []);
    },

    updateTransaction: async (id, data) => {
      await client.mutation({ updateBankTransaction: { __args: { id, data }, id: true } });
    },

    createAllocations: async (records) => {
      for (const part of chunks(records)) {
        await client.mutation({ createPaymentAllocations: { __args: { data: part }, id: true } });
      }
    },

    listTransactionAllocations: async (transactionId) => {
      const rows = await queryAll<StoredAllocation & { amount: RawCurrency }>(
        'paymentAllocations',
        { filter: { transactionId: { eq: transactionId } } },
        { id: true, transactionId: true, invoiceId: true, name: true, amount: { amountMicros: true, currencyCode: true }, origin: true },
      );
      return rows.flatMap((a) => {
        const amount = currencyOrNull(a.amount);
        return amount ? [{ ...a, amount }] : [];
      });
    },

    deleteAllocations: async (ids) => {
      for (const part of chunks(ids)) {
        await client.mutation({ destroyPaymentAllocations: { __args: { filter: { id: { in: part } } }, id: true } });
      }
    },

    findOpenInvoices: async () =>
      withAllocatedAmount(
        await queryAll<OpenInvoice>(
          'ksefInvoices',
          { filter: { paymentStatus: { in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL] } } },
          OPEN_INVOICE_SELECTION,
        ),
      ),

    findPaidInvoices: async (since) =>
      withAllocatedAmount(
        await queryAll<OpenInvoice>(
          'ksefInvoices',
          { filter: { paymentStatus: { eq: PAYMENT_STATUS.PAID }, issueDate: { gte: since } } },
          OPEN_INVOICE_SELECTION,
        ),
      ),

    getInvoices: async (ids) => {
      if (ids.length === 0) return [];
      const rows = await queryAll<OpenInvoice>('ksefInvoices', { filter: { id: { in: ids } } }, OPEN_INVOICE_SELECTION);
      return rows.map((i) => ({ ...i, grossAmount: currencyOrNull(i.grossAmount), paidAmount: currencyOrNull(i.paidAmount) }));
    },

    getInvoiceGross: async (invoiceId) => {
      const result = await client.query({
        ksefInvoices: {
          __args: { filter: { id: { eq: invoiceId } }, first: 1 },
          edges: { node: { grossAmount: { amountMicros: true, currencyCode: true } } },
        },
      });
      const node = (result.ksefInvoices as Edges<{ grossAmount: RawCurrency }>).edges[0]?.node;
      return currencyOrNull(node?.grossAmount ?? null);
    },

    listInvoiceAllocations: async (invoiceId) => {
      const rows = await queryAll<{
        amount: RawCurrency;
        transaction: { bookingDate: string | null; matchStatus: string | null } | null;
      }>(
        'paymentAllocations',
        { filter: { invoiceId: { eq: invoiceId } } },
        { amount: { amountMicros: true, currencyCode: true }, transaction: { bookingDate: true, matchStatus: true } },
      );
      return rows.map((a) => ({
        amount: currencyOrNull(a.amount),
        bookingDate: a.transaction?.bookingDate ?? null,
        matchStatus: a.transaction?.matchStatus ?? null,
      }));
    },

    updateInvoicePayment: async (invoiceId, payment) => {
      await client.mutation({
        updateKsefInvoice: {
          __args: {
            id: invoiceId,
            // pusta waluta w Twenty: amountMicros null
            data: { ...payment, paidAmount: payment.paidAmount ?? { amountMicros: null, currencyCode: 'PLN' } },
          },
          id: true,
        },
      });
    },
  };
};
