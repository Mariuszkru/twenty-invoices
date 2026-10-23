import { CoreApiClient } from 'twenty-client-sdk/core';

import { ALLOCATION_STATUS } from 'src/constants/options';
import { currencyOrNull, type RawCurrency } from 'src/lib/bank/twenty-bank-store';
import type { CandidateLine, ProjectOption, ProjectStore, StoredEntry } from 'src/lib/projects/store';
import type { Currency } from 'src/lib/sync/mapping';
import { chunks, type Edges, type LooseClient } from 'src/lib/sync/twenty-store';

const PAGE = 200;

const MONEY = { amountMicros: true, currencyCode: true } as const;

const ENTRY_SELECTION = {
  id: true,
  name: true,
  projectId: true,
  invoiceLineId: true,
  invoiceId: true,
  entryType: true,
  amount: MONEY,
  amountPln: MONEY,
  issue: true,
} as const;

// pole nazywa się entryType, bo `type` jest nazwą zarezerwowaną w Twenty
type RawEntry = Omit<StoredEntry, 'type' | 'amount' | 'amountPln'> & {
  entryType: StoredEntry['type'];
  amount: RawCurrency;
  amountPln: RawCurrency;
};

const toEntry = ({ entryType, ...e }: RawEntry): StoredEntry => ({
  ...e,
  type: entryType,
  name: e.name || null,
  amount: currencyOrNull(e.amount),
  amountPln: currencyOrNull(e.amountPln),
});

// pusta waluta w Twenty: amountMicros null
const writeMoney = (value: Currency | null | undefined) =>
  value === undefined ? undefined : (value ?? { amountMicros: null, currencyCode: 'PLN' });

// pola niezmieniane nie trafiają do mutacji
const definedOnly = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

const LINE_SELECTION = {
  id: true,
  name: true,
  invoiceId: true,
  direction: true,
  issueDate: true,
  netAmount: MONEY,
  isBeforeCorrection: true,
  marginEffectPln: MONEY,
  invoice: { name: true, counterpartyName: true },
} as const;

type RawLine = Omit<CandidateLine, 'netAmount' | 'marginEffectPln' | 'invoiceName' | 'counterpartyName'> & {
  netAmount: RawCurrency;
  marginEffectPln: RawCurrency;
  invoice: { name: string | null; counterpartyName: string | null } | null;
};

// wyszukiwanie: tyle ostatnich pasujących faktur, a bez frazy – tyle ostatnich nieprzypisanych pozycji
const SEARCH_INVOICES = 30;
const RECENT_LINES = 50;

type Connection<T> = Edges<T> & { pageInfo: { endCursor: string | null; hasNextPage: boolean } };

export const createTwentyProjectStore = (): ProjectStore => {
  // przeliczenia zapisują pola tylko dla aplikacji (writability APPLICATION) – zawsze uprawnienia aplikacji
  const client = new CoreApiClient({ runAs: 'application' }) as LooseClient;

  const listEntries = async (filter: Record<string, unknown>): Promise<StoredEntry[]> => {
    const items: StoredEntry[] = [];
    let after: string | null = null;
    do {
      const result = await client.query({
        projectEntries: {
          __args: { filter, first: PAGE, ...(after ? { after } : {}) },
          edges: { node: ENTRY_SELECTION },
          pageInfo: { endCursor: true, hasNextPage: true },
        },
      });
      const connection = result.projectEntries as Connection<RawEntry>;
      items.push(...connection.edges.map((e) => toEntry(e.node)));
      after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    } while (after);
    return items;
  };

  const queryLines = async (
    filter: Record<string, unknown>,
    first: number,
    orderBy?: Record<string, string>[],
  ): Promise<CandidateLine[]> => {
    const result = await client.query({
      ksefInvoiceLines: {
        __args: { filter, first, ...(orderBy ? { orderBy } : {}) },
        edges: { node: LINE_SELECTION },
      },
    });
    return (result.ksefInvoiceLines as Edges<RawLine>).edges.map(({ node: { invoice, ...line } }) => ({
      ...line,
      isBeforeCorrection: !!line.isBeforeCorrection,
      invoiceName: invoice?.name ?? null,
      counterpartyName: invoice?.counterpartyName ?? null,
      netAmount: currencyOrNull(line.netAmount),
      marginEffectPln: currencyOrNull(line.marginEffectPln),
    }));
  };

  return {
    getEntry: async (id) => (await listEntries({ id: { eq: id } }))[0] ?? null,

    listProjectEntries: (projectId) => listEntries({ projectId: { eq: projectId } }),

    listLineEntries: (lineId) => listEntries({ invoiceLineId: { eq: lineId } }),

    updateEntry: async (id, { type, ...data }) => {
      await client.mutation({
        updateProjectEntry: {
          __args: {
            id,
            data: definedOnly({
              ...data,
              entryType: type,
              amount: writeMoney(data.amount),
              amountPln: writeMoney(data.amountPln),
            }),
          },
          id: true,
        },
      });
    },

    getLine: async (id) => (await queryLines({ id: { eq: id } }, 1))[0] ?? null,

    searchLines: async (query) => {
      if (!query) {
        // bez wyszukiwania: ostatnie pozycje jeszcze nie w pełni przypisane do projektów
        return queryLines(
          { allocationStatus: { in: [ALLOCATION_STATUS.UNASSIGNED, ALLOCATION_STATUS.PARTIAL] } },
          RECENT_LINES,
          [{ issueDate: 'DescNullsLast' }],
        );
      }
      const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const result = await client.query({
        ksefInvoices: {
          __args: {
            filter: {
              or: [{ name: { ilike: pattern } }, { counterpartyName: { ilike: pattern } }, { ksefNumber: { ilike: pattern } }],
            },
            orderBy: [{ issueDate: 'DescNullsLast' }],
            first: SEARCH_INVOICES,
          },
          edges: { node: { id: true } },
        },
      });
      const invoiceIds = (result.ksefInvoices as Edges<{ id: string }>).edges.map((e) => e.node.id);
      return invoiceIds.length ? queryLines({ invoiceId: { in: invoiceIds } }, PAGE) : [];
    },

    listEntriesForLines: async (lineIds) => {
      const entries: StoredEntry[] = [];
      for (const part of chunks(lineIds, PAGE)) entries.push(...(await listEntries({ invoiceLineId: { in: part } })));
      return entries;
    },

    listProjects: async () => {
      const result = await client.query({
        projects: {
          __args: { orderBy: [{ name: 'AscNullsLast' }], first: PAGE },
          edges: { node: { id: true, name: true, clientName: true, status: true } },
        },
      });
      return (result.projects as Edges<ProjectOption>).edges.map(({ node }) => ({
        ...node,
        name: node.name || null,
        clientName: node.clientName || null,
      }));
    },

    createEntry: async ({ type, amount, ...data }) => {
      const result = await client.mutation({
        createProjectEntry: { __args: { data: { ...data, entryType: type, amount } }, id: true },
      });
      return (result.createProjectEntry as { id: string }).id;
    },

    updateLineAllocationStatus: async (id, status) => {
      await client.mutation({ updateKsefInvoiceLine: { __args: { id, data: { allocationStatus: status } }, id: true } });
    },

    getProject: async (id) => {
      const result = await client.query({
        projects: {
          __args: { filter: { id: { eq: id } }, first: 1 },
          edges: {
            node: {
              id: true,
              companyId: true,
              personId: true,
              company: { name: true },
              person: { name: { firstName: true, lastName: true } },
            },
          },
        },
      });
      type RawProject = {
        id: string;
        companyId: string | null;
        personId: string | null;
        company: { name: string | null } | null;
        person: { name: { firstName: string | null; lastName: string | null } | null } | null;
      };
      const node = (result.projects as Edges<RawProject>).edges[0]?.node;
      if (!node) return null;
      const personName = [node.person?.name?.firstName, node.person?.name?.lastName].filter(Boolean).join(' ');
      return {
        id: node.id,
        companyId: node.companyId,
        personId: node.personId,
        companyName: node.company?.name || null,
        personName: personName || null,
      };
    },

    updateProject: async (id, data) => {
      await client.mutation({
        updateProject: {
          __args: {
            id,
            data: definedOnly({
              ...data,
              revenuePln: writeMoney(data.revenuePln),
              costPln: writeMoney(data.costPln),
              marginPln: writeMoney(data.marginPln),
            }),
          },
          id: true,
        },
      });
    },
  };
};
