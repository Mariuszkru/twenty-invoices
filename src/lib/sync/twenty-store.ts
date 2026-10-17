import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { ID } from 'src/constants/ids';
import { SYNC_STATUS } from 'src/constants/options';
import type { InvoiceStore, PendingInvoice } from 'src/lib/sync/store';

// Twenty ogranicza liczbę rekordów w jednej mutacji – zapisujemy paczkami.
const CHUNK = 50;

const chunks = <T>(items: T[], size = CHUNK): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

type Edges<T> = { edges: { node: T }[] };

const PENDING_INVOICE_SELECTION = {
  id: true,
  ksefNumber: true,
  direction: true,
  issueDate: true,
  permanentStorageDate: true,
  companyId: true,
  paymentStatus: true,
  grossAmount: { amountMicros: true, currencyCode: true },
} as const;

// Klient generowany ze schematu workspace'u jest dostępny dopiero po `twenty dev`; tu wystarcza luźne typowanie.
type LooseClient = { query: (q: unknown) => Promise<any>; mutation: (q: unknown) => Promise<any> };

export const createTwentyStore = (): InvoiceStore => {
  // Synchronizacja działa także z crona (brak osoby) – zawsze uprawnienia aplikacji, żeby wynik nie zależał od wyzwalającego.
  const client = new CoreApiClient({ runAs: 'application' }) as LooseClient;
  const metadata = new MetadataApiClient({ runAs: 'application' });

  return {
    findExistingKsefNumbers: async (ksefNumbers) => {
      const found = new Set<string>();
      for (const part of chunks(ksefNumbers, 200)) {
        const result = await client.query({
          ksefInvoices: {
            __args: { filter: { ksefNumber: { in: part } }, first: part.length },
            edges: { node: { ksefNumber: true } },
          },
        });
        for (const { node } of (result.ksefInvoices as Edges<{ ksefNumber: string }>).edges) {
          found.add(node.ksefNumber);
        }
      }
      return found;
    },

    createInvoices: async (records) => {
      for (const part of chunks(records)) {
        await client.mutation({ createKsefInvoices: { __args: { data: part }, id: true } });
      }
    },

    findPendingInvoices: async (limit) => {
      if (limit <= 0) return [];
      const result = await client.query({
        ksefInvoices: {
          __args: {
            filter: { syncStatus: { eq: SYNC_STATUS.PENDING } },
            orderBy: [{ permanentStorageDate: 'AscNullsLast' }],
            first: limit,
          },
          edges: { node: PENDING_INVOICE_SELECTION },
        },
      });
      return (result.ksefInvoices as Edges<PendingInvoice>).edges.map((e) => e.node);
    },

    listInvoicesWithXml: async (after, limit) => {
      const result = await client.query({
        ksefInvoices: {
          __args: {
            filter: { syncStatus: { eq: SYNC_STATUS.COMPLETE } },
            orderBy: [{ permanentStorageDate: 'AscNullsLast' }],
            first: limit,
            ...(after ? { after } : {}),
          },
          edges: { node: { ...PENDING_INVOICE_SELECTION, xmlFile: { url: true } } },
          pageInfo: { endCursor: true, hasNextPage: true },
        },
      });
      const connection = result.ksefInvoices as Edges<
        PendingInvoice & { xmlFile: { url: string | null }[] | null }
      > & { pageInfo: { endCursor: string | null; hasNextPage: boolean } };
      return {
        invoices: connection.edges.map(({ node: { xmlFile, ...invoice } }) => ({
          ...invoice,
          xmlUrl: xmlFile?.[0]?.url ?? null,
        })),
        nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
      };
    },

    replaceLines: async (invoiceId, lines) => {
      // ponowny import tej samej faktury (np. po przerwanym przebiegu) nie może dublować pozycji
      await client.mutation({
        deleteKsefInvoiceLines: { __args: { filter: { invoiceId: { eq: invoiceId } } }, id: true },
      });
      for (const part of chunks(lines)) {
        await client.mutation({ createKsefInvoiceLines: { __args: { data: part }, id: true } });
      }
    },

    updateInvoice: async (id, data) => {
      await client.mutation({ updateKsefInvoice: { __args: { id, data }, id: true } });
    },

    findInvoiceIdByKsefNumber: async (ksefNumber) => {
      const result = await client.query({
        ksefInvoices: {
          __args: { filter: { ksefNumber: { eq: ksefNumber } }, first: 1 },
          edges: { node: { id: true } },
        },
      });
      return (result.ksefInvoices as Edges<{ id: string }>).edges[0]?.node.id ?? null;
    },

    findCompanyIdsByNip: async (nips) => {
      const map = new Map<string, string>();
      try {
        for (const part of chunks(nips, 200)) {
          const result = await client.query({
            companies: {
              __args: { filter: { nip: { in: part } }, first: 200 },
              edges: { node: { id: true, nip: true } },
            },
          });
          for (const { node } of (result.companies as Edges<{ id: string; nip: string }>).edges) {
            if (!map.has(node.nip)) map.set(node.nip, node.id);
          }
        }
      } catch (e) {
        if (/nip/i.test((e as Error).message ?? '')) return null;
        throw e;
      }
      return map;
    },

    linkCompanyByNip: async (nip, companyId) => {
      const invoices = await client.mutation({
        updateKsefInvoices: {
          __args: {
            filter: { counterpartyTaxId: { eq: nip }, companyId: { is: 'NULL' } },
            data: { companyId },
          },
          id: true,
        },
      });
      const invoiceIds = (invoices.updateKsefInvoices as { id: string }[]).map((r) => r.id);
      let lines = 0;
      for (const part of chunks(invoiceIds, 200)) {
        const result = await client.mutation({
          updateKsefInvoiceLines: {
            __args: {
              filter: { invoiceId: { in: part }, companyId: { is: 'NULL' } },
              data: { companyId },
            },
            id: true,
          },
        });
        lines += (result.updateKsefInvoiceLines as unknown[]).length;
      }
      return { invoices: invoiceIds.length, lines };
    },

    uploadXml: async (xml, filename) => {
      const file = await metadata.uploadFile({
        fileBuffer: Buffer.from(xml, 'utf8'),
        filename,
        fieldMetadataUniversalIdentifier: ID.invXmlFile,
      });
      return { fileId: file.id, label: filename };
    },
  };
};
