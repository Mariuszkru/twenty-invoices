import { describe, expect, it } from 'vitest';

import { DIRECTION } from 'src/constants/options';
import { parseFa3 } from 'src/lib/ksef/fa3-parser';
import type { KsefInvoiceMetadata } from 'src/lib/ksef/invoices';
import {
  counterpartyOf,
  invoiceFromMetadata,
  lineRecord,
  toInvoiceTypeValue,
  type LineContext,
} from 'src/lib/sync/mapping';
import { fixture } from 'src/lib/__tests__/fixtures';

const meta: KsefInvoiceMetadata = {
  ksefNumber: '5260250274-20261001-010020A3B4C5-1F',
  invoiceNumber: 'FV/10/2026/001',
  issueDate: '2026-10-01',
  permanentStorageDate: '2026-10-01T10:05:00Z',
  seller: { nip: '5260250274', name: 'Recoop Sp. z o.o.' },
  buyer: { identifier: { type: 'Nip', value: '7740001454' }, name: 'Klient S.A.' },
  netAmount: 1500,
  grossAmount: 1845,
  vatAmount: 345,
  currency: 'PLN',
  invoiceType: 'Vat',
};

const ctx = (overrides: Partial<LineContext> = {}): LineContext => ({
  invoiceId: 'inv-1',
  direction: DIRECTION.SALE,
  currency: 'PLN',
  invoiceRate: null,
  issueDate: '2026-10-01',
  companyId: null,
  ...overrides,
});

describe('mapowanie metadanych', () => {
  it.each([
    ['Vat', 'VAT'],
    ['KorZal', 'KOR_ZAL'],
    ['VatPefSp', 'VAT_PEF_SP'],
    ['KorVatRr', 'KOR_VAT_RR'],
  ])('rodzaj %s -> %s', (input, expected) => {
    expect(toInvoiceTypeValue(input)).toBe(expected);
  });

  it('kontrahentem sprzedaży jest nabywca, zakupu – sprzedawca', () => {
    expect(counterpartyOf(meta, DIRECTION.SALE)).toEqual({
      taxId: '7740001454',
      nip: '7740001454',
      name: 'Klient S.A.',
    });
    expect(counterpartyOf(meta, DIRECTION.PURCHASE)).toEqual({
      taxId: '5260250274',
      nip: '5260250274',
      name: 'Recoop Sp. z o.o.',
    });
  });

  it('nabywca z UE nie jest traktowany jako NIP', () => {
    const eu = { ...meta, buyer: { identifier: { type: 'VatUe' as const, value: 'DE123' }, name: 'X' } };
    expect(counterpartyOf(eu, DIRECTION.SALE)).toMatchObject({ taxId: 'DE123', nip: null });
  });

  it('tworzy nagłówek PENDING z kwotami w micros', () => {
    expect(invoiceFromMetadata(meta, DIRECTION.SALE, 'company-1')).toMatchObject({
      name: 'FV/10/2026/001',
      invoiceType: 'VAT',
      netAmount: { amountMicros: 1_500_000_000, currencyCode: 'PLN' },
      vatAmount: { amountMicros: 345_000_000, currencyCode: 'PLN' },
      netAmountPln: { amountMicros: 1_500_000_000, currencyCode: 'PLN' },
      companyId: 'company-1',
      syncStatus: 'PENDING',
    });
  });

  it('nie zgaduje netto PLN dla waluty obcej przed pobraniem XML', () => {
    expect(invoiceFromMetadata({ ...meta, currency: 'EUR' }, DIRECTION.SALE, null).netAmountPln).toBeNull();
  });
});

describe('wpływ pozycji na marżę', () => {
  const effect = (record: ReturnType<typeof lineRecord>) => record.marginEffectPln?.amountMicros;

  it('sprzedaż na plus, zakup na minus', () => {
    const [line] = parseFa3(fixture('fa3-vat-pln.xml')).lines;
    expect(effect(lineRecord(line, ctx()))).toBe(1_200_000_000);
    expect(effect(lineRecord(line, ctx({ direction: DIRECTION.PURCHASE })))).toBe(-1_200_000_000);
  });

  it('korekta zakupu: suma pozycji daje różnicę po korekcie', () => {
    const lines = parseFa3(fixture('fa3-kor-pln.xml')).lines;
    const effects = lines.map((l) => effect(lineRecord(l, ctx({ direction: DIRECTION.PURCHASE }))));
    // przed: −(−1000) = +1000, po: −800 -> koszt spadł o 200
    expect(effects).toEqual([1_000_000_000, -800_000_000]);
  });

  it('waluta obca: kurs z wiersza ma pierwszeństwo przed kursem faktury', () => {
    const lines = parseFa3(fixture('fa3-vat-eur.xml')).lines;
    const records = lines.map((l) => lineRecord(l, ctx({ currency: 'EUR', invoiceRate: 4.2563 })));
    expect(records[0].netAmount).toEqual({ amountMicros: 1_000_500_000, currencyCode: 'EUR' });
    expect(effect(records[0])).toBe(4_258_428_150);
    expect(effect(records[1])).toBe(-43_000_000);
  });

  it('bez kursu wpływ pozostaje pusty', () => {
    const [line] = parseFa3(fixture('fa3-vat-eur.xml')).lines;
    expect(lineRecord(line, ctx({ currency: 'EUR' })).marginEffectPln).toBeNull();
  });
});
