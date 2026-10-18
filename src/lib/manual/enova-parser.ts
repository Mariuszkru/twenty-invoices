import { XMLParser } from 'fast-xml-parser';

import { toMicros } from 'src/lib/decimal';
import { ManualImportError, type ManualInvoice, type ManualLine } from 'src/lib/manual/types';

// Parser eksportu enova w formacie „Optima offline” (ROOT xmlns="http://www.cdn.com.pl/optima/offline").
// Bierze tylko rejestr sprzedaży VAT (REJESTRY_SPRZEDAZY_VAT); pozycje to wiersze rejestru per stawka VAT,
// bez nazw towarów. Faktury spoza KSeF to wyłącznie sprzedaż B2C, więc kontrahentów (KONTRAHENCI) pomijamy.

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ['REJESTR_SPRZEDAZY_VAT', 'POZYCJA', 'PLATNOSC'].includes(name),
});

type Node = Record<string, unknown>;

const str = (value: unknown): string | null => {
  if (value === undefined || value === null || typeof value === 'object') return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const amount = (value: unknown, field: string, number: string): number => {
  const micros = toMicros(str(value));
  if (micros === null) throw new ManualImportError(`Faktura ${number}: brak kwoty ${field}.`);
  return micros;
};

// "8.00" + opodatkowana -> "8" (jak P_12 w FA(3)); zwolniona -> "zw"; inne statusy zapisujemy wprost.
const vatRateOf = (rate: string | null, status: string | null): string | null => {
  if (status === 'zwolniona') return 'zw';
  if (status && status !== 'opodatkowana') return status;
  return rate === null ? null : rate.replace(/\.?0+$/, '');
};

const parseLine = (raw: Node, number: string): ManualLine => {
  const netMicros = amount(raw.NETTO, 'NETTO', number);
  const vatMicros = amount(raw.VAT, 'VAT', number);
  return {
    name: null,
    quantity: null,
    unit: null,
    unitNetPriceMicros: null,
    vatRate: vatRateOf(str(raw.STAWKA_VAT), str(raw.STATUS_VAT)),
    netMicros,
    vatMicros,
    netPlnMicros: toMicros(str(raw.NETTO_SYS)) ?? netMicros,
    vatPlnMicros: toMicros(str(raw.VAT_SYS)) ?? vatMicros,
  };
};

const parseInvoice = (raw: Node): ManualInvoice => {
  const number = str(raw.NUMER);
  if (!number) throw new ManualImportError('Faktura bez numeru (NUMER) w rejestrze sprzedaży.');
  const payment = ((raw.PLATNOSCI as Node | undefined)?.PLATNOSC as Node[] | undefined)?.[0];
  const issueDate = str(raw.DATA_WYSTAWIENIA);
  const saleDate = str(raw.DATA_SPRZEDAZY);
  const lines = ((raw.POZYCJE as Node | undefined)?.POZYCJA as Node[] | undefined) ?? [];
  if (lines.length === 0) throw new ManualImportError(`Faktura ${number}: brak pozycji.`);
  return {
    number,
    issueDate,
    // jak w FA(3): puste, gdy równa dacie wystawienia
    saleDate: saleDate === issueDate ? null : saleDate,
    dueDate: str(raw.TERMIN) ?? str(payment?.TERMIN_PLAT),
    isCorrection: str(raw.KOREKTA)?.toUpperCase() === 'TAK',
    correctedNumber: str(raw.KOREKTA_NUMER),
    currency: str(payment?.WALUTA_DOK)?.toUpperCase() ?? 'PLN',
    buyerName: [str(raw.NAZWA1), str(raw.NAZWA2)].filter(Boolean).join(' ') || str(raw.PODMIOT),
    buyerTaxId: str(raw.NIP),
    paymentMethod: str(raw.FORMA_PLATNOSCI),
    description: str(raw.OPIS),
    lines: lines.map((line) => parseLine(line, number)),
  };
};

export const parseEnovaXml = (xml: string): ManualInvoice[] => {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (e) {
    throw new ManualImportError(`Niepoprawny XML: ${(e as Error).message}`);
  }
  const root = doc.ROOT as Node | undefined;
  if (!root) throw new ManualImportError('Plik nie jest eksportem enova (brak elementu ROOT).');
  const register = root.REJESTRY_SPRZEDAZY_VAT as Node | undefined;
  const invoices = (register?.REJESTR_SPRZEDAZY_VAT as Node[] | undefined) ?? [];
  if (invoices.length === 0) {
    throw new ManualImportError('Plik nie zawiera faktur sprzedaży (REJESTRY_SPRZEDAZY_VAT).');
  }
  return invoices.map(parseInvoice);
};
