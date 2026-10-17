import { describe, expect, it } from 'vitest';

import type { KsefHttpClient, KsefRequestOptions } from 'src/lib/ksef/http';
import { fetchMetadataSince, MAX_RANGE_MS, type KsefInvoiceMetadata } from 'src/lib/ksef/invoices';

const invoice = (n: number, date: string) =>
  ({ ksefNumber: `K-${n}`, permanentStorageDate: date }) as KsefInvoiceMetadata;

type Page = { hasMore: boolean; isTruncated: boolean; permanentStorageHwmDate?: string; invoices: KsefInvoiceMetadata[] };

const scripted = (pages: Page[]) => {
  const requests: { path: string; body: any }[] = [];
  const http: KsefHttpClient = {
    json: async <T>(path: string, options?: KsefRequestOptions) => {
      requests.push({ path, body: options?.body });
      const page = pages.shift();
      if (!page) throw new Error('za dużo zapytań');
      return page as T;
    },
    text: async () => '',
  };
  return { http, requests };
};

const NOW = new Date('2026-10-17T08:00:00Z');

describe('fetchMetadataSince', () => {
  it('stronicuje po pageOffset i kończy kursorem HWM', async () => {
    const { http, requests } = scripted([
      { hasMore: true, isTruncated: false, permanentStorageHwmDate: '2026-10-17T07:55:00Z', invoices: [invoice(1, '2026-10-01T00:00:00Z'), invoice(2, '2026-10-02T00:00:00Z')] },
      { hasMore: false, isTruncated: false, permanentStorageHwmDate: '2026-10-17T07:55:00Z', invoices: [invoice(3, '2026-10-03T00:00:00Z')] },
    ]);

    const batch = await fetchMetadataSince({ http, accessToken: 'A', subjectType: 'Subject1', from: '2026-09-30T00:00:00Z', now: NOW, maxRequests: 4 });

    expect(batch).toMatchObject({ nextCursor: '2026-10-17T07:55:00Z', hasMoreWindows: false, requests: 2 });
    expect(batch.invoices.map((i) => i.ksefNumber)).toEqual(['K-1', 'K-2', 'K-3']);
    expect(requests[1].path).toContain('pageOffset=2');
    expect(requests[0].body.dateRange).toMatchObject({ dateType: 'PermanentStorage', restrictToPermanentStorageHwmDate: true });
  });

  it('po obcięciu do 10 000 zawęża zakres od ostatniej daty i usuwa duplikaty', async () => {
    const { http, requests } = scripted([
      { hasMore: true, isTruncated: true, invoices: [invoice(1, '2026-10-01T00:00:00Z'), invoice(2, '2026-10-05T00:00:00Z')] },
      { hasMore: false, isTruncated: false, permanentStorageHwmDate: '2026-10-17T07:55:00Z', invoices: [invoice(2, '2026-10-05T00:00:00Z'), invoice(3, '2026-10-06T00:00:00Z')] },
    ]);

    const batch = await fetchMetadataSince({ http, accessToken: 'A', subjectType: 'Subject2', from: '2026-09-30T00:00:00Z', now: NOW, maxRequests: 4 });

    expect(batch.invoices.map((i) => i.ksefNumber)).toEqual(['K-1', 'K-2', 'K-3']);
    expect(requests[1].path).toContain('pageOffset=0');
    expect(requests[1].body.dateRange.from).toBe('2026-10-05T00:00:00Z');
  });

  it('okno dłuższe niż 99 dni jest przycinane, a reszta zostaje na kolejny przebieg', async () => {
    const from = '2026-01-01T00:00:00Z';
    const { http, requests } = scripted([{ hasMore: false, isTruncated: false, permanentStorageHwmDate: undefined, invoices: [] }]);

    const batch = await fetchMetadataSince({ http, accessToken: 'A', subjectType: 'Subject1', from, now: NOW, maxRequests: 4 });

    const expectedTo = new Date(Date.parse(from) + MAX_RANGE_MS).toISOString();
    expect(requests[0].body.dateRange.to).toBe(expectedTo);
    expect(batch).toMatchObject({ nextCursor: expectedTo, hasMoreWindows: true });
  });

  it('po wyczerpaniu budżetu zapytań kursor staje na ostatnim pobranym rekordzie', async () => {
    const { http } = scripted([
      { hasMore: true, isTruncated: false, invoices: [invoice(1, '2026-10-01T00:00:00Z'), invoice(2, '2026-10-02T00:00:00Z')] },
    ]);

    const batch = await fetchMetadataSince({ http, accessToken: 'A', subjectType: 'Subject1', from: '2026-09-30T00:00:00Z', now: NOW, maxRequests: 1 });

    expect(batch).toMatchObject({ nextCursor: '2026-10-02T00:00:00Z', hasMoreWindows: true, requests: 1 });
  });
});
