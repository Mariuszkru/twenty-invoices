import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createMemoryStore } from 'src/lib/__tests__/memory-store';
import { importManualInvoices, paymentMethodOf } from 'src/lib/manual/import-manual';
import { decodeImportFile, parseImportFile } from 'src/lib/manual/parse-file';
import { ManualImportError, type ManualInvoice } from 'src/lib/manual/types';

// Zanonimizowane fragmenty prawdziwych eksportów, zapisane w windows-1250 jak oryginały.
const load = (name: string) => parseImportFile(decodeImportFile(readFileSync(join(__dirname, 'fixtures', name))));
const enova = () => load('enova-sprzedaz-b2c.xml');
const symfonia = () => load('symfonia-sprzedaz-b2c.txt');

const correction: ManualInvoice = {
  number: 'FVK 1/10/2026',
  issueDate: '2026-10-01',
  saleDate: null,
  dueDate: '2026-10-08',
  isCorrection: true,
  correctedNumber: 'FV 33/09/2026',
  currency: 'PLN',
  buyerName: 'Zofia Wąsowska',
  buyerTaxId: null,
  paymentMethod: 'Przelew',
  description: null,
  lines: [
    {
      name: null,
      quantity: null,
      unit: null,
      unitNetPriceMicros: null,
      vatRate: '8',
      netMicros: -1_000_000_000,
      vatMicros: -80_000_000,
      netPlnMicros: -1_000_000_000,
      vatPlnMicros: -80_000_000,
    },
  ],
};

describe('parseImportFile – enova XML', () => {
  it('dekoduje windows-1250 według deklaracji i czyta rejestr sprzedaży', () => {
    const { format, invoices } = enova();
    expect(format).toBe('ENOVA');
    expect(invoices[0]).toEqual({
      number: 'FV 33/09/2026',
      issueDate: '2026-09-21',
      saleDate: null,
      dueDate: '2026-09-28',
      isCorrection: false,
      correctedNumber: null,
      currency: 'PLN',
      buyerName: 'Zofia Wąsowska',
      buyerTaxId: null,
      paymentMethod: 'Gotówka',
      description: null,
      lines: [
        {
          name: null,
          quantity: null,
          unit: null,
          unitNetPriceMicros: null,
          vatRate: '8',
          netMicros: 16_000_000_000,
          vatMicros: 1_280_000_000,
          netPlnMicros: 16_000_000_000,
          vatPlnMicros: 1_280_000_000,
        },
      ],
    });
    expect(invoices[1]).toMatchObject({ number: 'FVZ 3/07/2026', saleDate: '2026-07-23' });
  });

  it('odrzuca XML, który nie jest eksportem enova', () => {
    expect(() => parseImportFile('<Faktura><Fa/></Faktura>')).toThrow(ManualImportError);
    expect(() => parseImportFile('<ROOT><KONTRAHENCI/></ROOT>')).toThrow(/REJESTRY_SPRZEDAZY_VAT/);
  });
});

describe('parseImportFile – Symfonia', () => {
  it('dekoduje windows-1250 bez deklaracji i czyta dokumenty z nazwami pozycji', () => {
    const { format, invoices } = symfonia();
    expect(format).toBe('SYMFONIA');
    expect(invoices).toEqual([
      {
        number: 'FV 26/07/2026',
        issueDate: '2026-07-21',
        saleDate: null,
        dueDate: '2026-07-28',
        isCorrection: false,
        correctedNumber: null,
        currency: 'PLN',
        buyerName: 'Jan Kowalski',
        buyerTaxId: null,
        paymentMethod: null,
        description: null,
        lines: [
          {
            name: 'Montaż klimatyzacji rotenso teta w domu jednorodzinnym',
            quantity: 1,
            unit: 'szt.',
            unitNetPriceMicros: 3_009_260_000,
            vatRate: '8',
            netMicros: 3_009_260_000,
            vatMicros: 240_740_000,
            netPlnMicros: 3_009_260_000,
            vatPlnMicros: 240_740_000,
          },
        ],
      },
      expect.objectContaining({
        number: 'FVZ 3/07/2026',
        saleDate: '2026-07-23',
        buyerName: 'Zofia Wąsowska',
        lines: [expect.objectContaining({ name: 'Montaż klimatyzacji Rotenso Teta 7kW + 2,6kW', netMicros: 13_425_930_000 })],
      }),
    ]);
  });

  it('pomija dokumenty anulowane i nie-sprzedażowe', () => {
    const text = decodeImportFile(readFileSync(join(__dirname, 'fixtures', 'symfonia-sprzedaz-b2c.txt')));
    const cancelled = text.replace('anulowany =0', 'anulowany =1');
    expect(parseImportFile(cancelled).invoices.map((i) => i.number)).toEqual(['FVZ 3/07/2026']);
  });

  it('rozpoznaje korektę (FKS) z numerem faktury korygowanej z NazwaKor i pseudostawkę zwolnioną', () => {
    const text = decodeImportFile(readFileSync(join(__dirname, 'fixtures', 'symfonia-sprzedaz-b2c.txt')));
    const kor = text
      .replace('kod =FVZ 3/07/2026', 'kod =FKS 1/10/2026')
      .replace(/(FKS 1\/10\/2026[\s\S]*?)obsluguj jak =FVS/, '$1obsluguj jak =FKS')
      .replace(/(FKS 1\/10\/2026[\s\S]*?)NazwaKor =FVS/, '$1NazwaKor =FV 26/07/2026')
      .replace(/(FKS 1\/10\/2026[\s\S]*?)wartstvat =800/, '$1wartstvat =-100');
    const [fv, fks] = parseImportFile(kor).invoices;
    expect(fv).toMatchObject({ isCorrection: false, correctedNumber: null });
    expect(fks).toMatchObject({ number: 'FKS 1/10/2026', isCorrection: true, correctedNumber: 'FV 26/07/2026' });
    expect(fks.lines[0].vatRate).toBe('zw');
  });

  it('odrzuca nieznany format', () => {
    expect(() => parseImportFile('Numer;Data;Kwota')).toThrow(/Nieznany format/);
  });
});

describe('importManualInvoices', () => {
  it('tworzy faktury sprzedaży B2C z pozycjami i wiąże nabywcę z osobą', async () => {
    const { store, manualInvoices, lines } = createMemoryStore();
    const result = await importManualInvoices(store, symfonia().invoices);

    expect(result).toEqual({
      created: ['FV 26/07/2026', 'FVZ 3/07/2026'],
      updated: [],
      failed: [],
      linkedToPerson: 1,
    });
    const [jan, zofia] = manualInvoices;
    expect(jan).toMatchObject({
      name: 'FV 26/07/2026',
      ksefNumber: null,
      source: 'MANUAL',
      direction: 'SALE',
      invoiceType: 'VAT',
      personId: 'person-jan',
      netAmount: { amountMicros: 3_009_260_000, currencyCode: 'PLN' },
      vatAmount: { amountMicros: 240_740_000, currencyCode: 'PLN' },
      grossAmount: { amountMicros: 3_250_000_000, currencyCode: 'PLN' },
      paymentMethod: null,
      syncStatus: 'COMPLETE',
      paymentStatus: 'UNPAID',
    });
    expect(zofia.personId).toBeNull();
    expect(lines.filter((l) => l.invoiceId === jan.id)).toMatchObject([
      {
        name: 'Montaż klimatyzacji rotenso teta w domu jednorodzinnym',
        quantity: 1,
        unit: 'szt.',
        unitNetPrice: { amountMicros: 3_009_260_000 },
        vatRate: '8',
        marginEffectPln: { amountMicros: 3_009_260_000 },
      },
    ]);
  });

  it('rejestr VAT z enova bez nazw pozycji dostaje nazwę zastępczą i formę płatności', async () => {
    const { store, manualInvoices, lines } = createMemoryStore();
    await importManualInvoices(store, enova().invoices);
    expect(manualInvoices[0]).toMatchObject({ source: 'MANUAL', paymentMethod: 'CASH', dueDate: '2026-09-28' });
    expect(lines.find((l) => l.invoiceId === manualInvoices[0].id)?.name).toBe('Sprzedaż (VAT 8%)');
  });

  it('Symfonia po enova aktualizuje te same faktury: nazwy pozycji, bez dubli i bez utraty danych', async () => {
    const { store, manualInvoices, lines } = createMemoryStore();
    await importManualInvoices(store, enova().invoices);
    const fvz = manualInvoices.find((i) => i.name === 'FVZ 3/07/2026')!;
    // zmiany zrobione w CRM po pierwszym imporcie
    Object.assign(fvz, { paymentStatus: 'PAID', personId: 'person-anna-2' });

    const result = await importManualInvoices(store, symfonia().invoices);
    expect(result.created).toEqual(['FV 26/07/2026']);
    expect(result.updated).toEqual(['FVZ 3/07/2026']);
    expect(manualInvoices).toHaveLength(3);
    expect(fvz).toMatchObject({ source: 'MANUAL', paymentStatus: 'PAID', personId: 'person-anna-2', paymentMethod: 'CASH' });
    expect(lines.filter((l) => l.invoiceId === fvz.id).map((l) => l.name)).toEqual([
      'Montaż klimatyzacji Rotenso Teta 7kW + 2,6kW',
    ]);
  });

  it('ponowny import tego samego pliku niczego nie dubluje', async () => {
    const { store, manualInvoices, lines } = createMemoryStore();
    await importManualInvoices(store, symfonia().invoices);
    const again = await importManualInvoices(store, symfonia().invoices);
    expect(again.created).toEqual([]);
    expect(again.updated).toEqual(['FV 26/07/2026', 'FVZ 3/07/2026']);
    expect(manualInvoices).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });

  it('korekta z tej samej paczki wskazuje fakturę korygowaną i ma ujemną marżę', async () => {
    const { store, manualInvoices, lines } = createMemoryStore();
    await importManualInvoices(store, [correction, ...enova().invoices]);
    const original = manualInvoices.find((i) => i.name === 'FV 33/09/2026')!;
    const kor = manualInvoices.find((i) => i.name === 'FVK 1/10/2026')!;
    expect(kor).toMatchObject({ invoiceType: 'KOR', correctedInvoiceId: original.id, paymentMethod: 'TRANSFER' });
    expect(lines.find((l) => l.invoiceId === kor.id)?.marginEffectPln).toEqual({
      amountMicros: -1_000_000_000,
      currencyCode: 'PLN',
    });
  });

  it('błąd zapisu pozycji oznacza fakturę jako ERROR i nie przerywa paczki', async () => {
    const { store, manualInvoices } = createMemoryStore();
    let calls = 0;
    const failing = {
      ...store,
      replaceLines: async (...args: Parameters<typeof store.replaceLines>) => {
        if (calls++ === 0) throw new Error('timeout');
        return store.replaceLines(...args);
      },
    };
    const result = await importManualInvoices(failing, symfonia().invoices);
    expect(result.failed).toEqual([{ number: 'FV 26/07/2026', error: 'timeout' }]);
    expect(result.created).toEqual(['FVZ 3/07/2026']);
    expect(manualInvoices[0]).toMatchObject({ syncStatus: 'ERROR', syncError: 'Import pozycji nieudany: timeout' });
  });
});

describe('paymentMethodOf', () => {
  it('mapuje nazwy form płatności', () => {
    expect(paymentMethodOf('Gotówka')).toBe('CASH');
    expect(paymentMethodOf('Przelew 14 dni')).toBe('TRANSFER');
    expect(paymentMethodOf('Kompensata')).toBe('OTHER');
    expect(paymentMethodOf(null)).toBeNull();
  });
});
