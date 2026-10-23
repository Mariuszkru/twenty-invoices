import { describe, expect, it } from 'vitest';

import { ALLOCATION_STATUS, ENTRY_TYPE } from 'src/constants/options';
import { computeMargin, rejectedClientChange } from 'src/lib/projects/margin';
import { onEntryChanged, onProjectChanged } from 'src/lib/projects/recompute';
import { createMemoryProjectStore, line, money, project } from 'src/lib/__tests__/fake-projects';

describe('computeMargin', () => {
  it('przy przychodzie 0 marża % jest pusta, bez dzielenia przez zero', () => {
    const margin = computeMargin([{ type: ENTRY_TYPE.COST, amountPln: money(300) }]);
    expect(margin.marginPln).toEqual(money(-300));
    expect(margin.marginPercent).toBeNull();
    expect(computeMargin([]).marginPercent).toBeNull();
  });

  it('marża = przychód − koszt, marża % = marża / przychód', () => {
    const margin = computeMargin([
      { type: ENTRY_TYPE.REVENUE, amountPln: money(1000) },
      { type: ENTRY_TYPE.COST, amountPln: money(750) },
    ]);
    expect([margin.revenuePln, margin.costPln, margin.marginPln]).toEqual([money(1000), money(750), money(250)]);
    expect(margin.marginPercent).toBe(0.25);
  });

  it('korekta ujemna pomniejsza przychód', () => {
    const margin = computeMargin([
      { type: ENTRY_TYPE.REVENUE, amountPln: money(1000) },
      { type: ENTRY_TYPE.REVENUE, amountPln: money(-200) },
    ]);
    expect(margin.revenuePln).toEqual(money(800));
  });

  it('pomija przypisania bez kwoty w PLN zamiast sumować różne waluty', () => {
    const margin = computeMargin([
      { type: ENTRY_TYPE.REVENUE, amountPln: money(1000) },
      { type: ENTRY_TYPE.REVENUE, amountPln: null },
    ]);
    expect(margin.revenuePln).toEqual(money(1000));
    expect(margin.skipped).toBe(1);
  });
});

describe('przypisania pozycji faktur do projektu', () => {
  it('pusty typ i kwota: typ z kierunku faktury, kwota = cała pozycja; marża na projekcie', async () => {
    const memory = createMemoryProjectStore(
      [line({ id: 's1' }), line({ id: 'z1', direction: 'PURCHASE', netAmount: money(600), marginEffectPln: money(-600) })],
      [project],
    );
    const revenue = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    const cost = await memory.addEntry({ projectId: 'p1', invoiceLineId: 'z1' });

    expect([revenue.type, revenue.amount, revenue.invoiceId, revenue.name]).toEqual([ENTRY_TYPE.REVENUE, money(1000), 'inv-s1', 'Usługa · FV/s1']);
    expect([cost.type, cost.amountPln]).toEqual([ENTRY_TYPE.COST, money(600)]);
    expect(memory.project('p1')).toMatchObject({ revenuePln: money(1000), costPln: money(600), marginPln: money(400), marginPercent: 0.4 });
    expect(memory.lineStatus.get('s1')).toBe(ALLOCATION_STATUS.ASSIGNED);
  });

  it('częściowe przypisanie: druga część dostaje resztę pozycji, pozycja jest częściowo przypisana do czasu podziału całości', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project, { ...project, id: 'p2' }]);
    await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1', amount: money(300) });
    expect(memory.lineStatus.get('s1')).toBe(ALLOCATION_STATUS.PARTIAL);

    const rest = await memory.addEntry({ projectId: 'p2', invoiceLineId: 's1' });
    expect(rest.amount).toEqual(money(700));
    expect(memory.lineStatus.get('s1')).toBe(ALLOCATION_STATUS.ASSIGNED);
    expect(memory.project('p1').revenuePln).toEqual(money(300));
    expect(memory.project('p2').revenuePln).toEqual(money(700));
  });

  it('suma przypisań ponad wartość pozycji daje uwagę na przypisaniach i projekcie', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project]);
    const a = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1', amount: money(800) });
    const b = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1', amount: money(300) });
    expect(a.issue).toContain('nie mieści się');
    expect(b.issue).toContain('nie mieści się');
    expect(memory.project('p1').issues).toContain('Pozycje z uwagami: 2');

    await memory.updateEntry(b.id, { amount: money(200) });
    expect([a.issue, b.issue]).toEqual([null, null]);
    expect(memory.project('p1').issues).toBeNull();
  });

  it('korekta: wiersz "stan przed" jest ujemny, korekta in minus obniża przychód', async () => {
    const memory = createMemoryProjectStore(
      [
        line({ id: 's1' }),
        line({ id: 'k-przed', invoiceId: 'kor', isBeforeCorrection: true, marginEffectPln: money(-1000) }),
        line({ id: 'k-po', invoiceId: 'kor', netAmount: money(800), marginEffectPln: money(800) }),
      ],
      [project],
    );
    await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    const before = await memory.addEntry({ projectId: 'p1', invoiceLineId: 'k-przed' });
    await memory.addEntry({ projectId: 'p1', invoiceLineId: 'k-po' });

    expect(before.amount).toEqual(money(-1000));
    expect(before.issue).toBeNull();
    expect(memory.project('p1').revenuePln).toEqual(money(800));
  });

  it('usunięcie przypisania przelicza projekt od zera i zwalnia pozycję', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project]);
    const entry = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    await memory.removeEntry(entry.id);
    expect(memory.project('p1')).toMatchObject({ revenuePln: money(0), marginPln: money(0), marginPercent: null });
    expect(memory.lineStatus.get('s1')).toBe(ALLOCATION_STATUS.UNASSIGNED);
  });

  it('zmiana typu przychód → koszt przenosi kwotę między przychodem a kosztem', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project]);
    const entry = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    await memory.updateEntry(entry.id, { type: ENTRY_TYPE.COST });
    expect(memory.project('p1')).toMatchObject({ revenuePln: money(0), costPln: money(1000), marginPln: money(-1000) });
  });

  it('przeniesienie przypisania do innego projektu przelicza oba projekty', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project, { ...project, id: 'p2' }]);
    const entry = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    await memory.updateEntry(entry.id, { projectId: 'p2' });
    expect(memory.project('p1').revenuePln).toEqual(money(0));
    expect(memory.project('p2').revenuePln).toEqual(money(1000));
  });

  it('pozycja w EUR przeliczana kursem z faktury; kwota w innej walucie nie wchodzi do marży', async () => {
    const memory = createMemoryProjectStore(
      [line({ id: 'eur', netAmount: money(100, 'EUR'), marginEffectPln: money(425.63) })],
      [project],
    );
    const entry = await memory.addEntry({ projectId: 'p1', invoiceLineId: 'eur', amount: money(50, 'EUR') });
    expect(entry.amountPln).toEqual(money(212.815));

    await memory.updateEntry(entry.id, { amount: money(50, 'USD') });
    expect(entry.amountPln).toBeNull();
    expect(entry.issue).toContain('Waluta kwoty (USD)');
    expect(memory.project('p1').revenuePln).toEqual(money(0));
  });

  it('powtórzone zdarzenie daje ten sam wynik', async () => {
    const memory = createMemoryProjectStore([line({ id: 's1' })], [project]);
    const entry = await memory.addEntry({ projectId: 'p1', invoiceLineId: 's1' });
    await onEntryChanged(memory.store, entry.id, entry, entry);
    await onEntryChanged(memory.store, entry.id, entry, entry);
    expect(memory.project('p1').revenuePln).toEqual(money(1000));
    expect(entry.amount).toEqual(money(1000));
  });
});

describe('klient projektu: dokładnie firma albo osoba', () => {
  const clientOnly = (companyId: string | null, personId: string | null) => ({ companyId, personId });

  it('firma albo osoba są poprawne', () => {
    expect(rejectedClientChange(null, clientOnly('c1', null))).toBeNull();
    expect(rejectedClientChange(null, clientOnly(null, 'o1'))).toBeNull();
    expect(rejectedClientChange(clientOnly('c1', null), clientOnly(null, 'o1'))).toBeNull();
  });

  it('dopisanie osoby do projektu z firmą jest cofane', () => {
    expect(rejectedClientChange(clientOnly('c1', null), clientOnly('c1', 'o1'))).toEqual(clientOnly('c1', null));
  });

  it('nowy projekt z firmą i osobą wraca do stanu bez klienta', () => {
    expect(rejectedClientChange(null, clientOnly('c1', 'o1'))).toEqual(clientOnly(null, null));
  });

  it('projekt z klientem-osobą ma nazwę klienta z osoby', async () => {
    const memory = createMemoryProjectStore([], [{ id: 'p1', companyId: null, personId: 'o1', companyName: null, personName: 'Jan Kowalski' }]);
    const result = await onProjectChanged(memory.store, 'p1', null, { companyId: null, personId: 'o1' });
    expect(result.rejected).toBe(false);
    expect(memory.project('p1')).toMatchObject({ clientName: 'Jan Kowalski', issues: null });
  });

  it('zapis obu naraz jest cofany i opisany w uwagach', async () => {
    const memory = createMemoryProjectStore([], [{ id: 'p1', companyId: 'c1', personId: 'o1', companyName: 'ACME', personName: 'Jan Kowalski' }]);
    const result = await onProjectChanged(memory.store, 'p1', { companyId: 'c1', personId: null }, { companyId: 'c1', personId: 'o1' });
    expect(result.rejected).toBe(true);
    expect(memory.project('p1')).toMatchObject({ companyId: 'c1', personId: null, clientName: 'ACME' });
    expect(memory.project('p1').issues).toContain('Odrzucono zmianę klienta');
  });

  it('projekt bez klienta dostaje uwagę', async () => {
    const memory = createMemoryProjectStore([], [{ id: 'p1', companyId: null, personId: null, companyName: null, personName: null }]);
    await onProjectChanged(memory.store, 'p1', null, { companyId: null, personId: null });
    expect(memory.project('p1')).toMatchObject({ clientName: null, issues: 'Brak klienta: ustaw firmę albo osobę.' });
  });
});
