import { beforeEach, describe, expect, it } from 'vitest';

import { createKsefHttpClient } from 'src/lib/ksef/http';
import type { KsefInvoiceMetadata } from 'src/lib/ksef/invoices';
import { KV_KEYS, runSync, type SyncDeps } from 'src/lib/sync/run-sync';
import { createFakeKsef, type FakeKsefOptions } from 'src/lib/__tests__/fake-ksef';
import { fixture } from 'src/lib/__tests__/fixtures';
import { createMemoryKv, createMemoryStore } from 'src/lib/__tests__/memory-store';

const OUR_NIP = '5260250274';
const NOW = new Date('2026-10-17T08:00:00Z');

const meta = (overrides: Partial<KsefInvoiceMetadata>): KsefInvoiceMetadata => ({
  ksefNumber: 'X',
  invoiceNumber: 'X',
  issueDate: '2026-10-01',
  permanentStorageDate: '2026-10-01T10:00:00Z',
  seller: { nip: OUR_NIP, name: 'Recoop' },
  buyer: { identifier: { type: 'Nip', value: '7740001454' }, name: 'Klient S.A.' },
  netAmount: 1500,
  grossAmount: 1845,
  vatAmount: 345,
  currency: 'PLN',
  invoiceType: 'Vat',
  ...overrides,
});

const SALE = meta({ ksefNumber: `${OUR_NIP}-20261001-0000000000AA-01`, invoiceNumber: 'FV/10/2026/001' });
const SALE_EUR = meta({
  ksefNumber: `${OUR_NIP}-20261002-0000000000BB-02`,
  invoiceNumber: 'FV/10/2026/002',
  permanentStorageDate: '2026-10-02T10:00:00Z',
  buyer: { identifier: { type: 'VatUe', value: 'DE123456789' }, name: 'Kunde GmbH' },
  currency: 'EUR',
  netAmount: 990.5,
  grossAmount: 990.5,
  vatAmount: -9.89,
});
const ORIGINAL = meta({
  ksefNumber: '7740001454-20260915-0A1B2C3D4E5F-AB',
  invoiceNumber: 'FV/9/2026/44',
  issueDate: '2026-09-15',
  permanentStorageDate: '2026-09-15T10:00:00Z',
  seller: { nip: '7740001454', name: 'Dostawca Sp. z o.o.' },
  buyer: { identifier: { type: 'Nip', value: OUR_NIP }, name: 'Recoop' },
});
const CORRECTION = meta({
  ksefNumber: '7740001454-20261005-0000000000CC-03',
  invoiceNumber: 'KOR/2026/7',
  issueDate: '2026-10-05',
  permanentStorageDate: '2026-10-05T10:00:00Z',
  seller: { nip: '7740001454', name: 'Dostawca Sp. z o.o.' },
  buyer: { identifier: { type: 'Nip', value: OUR_NIP }, name: 'Recoop' },
  netAmount: -200,
  invoiceType: 'Kor',
});

const ksefOptions = (overrides: Partial<FakeKsefOptions> = {}): FakeKsefOptions => ({
  token: 'TOKEN',
  nip: OUR_NIP,
  invoices: { Subject1: [SALE, SALE_EUR], Subject2: [ORIGINAL, CORRECTION] },
  xmlByKsefNumber: {
    [SALE.ksefNumber]: fixture('fa3-vat-pln.xml'),
    [SALE_EUR.ksefNumber]: fixture('fa3-vat-eur.xml'),
    [ORIGINAL.ksefNumber]: fixture('fa3-vat-pln.xml'),
    [CORRECTION.ksefNumber]: fixture('fa3-kor-pln.xml'),
  },
  hwm: '2026-10-17T07:58:00Z',
  ...overrides,
});

describe('runSync', () => {
  let memory: ReturnType<typeof createMemoryStore>;
  let kvMem: ReturnType<typeof createMemoryKv>;
  let nbpCalls: string[];

  const deps = (fake: ReturnType<typeof createFakeKsef>, overrides: Partial<SyncDeps> = {}): SyncDeps => ({
    http: createKsefHttpClient({ baseUrl: 'https://ksef.test/v2', fetchImpl: fake.fetchImpl, sleep: async () => {} }),
    kv: kvMem.kv,
    store: memory.store,
    nip: OUR_NIP,
    ksefToken: 'TOKEN',
    nbpRate: async (currency, date) => {
      nbpCalls.push(`${currency}@${date}`);
      return 4.2563;
    },
    now: () => NOW,
    ...overrides,
  });

  beforeEach(() => {
    memory = createMemoryStore();
    kvMem = createMemoryKv();
    nbpCalls = [];
  });

  it('importuje nagłówki i pozycje obu kierunków', async () => {
    const fake = createFakeKsef(ksefOptions());
    const summary = await runSync(deps(fake));

    expect(summary).toMatchObject({ ok: true, created: 4, completed: 4, failed: 0, pendingLeft: false });
    expect(memory.invoices.map((i) => [i.name, i.direction, i.syncStatus])).toEqual([
      ['FV/10/2026/001', 'SALE', 'COMPLETE'],
      ['FV/10/2026/002', 'SALE', 'COMPLETE'],
      ['FV/9/2026/44', 'PURCHASE', 'COMPLETE'],
      ['KOR/2026/7', 'PURCHASE', 'COMPLETE'],
    ]);

    // zakup od firmy z CRM dopięty po NIP-ie, razem z pozycjami
    const correction = memory.invoices[3];
    expect(correction.companyId).toBe('company-dostawca');
    expect(correction.correctedKsefNumber).toBe(ORIGINAL.ksefNumber);
    expect(correction.correctedInvoiceId).toBe(memory.invoices[2].id);
    expect(correction.xmlFile).toEqual([{ fileId: `file-${CORRECTION.ksefNumber}.xml`, label: `${CORRECTION.ksefNumber}.xml` }]);

    const correctionLines = memory.lines.filter((l) => l.invoiceId === correction.id);
    expect(correctionLines.map((l) => [l.isBeforeCorrection, l.marginEffectPln?.amountMicros, l.companyId])).toEqual([
      [true, 1_000_000_000, 'company-dostawca'],
      [false, -800_000_000, 'company-dostawca'],
    ]);

    // EUR: brak kursu w nagłówku i w pierwszym wierszu -> NBP z dnia przed datą wystawienia
    const eur = memory.invoices[1];
    expect(nbpCalls).toEqual(['EUR@2026-10-02']);
    expect(eur.exchangeRate).toBe(4.2563);
    expect(eur.netAmountPln).toEqual({ amountMicros: 4_258_428_150 - 43_000_000, currencyCode: 'PLN' });

    expect(memory.lines).toHaveLength(8);
    expect(await kvMem.kv.get(KV_KEYS.cursor('SALE'))).toBe('2026-10-17T07:58:00.000Z');
  });

  it('kolejny przebieg nie dubluje faktur ani pozycji', async () => {
    const fake = createFakeKsef(ksefOptions());
    await runSync(deps(fake));
    await kvMem.kv.set(KV_KEYS.cursor('SALE'), '2026-09-01T00:00:00Z');
    await kvMem.kv.set(KV_KEYS.cursor('PURCHASE'), '2026-09-01T00:00:00Z');

    const second = await runSync(deps(fake, { now: () => new Date(NOW.getTime() + 15 * 60_000) }));

    expect(second).toMatchObject({ ok: true, created: 0, completed: 0 });
    expect(memory.invoices).toHaveLength(4);
    expect(memory.lines).toHaveLength(8);
  });

  it('kolejny przebieg odświeża token zamiast logować się od nowa', async () => {
    const fake = createFakeKsef(ksefOptions());
    let stored: string | undefined;
    const session = () => ({ stored, save: async (v: string) => void (stored = v) });

    await runSync(deps(fake, { session: session() }));
    fake.calls.length = 0;
    await runSync(deps(fake, { session: session(), now: () => new Date(NOW.getTime() + 15 * 60_000) }));

    expect(fake.calls.filter((c) => c.includes('/auth/'))).toEqual(['POST /auth/token/refresh']);
  });

  it('powiadamia raz o świeżych fakturach zakupowych; po błędzie wysyłki ponawia', async () => {
    const fake = createFakeKsef(ksefOptions());
    const day6 = new Date('2026-10-06T08:00:00Z');
    const sent: string[] = [];
    let failing = true;
    const notify = {
      crmUrl: null,
      send: async (text: string) => {
        if (failing) throw new Error('Rocket.Chat niedostępny');
        sent.push(text);
      },
    };

    await runSync(deps(fake, { now: () => day6, notify }));
    expect(sent).toEqual([]);

    failing = false;
    await runSync(deps(fake, { now: () => new Date(day6.getTime() + 15 * 60_000), notify }));
    await runSync(deps(fake, { now: () => new Date(day6.getTime() + 30 * 60_000), notify }));

    // tylko zakup zapisany w KSeF w ostatnich 3 dniach (korekta z 05.10), bez sprzedaży i bez faktury z 15.09
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Nowa faktura zakupowa w KSeF');
    expect(sent[0]).toContain('KOR/2026/7');
    expect(sent[0]).not.toContain('FV/9/2026/44');
  });

  it('przy limicie 429 zostawia faktury jako PENDING do kolejnego przebiegu', async () => {
    const fake = createFakeKsef(ksefOptions({ rateLimitDownloads: true }));
    const summary = await runSync(deps(fake));

    expect(summary).toMatchObject({ ok: true, created: 4, completed: 0, pendingLeft: true });
    expect(memory.invoices.every((i) => i.syncStatus === 'PENDING')).toBe(true);
  });

  it('brak XML w KSeF oznacza fakturę błędem i nie zatrzymuje reszty', async () => {
    const options = ksefOptions();
    delete options.xmlByKsefNumber[SALE.ksefNumber];
    const summary = await runSync(deps(createFakeKsef(options)));

    expect(summary).toMatchObject({ ok: true, completed: 3, failed: 1 });
    expect(memory.invoices[0]).toMatchObject({ syncStatus: 'ERROR' });
    expect(memory.invoices[0].syncError).toContain('404');
  });

  it('respektuje godzinny budżet pobrań XML', async () => {
    const fake = createFakeKsef(ksefOptions());
    // 58 pobrań w ostatniej godzinie -> zostały 2 z 60
    await kvMem.kv.set('ksef:rate:download', Array.from({ length: 58 }, () => NOW.getTime() - 30 * 60_000));

    const summary = await runSync(deps(fake));

    expect(summary).toMatchObject({ completed: 2, pendingLeft: true });
    expect(fake.calls.filter((c) => c.startsWith('GET /invoices/ksef/'))).toHaveLength(2);
  });

  it('nie startuje, gdy trwa inny przebieg', async () => {
    await kvMem.kv.set(KV_KEYS.lock, { until: NOW.getTime() + 60_000 });
    const fake = createFakeKsef(ksefOptions());

    const summary = await runSync(deps(fake));

    expect(summary.skipped).toBe('LOCKED');
    expect(fake.calls).toEqual([]);
  });

  it('błąd uwierzytelnienia kończy przebieg z komunikatem i zwalnia lock', async () => {
    const fake = createFakeKsef(ksefOptions());
    const summary = await runSync(deps(fake, { ksefToken: 'ZLY' }));

    expect(summary.ok).toBe(false);
    expect(summary.message).toContain('Błąd tokena');
    expect(await kvMem.kv.get(KV_KEYS.lock)).toEqual({ until: 0 });
    expect(await kvMem.kv.get(KV_KEYS.lastRun)).toMatchObject({ ok: false });
  });
});
