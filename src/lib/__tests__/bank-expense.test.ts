import { describe, expect, it } from 'vitest';

import { saveManualAllocation } from 'src/lib/bank/allocate';
import { classifyExpense } from 'src/lib/bank/expense-category';
import { runBankSync } from 'src/lib/bank/run-bank-sync';
import { apiTransaction, createFakeEnableBanking, createMemoryBankStore, openInvoice } from 'src/lib/__tests__/fake-enablebanking';
import { createMemoryKv } from 'src/lib/__tests__/memory-store';

const PLN = (amount: number) => ({ amountMicros: Math.round(amount * 1_000_000), currencyCode: 'PLN' });

const debit = (counterpartyName: string, counterpartyAccount: string | null, remittanceInformation: string) => ({
  direction: 'DEBIT' as const,
  amount: PLN(100),
  counterpartyName,
  counterpartyAccount,
  remittanceInformation,
  bookingDate: '2026-10-09',
});

describe('wydatki bez faktury', () => {
  it('rozpoznaje ZUS, podatki i wynagrodzenia z prawdziwych przelewów', () => {
    expect(
      classifyExpense(debit('ZUS ZAKŁAD UBEZPIECZEŃ SPOŁECZNYCH', 'PL14600000020260017582390272', 'WPŁATA NA ZUS 09/2026 NEW-TRANSFER-ZUS')),
    ).toEqual({ category: 'ZUS', note: 'rachunek ZUS' });
    expect(
      classifyExpense(debit('URZĄD SKARBOWY', 'PL23101000712222758239027200', 'URZĄD SKARBOWYCENTRUM ROZLICZENIOWEPIT-4R US-TRANSFER')),
    ).toEqual({ category: 'TAX', note: 'mikrorachunek podatkowy' });
    expect(
      classifyExpense(debit('JAN KOWALSKI', 'PL72102012600000010201052083', 'WYNAGRODZENIE CZŁONKA ZARZADU - WRZESIEŃ 2026 TRANSFER')),
    ).toEqual({ category: 'SALARY', note: 'wynagrodzenie w tytule' });
  });

  it('nie klasyfikuje zwykłych wydatków ani wpływów', () => {
    expect(classifyExpense(debit('Dostawca', 'PL27114020040000300201355387', 'FZ/1/2026'))).toBeNull();
    expect(classifyExpense({ ...debit('URZĄD SKARBOWY', null, 'zwrot VAT'), direction: 'CREDIT' })).toBeNull();
  });

  it('przebieg oznacza przelew do ZUS jako bez faktury, a wcześniejszą nieprzypisaną wypłatę też', async () => {
    const bank = createFakeEnableBanking({
      transactions: {
        'acc-1': [
          apiTransaction({
            entry_reference: 'zus',
            amount: '337.50',
            credit_debit_indicator: 'DBIT',
            remittance_information: ['WPŁATA NA ZUS 09/2026'],
            creditor: { name: 'ZUS ZAKŁAD UBEZPIECZEŃ SPOŁECZNYCH' },
            creditor_account: { iban: 'PL14600000020260017582390272' },
          }),
        ],
      },
    });
    const memory = createMemoryBankStore([]);
    await memory.store.createTransactions([
      {
        externalId: 'acc-1:old',
        name: 'Jan – wynagrodzenie',
        bookingDate: '2026-10-07',
        valueDate: '2026-10-07',
        direction: 'DEBIT',
        amount: PLN(2275),
        counterpartyName: 'JAN KOWALSKI',
        counterpartyAccount: 'PL68102038020000190201362664',
        remittanceInformation: 'WYNAGRODZENIE - WRZESIEŃ 2026',
        accountIban: null,
        matchStatus: 'UNMATCHED',
        matchNote: null,
      },
    ]);
    const { kv } = createMemoryKv();
    const result = await runBankSync({
      client: bank.client,
      kv,
      store: memory.store,
      session: {
        v: 1,
        appId: 'app-1',
        sessionId: 'session-1',
        aspsp: { name: 'mBank', country: 'PL' },
        accounts: [{ uid: 'acc-1', iban: 'PL61109010140000071219812874', currency: 'PLN' }],
        validUntil: '2027-04-16T08:00:00Z',
      },
      now: () => new Date('2026-10-18T05:00:00Z'),
    });

    expect(result).toMatchObject({ ok: true, created: 1, unmatched: 0, categorized: 2 });
    expect(memory.transactions.map((t) => [t.externalId, t.matchStatus, t.expenseCategory])).toEqual([
      ['acc-1:old', 'NO_INVOICE', 'SALARY'],
      ['acc-1:zus', 'NO_INVOICE', 'ZUS'],
    ]);
  });

  it('panel zapisuje rodzaj wydatku i zdejmuje wcześniejsze rozliczenie z faktury', async () => {
    const memory = createMemoryBankStore([
      openInvoice({ id: 'a', name: 'FZ/1', direction: 'PURCHASE', grossAmount: PLN(390) }),
    ]);
    const ids = await memory.store.createTransactions([
      {
        externalId: 'acc:us',
        name: 'Urząd',
        bookingDate: '2026-10-20',
        valueDate: '2026-10-20',
        direction: 'DEBIT',
        amount: PLN(390),
        counterpartyName: 'Ktoś',
        counterpartyAccount: null,
        remittanceInformation: 'PIT-4R',
        accountIban: null,
        matchStatus: 'UNMATCHED',
        matchNote: null,
      },
    ]);
    const id = ids.get('acc:us')!;
    await saveManualAllocation(memory.store, id, [{ invoiceId: 'a', amountMicros: 390_000_000 }]);
    expect(memory.invoices[0].paymentStatus).toBe('PAID');

    const result = await saveManualAllocation(memory.store, id, [], 'TAX');

    expect(result).toEqual({ allocations: 0, expenseCategory: 'TAX', invoicesUpdated: 1 });
    expect(memory.transactions[0]).toMatchObject({ matchStatus: 'NO_INVOICE', expenseCategory: 'TAX' });
    expect(memory.allocations).toEqual([]);
    expect(memory.invoices[0].paymentStatus).toBe('UNPAID');

    await saveManualAllocation(memory.store, id, [{ invoiceId: 'a', amountMicros: 390_000_000 }]);
    expect(memory.transactions[0]).toMatchObject({ matchStatus: 'MANUAL', expenseCategory: null });
  });

  it('odrzuca rodzaj wydatku dla wpływu i razem z fakturą', async () => {
    const memory = createMemoryBankStore([]);
    const ids = await memory.store.createTransactions([
      {
        externalId: 'acc:in',
        name: 'Wpływ',
        bookingDate: '2026-10-20',
        valueDate: '2026-10-20',
        direction: 'CREDIT',
        amount: PLN(10),
        counterpartyName: null,
        counterpartyAccount: null,
        remittanceInformation: null,
        accountIban: null,
        matchStatus: 'UNMATCHED',
        matchNote: null,
      },
    ]);
    await expect(saveManualAllocation(memory.store, ids.get('acc:in')!, [], 'ZUS')).rejects.toThrow('tylko wydatków');
  });
});
