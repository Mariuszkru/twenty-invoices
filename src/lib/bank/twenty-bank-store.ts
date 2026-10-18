import { CoreApiClient } from 'twenty-client-sdk/core';

import { MATCH_STATUS, PAYMENT_STATUS } from 'src/constants/options';
import type { OpenInvoice } from 'src/lib/bank/match';
import type { BankStore, StoredTransaction } from 'src/lib/bank/store';
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
  invoiceId: true,
  matchStatus: true,
  matchNote: true,
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
} as const;

// Pusta waluta w Twenty to amountMicros = null – dla logiki dopasowania to brak kwoty.
const currencyOrNull = (value: { amountMicros: number | null; currencyCode: string } | null): Currency | null =>
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
      for (const part of chunks(records)) {
        await client.mutation({ createBankTransactions: { __args: { data: part }, id: true } });
      }
    },

    findUnmatchedTransactions: async (since) => {
      const rows = await queryAll<StoredTransaction & { amount: { amountMicros: number | null; currencyCode: string } }>(
        'bankTransactions',
        {
          filter: { matchStatus: { eq: MATCH_STATUS.UNMATCHED }, bookingDate: { gte: since } },
          orderBy: [{ bookingDate: 'AscNullsLast' }],
        },
        TRANSACTION_SELECTION,
      );
      return rows.flatMap((t) => {
        const amount = currencyOrNull(t.amount);
        return amount ? [{ ...t, amount }] : [];
      });
    },

    updateTransaction: async (id, data) => {
      await client.mutation({ updateBankTransaction: { __args: { id, data }, id: true } });
    },

    findOpenInvoices: async () => {
      const rows = await queryAll<OpenInvoice>(
        'ksefInvoices',
        { filter: { paymentStatus: { in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL] } } },
        OPEN_INVOICE_SELECTION,
      );
      return rows.map((i) => ({
        ...i,
        grossAmount: currencyOrNull(i.grossAmount),
        paidAmount: currencyOrNull(i.paidAmount),
      }));
    },

    getInvoiceGross: async (invoiceId) => {
      const result = await client.query({
        ksefInvoices: {
          __args: { filter: { id: { eq: invoiceId } }, first: 1 },
          edges: { node: { grossAmount: { amountMicros: true, currencyCode: true } } },
        },
      });
      const node = (result.ksefInvoices as Edges<{ grossAmount: Currency | null }>).edges[0]?.node;
      return currencyOrNull(node?.grossAmount ?? null);
    },

    listInvoiceTransactions: async (invoiceId) => {
      const rows = await queryAll<{
        amount: { amountMicros: number | null; currencyCode: string } | null;
        bookingDate: string | null;
        matchStatus: string | null;
      }>(
        'bankTransactions',
        { filter: { invoiceId: { eq: invoiceId } } },
        { amount: { amountMicros: true, currencyCode: true }, bookingDate: true, matchStatus: true },
      );
      return rows.map((t) => ({ ...t, amount: currencyOrNull(t.amount) }));
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
