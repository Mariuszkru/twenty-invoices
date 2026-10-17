import { describe, expect, it } from 'vitest';

import { Fa3ParseError, parseFa3 } from 'src/lib/ksef/fa3-parser';
import { fixture } from 'src/lib/__tests__/fixtures';

describe('parseFa3', () => {
  it('czyta nagłówek i pozycje faktury VAT w PLN', () => {
    const parsed = parseFa3(fixture('fa3-vat-pln.xml'));

    expect(parsed).toMatchObject({
      currency: 'PLN',
      issueDate: '2026-10-01',
      saleDate: '2026-09-30',
      invoiceNumber: 'FV/10/2026/001',
      invoiceType: 'VAT',
      correctedKsefNumbers: [],
      headerExchangeRate: null,
    });
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toEqual({
      lineNo: 1,
      name: 'Wdrożenie CRM – etap 1',
      unit: 'godz.',
      quantity: 10,
      unitNetPriceMicros: 120_000_000,
      netMicros: 1_200_000_000,
      grossMicros: null,
      vatRate: '23',
      gtin: null,
      pkwiu: null,
      productCode: 'WDR-01',
      uuid: '11111111-1111-4111-8111-111111111111',
      isBeforeCorrection: false,
      exchangeRate: null,
    });
    expect(parsed.lines[1]).toMatchObject({ pkwiu: '58.29.50.0', netMicros: 300_000_000 });
  });

  it('rozpoznaje korektę: wiersze StanPrzed i numer KSeF faktury korygowanej', () => {
    const parsed = parseFa3(fixture('fa3-kor-pln.xml'));

    expect(parsed.invoiceType).toBe('KOR');
    expect(parsed.correctedKsefNumbers).toEqual(['7740001454-20260915-0A1B2C3D4E5F-AB']);
    expect(parsed.lines.map((l) => [l.isBeforeCorrection, l.netMicros])).toEqual([
      [true, 1_000_000_000],
      [false, 800_000_000],
    ]);
  });

  it('wylicza netto z brutto − VAT, gdy brak P_11, i czyta kurs z wiersza', () => {
    const parsed = parseFa3(fixture('fa3-vat-eur.xml'));

    expect(parsed.currency).toBe('EUR');
    expect(parsed.lines[0]).toMatchObject({
      quantity: 10.5,
      unitNetPriceMicros: 95_285_700,
      vatRate: '0 WDT',
      exchangeRate: null,
    });
    expect(parsed.lines[1]).toMatchObject({
      netMicros: -10_000_000,
      grossMicros: -12_300_000,
      exchangeRate: 4.3,
    });
  });

  it('odrzuca dokument spoza schematu FA', () => {
    expect(() => parseFa3('<Inny><Fa/></Inny>')).toThrow(Fa3ParseError);
  });
});
