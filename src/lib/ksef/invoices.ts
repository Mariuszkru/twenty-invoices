import type { KsefHttpClient } from 'src/lib/ksef/http';

// Metadane faktury z POST /invoices/query/metadata (pola używane przez dodatek).
export type KsefInvoiceMetadata = {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  permanentStorageDate: string;
  seller: { nip: string; name?: string | null };
  buyer: {
    identifier: { type: 'Nip' | 'VatUe' | 'Other' | 'None'; value?: string | null };
    name?: string | null;
  };
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoiceType: string;
  formCode?: { systemCode: string; schemaVersion: string; value: string };
};

type QueryMetadataResponse = {
  hasMore: boolean;
  isTruncated: boolean;
  permanentStorageHwmDate?: string | null;
  invoices: KsefInvoiceMetadata[];
};

export type SubjectType = 'Subject1' | 'Subject2';

const PAGE_SIZE = 250;
// API przyjmuje zakres maks. 100 dni; zostawiamy zapas.
export const MAX_RANGE_MS = 99 * 24 * 60 * 60 * 1000;

export type MetadataBatch = {
  invoices: KsefInvoiceMetadata[];
  // nowy kursor: do tego momentu dane są kompletne (HWM albo koniec okna)
  nextCursor: string;
  // true, gdy okno było przycięte do 99 dni i są jeszcze starsze dane do dogonienia
  hasMoreWindows: boolean;
  requests: number;
};

type FetchMetadataParams = {
  http: KsefHttpClient;
  accessToken: string;
  subjectType: SubjectType;
  from: string;
  now: Date;
  maxRequests: number;
};

// Pobieranie przyrostowe po dacie PermanentStorage, rosnąco, do HWM (pobieranie-faktur/hwm.md, scenariusz 1).
export const fetchMetadataSince = async ({
  http,
  accessToken,
  subjectType,
  from,
  now,
  maxRequests,
}: FetchMetadataParams): Promise<MetadataBatch> => {
  const windowEnd = Math.min(now.getTime(), Date.parse(from) + MAX_RANGE_MS);
  const to = new Date(windowEnd).toISOString();
  const isClipped = windowEnd < now.getTime();

  const invoices: KsefInvoiceMetadata[] = [];
  const seen = new Set<string>();
  let rangeFrom = from;
  let pageOffset = 0;
  let requests = 0;
  let hwm: string | null | undefined;

  while (requests < maxRequests) {
    const params = new URLSearchParams({
      sortOrder: 'Asc',
      pageOffset: String(pageOffset),
      pageSize: String(PAGE_SIZE),
    });
    const response = await http.json<QueryMetadataResponse>(`/invoices/query/metadata?${params}`, {
      method: 'POST',
      bearer: accessToken,
      body: {
        subjectType,
        dateRange: {
          dateType: 'PermanentStorage',
          from: rangeFrom,
          to,
          restrictToPermanentStorageHwmDate: true,
        },
      },
    });
    requests++;
    hwm = response.permanentStorageHwmDate ?? hwm;

    for (const invoice of response.invoices) {
      if (seen.has(invoice.ksefNumber)) continue;
      seen.add(invoice.ksefNumber);
      invoices.push(invoice);
    }

    if (!response.hasMore) {
      return {
        invoices,
        nextCursor: hwm ?? to,
        hasMoreWindows: isClipped,
        requests,
      };
    }
    if (response.isTruncated) {
      // limit 10 000 wyników: zawężamy zakres od daty ostatniego rekordu i zerujemy offset
      const last = response.invoices[response.invoices.length - 1];
      rangeFrom = last?.permanentStorageDate ?? rangeFrom;
      pageOffset = 0;
    } else {
      pageOffset += response.invoices.length;
    }
  }

  // Budżet zapytań wyczerpany w połowie: kursor tylko do ostatniego pobranego rekordu.
  // Rekordy z tą samą datą zostaną pobrane ponownie i odfiltrowane po numerze KSeF.
  const last = invoices[invoices.length - 1];
  return {
    invoices,
    nextCursor: last?.permanentStorageDate ?? from,
    hasMoreWindows: true,
    requests,
  };
};

export const downloadInvoiceXml = (http: KsefHttpClient, accessToken: string, ksefNumber: string) =>
  http.text(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
    bearer: accessToken,
    accept: 'application/xml',
  });
