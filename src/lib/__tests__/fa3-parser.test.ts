import { describe, expect, it } from 'vitest';

import { Fa3ParseError, netFromGross, numericVatRate, parseFa3 } from 'src/lib/ksef/fa3-parser';
import { fixture } from 'src/lib/__tests__/fixtures';

describe('netto z brutto', () => {
  it.each([
    ['23', 23],
    ['8', 8],
    ['0 KR', 0],
    ['zw', null],
    ['oo', null],
    ['np I', null],
    [null, null],
  ])('stawka %s -> %s', (rate, expected) => {
    expect(numericVatRate(rate)).toBe(expected);
  });

  it.each([
    [2_350_000_000, '23', 1_910_570_000],
    [-12_300_000, '23', -10_000_000],
    [108_000_000, '8', 100_000_000],
    [100_000_000, 'zw', 100_000_000],
    [100_000_000, '0 WDT', 100_000_000],
  ])('%d przy stawce %s -> %d', (gross, rate, expected) => {
    expect(netFromGross(gross, rate)).toBe(expected);
  });
});

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

  it('faktura liczona od brutto (tylko P_9B/P_11A): netto ze stawki, uzgodnione z P_13_1', () => {
    const lines = parseFa3(fixture('fa3-gross-pln.xml')).lines;

    expect(lines.map((l) => [l.netMicros, l.grossMicros])).toEqual([
      // 2350 / 1,23 = 1910,57; −0,01 z uzgodnienia z nagłówkiem (zaokrąglenia trzech pozycji po 0,41)
      [1_910_560_000, 2_350_000_000],
      [410_000, 500_000],
      [410_000, 500_000],
      [410_000, 500_000],
      // zwolnione: brutto = netto
      [100_000_000, 100_000_000],
    ]);
    const net23 = lines.slice(0, 4).reduce((acc, l) => acc + l.netMicros, 0);
    expect(net23).toBe(1_911_790_000);
  });

  it('odrzuca dokument spoza schematu FA', () => {
    expect(() => parseFa3('<Inny><Fa/></Inny>')).toThrow(Fa3ParseError);
  });
});
