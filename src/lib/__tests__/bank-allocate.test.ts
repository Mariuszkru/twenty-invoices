import { describe, expect, it } from 'vitest';

import { allocationContext, saveManualAllocation } from 'src/lib/bank/allocate';
import { createMemoryBankStore, openInvoice } from 'src/lib/__tests__/fake-enablebanking';

const PLN = (amount: number) => ({ amountMicros: Math.round(amount * 1_000_000), currencyCode: 'PLN' });

const setup = async () => {
  const memory = createMemoryBankStore([
    openInvoice({ id: 'a', name: 'FZ/1', direction: 'PURCHASE', grossAmount: PLN(1000), bankAccount: 'PL27114020040000300201355387', issueDate: '2026-10-01' }),
    openInvoice({ id: 'b', name: 'FZ/2', direction: 'PURCHASE', grossAmount: PLN(500), bankAccount: 'PL27114020040000300201355387', issueDate: '2026-10-05' }),
    openInvoice({ id: 'c', name: 'FZ/3', direction: 'PURCHASE', grossAmount: PLN(70), counterpartyName: 'Inny', issueDate: '2026-10-09' }),
    openInvoice({ id: 's', name: 'FV/1', direction: 'SALE', grossAmount: PLN(1500) }),
  ]);
  const ids = await memory.store.createTransactions([
    {
      externalId: 'acc:r1',
      name: 'Dostawca – zapłata',
      bookingDate: '2026-10-10',
      valueDate: '2026-10-10',
      direction: 'DEBIT',
      amount: PLN(1500),
      counterpartyName: 'Dostawca',
      counterpartyAccount: 'PL27114020040000300201355387',
      remittanceInformation: 'Zapłata za faktury',
      accountIban: null,
      matchStatus: 'UNMATCHED',
      matchNote: null,
    },
  ]);
  return { memory, transactionId: ids.get('acc:r1')! };
};

describe('panel Rozlicz przelew', () => {
  it('pokazuje otwarte faktury tego kierunku, najpierw tego kontrahenta', async () => {
    const { memory, transactionId } = await setup();
    const context = await allocationContext(memory.store, transactionId);
    expect(context.candidates.map((c) => [c.id, c.sameCounterparty])).toEqual([
      ['b', true],
      ['a', true],
      ['c', false],
    ]);
  });

  it('zapisuje przelew zbiorczy na dwie faktury i przelicza ich płatność', async () => {
    const { memory, transactionId } = await setup();
    const result = await saveManualAllocation(memory.store, transactionId, [
      { invoiceId: 'a', amountMicros: 1_000_000_000 },
      { invoiceId: 'b', amountMicros: 500_000_000 },
    ]);
    expect(result).toEqual({ allocations: 2, invoicesUpdated: 2 });
    expect(memory.allocations.map((a) => [a.invoiceId, a.origin, a.name])).toEqual([
      ['a', 'MANUAL', 'FZ/1 ← 1000.00 PLN'],
      ['b', 'MANUAL', 'FZ/2 ← 500.00 PLN'],
    ]);
    expect(memory.transactions[0]).toMatchObject({ matchStatus: 'MANUAL', matchNote: 'Rozliczona ręcznie: 2 faktury' });
    expect(memory.invoices.slice(0, 2).map((i) => i.paymentStatus)).toEqual(['PAID', 'PAID']);
  });

  it('ponowny zapis zastępuje rozliczenia, a usunięta faktura wraca do niezapłaconych', async () => {
    const { memory, transactionId } = await setup();
    await saveManualAllocation(memory.store, transactionId, [
      { invoiceId: 'a', amountMicros: 1_000_000_000 },
      { invoiceId: 'b', amountMicros: 500_000_000 },
    ]);
    await saveManualAllocation(memory.store, transactionId, [{ invoiceId: 'a', amountMicros: 1_000_000_000 }]);
    expect(memory.allocations.map((a) => a.invoiceId)).toEqual(['a']);
    expect(memory.invoices[1]).toMatchObject({ paymentStatus: 'UNPAID', paidAmount: null });
    expect(memory.transactions[0].matchNote).toBe('Rozliczona ręcznie: 1 faktura, nierozliczone 500.00');

    const context = await allocationContext(memory.store, transactionId);
    expect(context.candidates[0]).toMatchObject({ id: 'a', allocatedMicros: 1_000_000_000, remainingMicros: 1_000_000_000 });
  });

  it('odrzuca sumę większą niż transakcja i fakturę w złym kierunku', async () => {
    const { memory, transactionId } = await setup();
    await expect(
      saveManualAllocation(memory.store, transactionId, [
        { invoiceId: 'a', amountMicros: 1_000_000_000 },
        { invoiceId: 'b', amountMicros: 600_000_000 },
      ]),
    ).rejects.toThrow('przekracza kwotę transakcji');
    await expect(saveManualAllocation(memory.store, transactionId, [{ invoiceId: 's', amountMicros: 1_000_000 }])).rejects.toThrow(
      'nie pasuje kierunkiem',
    );
    expect(memory.allocations).toHaveLength(0);
  });
});
