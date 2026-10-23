import { describe, expect, it } from 'vitest';

import type { StoredBankSession } from 'src/lib/bank/consent';
import { EnableBankingApiError } from 'src/lib/bank/enablebanking-http';
import { BANK_KV_KEYS, runBankSync, type BankSyncDeps } from 'src/lib/bank/run-bank-sync';
import {
  apiTransaction,
  createFakeEnableBanking,
  createMemoryBankStore,
  openInvoice,
  type FakeEnableBankingOptions,
  type MemoryInvoice,
} from 'src/lib/__tests__/fake-enablebanking';
import { createMemoryKv } from 'src/lib/__tests__/memory-store';

const NOW = new Date('2026-10-18T05:00:00Z');

const SESSION: StoredBankSession = {
  v: 1,
  appId: 'app-1',
  sessionId: 'session-1',
  aspsp: { name: 'mBank', country: 'PL' },
  accounts: [{ uid: 'acc-1', iban: 'PL61109010140000071219812874', currency: 'PLN' }],
  validUntil: '2027-04-16T08:00:00Z',
};

const setup = (
  fake: FakeEnableBankingOptions,
  invoices: MemoryInvoice[] = [],
  overrides: Partial<BankSyncDeps> = {},
) => {
  const bank = createFakeEnableBanking(fake);
  const memory = createMemoryBankStore(invoices);
  const { kv, data } = createMemoryKv();
  const sent: string[] = [];
  const deps: BankSyncDeps = {
    client: bank.client,
    kv,
    store: memory.store,
    session: SESSION,
    now: () => NOW,
    notify: { send: async (text) => void sent.push(text), crmUrl: 'https://crm.example' },
    ...overrides,
  };
  return { deps, bank, memory, kv: data, sent };
};

describe('runBankSync', () => {
  it('zapisuje zaksięgowane transakcje, dopasowuje fakturę i oznacza ją jako zapłaconą', async () => {
    const { deps, memory, sent } = setup(
      {
        transactions: {
          'acc-1': [
            apiTransaction({ entry_reference: 'r1', amount: '1230.00', remittance_information: ['FV/10/2026/001'] }),
            apiTransaction({ entry_reference: 'r2', amount: '55.00', status: 'PDNG' }),
            apiTransaction({ entry_reference: 'r3', amount: '9.99', credit_debit_indicator: 'DBIT', remittance_information: ['Opłata'] }),
          ],
        },
      },
      [openInvoice({ id: 'inv-1' })],
    );

    const result = await runBankSync(deps);

    expect(result).toMatchObject({ ok: true, fetched: 2, created: 2, matched: 1, unmatched: 1, invoicesUpdated: 1 });
    expect(memory.transactions.map((t) => [t.externalId, t.matchStatus, t.paymentPurpose ?? null, memory.invoiceIdsOf(t.id)])).toEqual([
      ['acc-1:r1', 'AUTO', 'INVOICE', ['inv-1']],
      ['acc-1:r3', 'UNMATCHED', null, []],
    ]);
    expect(memory.allocations[0]).toMatchObject({ name: 'FV/10/2026/001 ← 1230.00 PLN', origin: 'AUTO' });
    expect(memory.invoices[0]).toMatchObject({
      paymentStatus: 'PAID',
      paidAmount: { amountMicros: 1_230_000_000, currencyCode: 'PLN' },
      paidAt: '2026-10-16',
    });
    expect(sent).toEqual([expect.stringContaining('dopasowane do faktur 1, nieprzypisane: *1*')]);
  });

  it('pierwszy przebieg pobiera 30 dni, kolejny od kursora z zakładką 5 dni i bez duplikatów', async () => {
    const { deps, bank, memory, kv } = setup({
      transactions: { 'acc-1': [apiTransaction({ entry_reference: 'r1' })] },
    });

    await runBankSync(deps);
    expect(bank.calls[0].query).toMatchObject({ date_from: '2026-09-18', date_to: '2026-10-18' });
    expect(kv.get(BANK_KV_KEYS.cursor('acc-1'))).toBe('2026-10-18');

    const second = await runBankSync({ ...deps, now: () => new Date('2026-10-19T05:00:00Z') });
    expect(bank.calls[1].query).toMatchObject({ date_from: '2026-10-13', date_to: '2026-10-19' });
    expect(second.created).toBe(0);
    expect(memory.transactions).toHaveLength(1);
  });

  it('pobiera kolejne strony po continuation_key', async () => {
    const { deps, bank, memory } = setup({
      pageSize: 2,
      transactions: {
        'acc-1': ['a', 'b', 'c', 'd', 'e'].map((ref) => apiTransaction({ entry_reference: ref })),
      },
    });
    await runBankSync(deps);
    expect(bank.calls).toHaveLength(3);
    expect(memory.transactions).toHaveLength(5);
  });

  it('ponownie dopasowuje wcześniejsze nieprzypisane transakcje, gdy pojawi się faktura', async () => {
    const invoices: MemoryInvoice[] = [];
    const { deps, memory } = setup(
      { transactions: { 'acc-1': [apiTransaction({ entry_reference: 'r1', amount: '1230.00', remittance_information: ['FV/10/2026/001'] })] } },
      invoices,
    );
    await runBankSync(deps);
    expect(memory.transactions[0].matchStatus).toBe('UNMATCHED');

    invoices.push(openInvoice({ id: 'late' }));
    const result = await runBankSync({ ...deps, now: () => new Date('2026-10-19T05:00:00Z') });
    expect(result.rematched).toBe(1);
    expect(memory.transactions[0].matchStatus).toBe('AUTO');
    expect(memory.invoiceIdsOf(memory.transactions[0].id)).toEqual(['late']);
    expect(invoices[0].paymentStatus).toBe('PAID');
  });

  it('dwie wpłaty na tę samą fakturę w jednym przebiegu: druga nie trafia w inną fakturę', async () => {
    const { deps, memory } = setup(
      {
        transactions: {
          'acc-1': [
            apiTransaction({ entry_reference: 'r1', amount: '1000.00', remittance_information: ['FV/10/2026/001 część 1'] }),
            apiTransaction({ entry_reference: 'r2', amount: '230.00', remittance_information: ['FV/10/2026/001 część 2'] }),
          ],
        },
      },
      [openInvoice({ id: 'inv-1' })],
    );
    await runBankSync(deps);
    expect(memory.transactions.map((t) => memory.invoiceIdsOf(t.id))).toEqual([['inv-1'], ['inv-1']]);
    expect(memory.invoices[0].paymentStatus).toBe('PAID');
  });

  it('przypina transakcję do faktury już zapłaconej bez zmiany jej statusu i tylko raz', async () => {
    const paid = openInvoice({
      id: 'paid',
      name: 'FV 32/09/2026',
      grossAmount: { amountMicros: 250_000_000, currencyCode: 'PLN' },
      paidAmount: null,
      paymentStatus: 'PAID',
      paidAt: '2026-10-01',
      issueDate: '2026-09-21',
    });
    const { deps, memory, sent } = setup(
      {
        transactions: {
          'acc-1': [
            apiTransaction({ entry_reference: 'r1', amount: '250.00', remittance_information: ['Fv 32/09/2026'] }),
            apiTransaction({ entry_reference: 'r2', amount: '250.00', remittance_information: ['Fv 32/09/2026 ponownie'] }),
          ],
        },
      },
      [paid],
    );

    const result = await runBankSync(deps);

    expect(result).toMatchObject({ matched: 1, linkedToPaid: 1, unmatched: 1, invoicesUpdated: 0 });
    expect(memory.transactions[0]).toMatchObject({
      matchStatus: 'AUTO',
      matchNote: expect.stringContaining('faktura była już oznaczona jako zapłacona'),
    });
    expect(memory.invoiceIdsOf(memory.transactions[0].id)).toEqual(['paid']);
    expect(memory.invoiceIdsOf(memory.transactions[1].id)).toEqual([]);
    expect(memory.invoices[0]).toMatchObject({ paymentStatus: 'PAID', paidAt: '2026-10-01', paidAmount: null });
    expect(sent[0]).toContain('w tym 1 do faktur już zapłaconych');
  });

  it('przelew zbiorczy rozlicza kilka faktur i oznacza je jako zapłacone', async () => {
    const { deps, memory } = setup(
      {
        transactions: {
          'acc-1': [apiTransaction({ entry_reference: 'r1', amount: '1500.00', remittance_information: ['FV/1/2026, FV/2/2026'] })],
        },
      },
      [
        openInvoice({ id: 'a', name: 'FV/1/2026', grossAmount: { amountMicros: 1_000_000_000, currencyCode: 'PLN' } }),
        openInvoice({ id: 'b', name: 'FV/2/2026', grossAmount: { amountMicros: 500_000_000, currencyCode: 'PLN' } }),
      ],
    );
    const result = await runBankSync(deps);
    expect(result).toMatchObject({ matched: 1, invoicesUpdated: 2 });
    expect(memory.allocations.map((a) => [a.invoiceId, a.amount.amountMicros])).toEqual([
      ['a', 1_000_000_000],
      ['b', 500_000_000],
    ]);
    expect(memory.invoices.map((i) => i.paymentStatus)).toEqual(['PAID', 'PAID']);
  });

  it('bez sesji kończy się NO_CONSENT i prosi o połączenie z bankiem', async () => {
    const { deps, bank, sent } = setup({}, [], { session: null });
    const result = await runBankSync(deps);
    expect(result).toMatchObject({ ok: false, skipped: 'NO_CONSENT' });
    expect(bank.calls).toHaveLength(0);
    expect(sent[0]).toContain('Połącz konto bankowe');
  });

  it('odrzucona sesja (EXPIRED_SESSION) to NO_CONSENT, a lock zostaje zwolniony', async () => {
    const { deps, kv } = setup({
      failWith: new EnableBankingApiError('expired', 401, 'EXPIRED_SESSION'),
    });
    const result = await runBankSync(deps);
    expect(result).toMatchObject({ ok: false, skipped: 'NO_CONSENT' });
    expect(kv.get(BANK_KV_KEYS.lock)).toEqual({ until: 0 });
  });

  it('pomija przebieg, gdy poprzedni trzyma lock', async () => {
    const { deps, kv, bank } = setup({});
    kv.set(BANK_KV_KEYS.lock, { until: NOW.getTime() + 60_000 });
    expect((await runBankSync(deps)).skipped).toBe('LOCKED');
    expect(bank.calls).toHaveLength(0);
  });

  it('ostrzega o wygasającej zgodzie raz na próg', async () => {
    const session = { ...SESSION, validUntil: '2026-10-28T08:00:00Z' };
    const { deps, sent } = setup({ transactions: { 'acc-1': [] } }, [], { session });
    await runBankSync(deps);
    await runBankSync(deps);
    expect(sent.filter((m) => m.includes('wygasa'))).toHaveLength(1);
    expect(sent[0]).toContain('28.10.2026 (za 11 dni)');

    await runBankSync({ ...deps, now: () => new Date('2026-10-26T05:00:00Z') });
    expect(sent.filter((m) => m.includes('wygasa'))).toHaveLength(2);
  });
});
