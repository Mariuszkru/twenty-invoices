import { describe, expect, it } from 'vitest';

import { ALLOCATION_STATUS, ENTRY_TYPE } from 'src/constants/options';
import { PinError, pinContext, pinLines } from 'src/lib/projects/pin';
import { createMemoryProjectStore, line, money, project } from 'src/lib/__tests__/fake-projects';

const setup = () =>
  createMemoryProjectStore(
    [
      line({ id: 's1', invoiceName: 'FV 34/10/2026', counterpartyName: 'ARYZTA', issueDate: '2026-10-14' }),
      line({ id: 's2', invoiceName: 'FV 34/10/2026', counterpartyName: 'ARYZTA', netAmount: money(300), marginEffectPln: money(300) }),
      line({
        id: 'z1',
        invoiceName: 'FS-2475/26/OSTR',
        counterpartyName: 'WAMAR',
        name: 'Kabel HDMI 2 m',
        direction: 'PURCHASE',
        netAmount: money(43),
        marginEffectPln: money(-43),
        issueDate: '2026-10-19',
      }),
    ],
    [{ ...project, name: 'Serwis' } as typeof project],
  );

describe('panel Przypnij pozycje faktur', () => {
  it('wyszukuje po numerze faktury i po kontrahencie, z resztą do przypięcia i typem z kierunku', async () => {
    const memory = setup();
    const byInvoice = await pinContext(memory.store, 'fv 34');
    expect(byInvoice.candidates.map((c) => c.id).sort()).toEqual(['s1', 's2']);

    const bySupplier = await pinContext(memory.store, 'wamar');
    expect(bySupplier.candidates).toEqual([
      expect.objectContaining({ id: 'z1', remainingMicros: money(43).amountMicros, defaultType: ENTRY_TYPE.COST, projectNames: [] }),
    ]);
    expect(bySupplier.projects.map((p) => p.name)).toEqual(['Serwis']);
  });

  it('wyszukuje po nazwie pozycji', async () => {
    const memory = setup();
    const byName = await pinContext(memory.store, 'kabel hdmi');
    expect(byName.candidates.map((c) => c.id)).toEqual(['z1']);
  });

  it('przypina kilka pozycji naraz i przelicza marżę projektu', async () => {
    const memory = setup();
    const result = await pinLines(memory.store, 'p1', [
      { lineId: 's1' },
      { lineId: 's2', amountMicros: money(100).amountMicros },
      // typ z panelu jest ignorowany: zakup zawsze trafia do kosztów
      { lineId: 'z1', type: ENTRY_TYPE.REVENUE } as { lineId: string },
    ]);
    expect(result.created).toBe(3);
    expect(memory.project('p1')).toMatchObject({ revenuePln: money(1100), costPln: money(43), marginPln: money(1057) });
    expect(memory.lineStatus.get('s2')).toBe(ALLOCATION_STATUS.PARTIAL);
    expect(memory.entries[0]).toMatchObject({ name: 'Usługa · FV 34/10/2026', invoiceId: 'inv-s1', amountPln: money(1000) });

    const context = await pinContext(memory.store, 'fv 34');
    expect(context.candidates.find((c) => c.id === 's2')).toMatchObject({ remainingMicros: money(200).amountMicros, projectNames: ['Serwis'] });
  });

  it('odrzuca kwotę ponad resztę pozycji i nie zapisuje niczego', async () => {
    const memory = setup();
    await expect(
      pinLines(memory.store, 'p1', [{ lineId: 's1' }, { lineId: 's2', amountMicros: money(400).amountMicros }]),
    ).rejects.toThrow(PinError);
    expect(memory.entries).toHaveLength(0);
  });

  it('odrzuca pozycję już w pełni przypisaną, brak projektu i pusty wybór', async () => {
    const memory = setup();
    await pinLines(memory.store, 'p1', [{ lineId: 's1' }]);
    await expect(pinLines(memory.store, 'p1', [{ lineId: 's1' }])).rejects.toThrow('kwota 0');
    await expect(pinLines(memory.store, 'brak', [{ lineId: 's2' }])).rejects.toThrow('Nie znaleziono projektu');
    await expect(pinLines(memory.store, 'p1', [])).rejects.toThrow('Zaznacz');
  });
});
