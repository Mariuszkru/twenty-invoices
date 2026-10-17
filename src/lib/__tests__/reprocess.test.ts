import { describe, expect, it } from 'vitest';

import { DIRECTION } from 'src/constants/options';
import type { KsefInvoiceMetadata } from 'src/lib/ksef/invoices';
import { invoiceFromMetadata } from 'src/lib/sync/mapping';
import { reprocessStoredXml } from 'src/lib/sync/reprocess';
import { fixture } from 'src/lib/__tests__/fixtures';
import { createMemoryStore } from 'src/lib/__tests__/memory-store';

const meta = (n: number, overrides: Partial<KsefInvoiceMetadata> = {}): KsefInvoiceMetadata => ({
  ksefNumber: `7740001454-20261001-00000000000${n}-0${n}`,
  invoiceNumber: `FV/${n}`,
  issueDate: '2026-10-01',
  permanentStorageDate: `2026-10-0${n}T10:00:00Z`,
  seller: { nip: '7740001454', name: 'Dostawca' },
  buyer: { identifier: { type: 'Nip', value: '5260250274' }, name: 'Recoop' },
  netAmount: 1500,
  grossAmount: 1845,
  vatAmount: 345,
  currency: 'PLN',
  invoiceType: 'Vat',
  ...overrides,
});

// Stan jak po imporcie starszą wersją: faktura COMPLETE z zapisanym XML, ale bez pól płatności i z zerowymi pozycjami.
const seed = async () => {
  const memory = createMemoryStore();
  await memory.store.createInvoices([1, 2, 3].map((n) => invoiceFromMetadata(meta(n), DIRECTION.PURCHASE, null)));
  const [a, b, c] = memory.invoices;
  const fileA = await memory.store.uploadXml(fixture('fa3-vat-pln.xml'), 'a.xml');
  const fileB = await memory.store.uploadXml(fixture('fa3-gross-pln.xml'), 'b.xml');
  Object.assign(a, { syncStatus: 'COMPLETE', xmlFile: [fileA] });
  Object.assign(b, { syncStatus: 'COMPLETE', xmlFile: [fileB], paymentStatus: 'PAID' });
  Object.assign(c, { syncStatus: 'COMPLETE' }); // XML nie zapisał się (stary błąd uprawnień)
  return memory;
};

describe('reprocessStoredXml', () => {
  it('uzupełnia płatności i pozycje z zapisanego XML, bez pobierania z KSeF', async () => {
    const memory = await seed();
    const deps = { store: memory.store, nbpRate: async () => null, readXml: memory.readFile };

    const first = await reprocessStoredXml(deps, { after: null, limit: 2 });
    const second = await reprocessStoredXml(deps, { after: first.nextCursor, limit: 2 });

    expect(first).toMatchObject({ processed: 2, failed: 0, queuedForDownload: 0 });
    expect(second).toMatchObject({ processed: 0, queuedForDownload: 1, nextCursor: null });

    const [a, b, c] = memory.invoices;
    expect(a).toMatchObject({
      dueDate: '2026-10-15',
      dueDateSource: 'INVOICE',
      paymentMethod: 'TRANSFER',
      bankAccount: '12102010260000123456789012',
      paymentStatus: 'UNPAID',
    });
    // status ustawiony ręcznie / z banku nie jest cofany
    expect(b.paymentStatus).toBe('PAID');
    // brak XML -> ponowne pobranie z KSeF w kolejnej synchronizacji
    expect(c.syncStatus).toBe('PENDING');

    // pozycje faktury liczonej od brutto mają już netto
    const bLines = memory.lines.filter((l) => l.invoiceId === b.id);
    expect(bLines[0].netAmount?.amountMicros).toBe(1_910_560_000);
  });

  it('błąd odczytu XML zapisuje komunikat i nie przerywa reszty', async () => {
    const memory = await seed();
    const deps = {
      store: memory.store,
      nbpRate: async () => null,
      readXml: async (url: string) => {
        if (url.endsWith('a.xml')) throw new Error('HTTP 403');
        return memory.readFile(url);
      },
    };

    const result = await reprocessStoredXml(deps, { after: null, limit: 10 });

    expect(result).toMatchObject({ processed: 1, failed: 1, queuedForDownload: 1 });
    expect(memory.invoices[0].syncError).toContain('HTTP 403');
  });
});
