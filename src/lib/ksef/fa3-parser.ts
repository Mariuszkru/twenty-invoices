import { XMLParser } from 'fast-xml-parser';

import { parseDecimal, toMicros } from 'src/lib/decimal';

// Parser e-faktury FA(3) (schemat_FA(3)_v1-0E.xsd). Bierze tylko to, czego potrzebuje dodatek:
// dane nagłówka, które nie występują w metadanych, oraz pozycje (FaWiersz).

export type ParsedLine = {
  lineNo: number | null;
  name: string | null;
  unit: string | null;
  quantity: number | null;
  unitNetPriceMicros: number | null;
  netMicros: number;
  grossMicros: number | null;
  vatRate: string | null;
  gtin: string | null;
  pkwiu: string | null;
  productCode: string | null;
  uuid: string | null;
  isBeforeCorrection: boolean;
  exchangeRate: number | null;
};

export type ParsedInvoice = {
  currency: string;
  issueDate: string | null;
  saleDate: string | null;
  invoiceNumber: string | null;
  invoiceType: string | null;
  correctedKsefNumbers: string[];
  headerExchangeRate: number | null;
  lines: ParsedLine[];
};

export class Fa3ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Fa3ParseError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'FaWiersz' || name === 'DaneFaKorygowanej',
});

const str = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const parseLine = (row: Record<string, unknown>): ParsedLine => {
  const quantity = parseDecimal(str(row.P_8B));
  const unitNet = toMicros(str(row.P_9A));
  const gross = toMicros(str(row.P_11A));
  const lineVat = toMicros(str(row.P_11Vat));

  // P_11 bywa pominięte (faktury liczone od brutto, art. 106e ust. 7 i 8) – wtedy netto = brutto − VAT albo ilość × cena.
  let net = toMicros(str(row.P_11));
  if (net === null && gross !== null && lineVat !== null) net = gross - lineVat;
  if (net === null && quantity !== null && unitNet !== null) net = Math.round(quantity * unitNet);

  const lineNo = str(row.NrWierszaFa);
  return {
    lineNo: lineNo === null ? null : Number(lineNo),
    name: str(row.P_7),
    unit: str(row.P_8A),
    quantity,
    unitNetPriceMicros: unitNet,
    netMicros: net ?? 0,
    grossMicros: gross,
    vatRate: str(row.P_12) ?? str(row.P_12_XII),
    gtin: str(row.GTIN),
    pkwiu: str(row.PKWiU),
    productCode: str(row.Indeks),
    uuid: str(row.UU_ID),
    isBeforeCorrection: str(row.StanPrzed) === '1',
    exchangeRate: parseDecimal(str(row.KursWaluty)),
  };
};

export const parseFa3 = (xml: string): ParsedInvoice => {
  let doc: Record<string, any>;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new Fa3ParseError(`Niepoprawny XML faktury: ${(e as Error).message}`);
  }
  const fa = doc?.Faktura?.Fa;
  if (!fa || typeof fa !== 'object') {
    throw new Fa3ParseError('XML nie zawiera elementu Faktura/Fa (nieobsługiwany schemat).');
  }

  const rows: Record<string, unknown>[] = Array.isArray(fa.FaWiersz) ? fa.FaWiersz : [];
  const corrected: Record<string, unknown>[] = Array.isArray(fa.DaneFaKorygowanej)
    ? fa.DaneFaKorygowanej
    : [];

  return {
    currency: str(fa.KodWaluty) ?? 'PLN',
    issueDate: str(fa.P_1),
    saleDate: str(fa.P_6),
    invoiceNumber: str(fa.P_2),
    invoiceType: str(fa.RodzajFaktury),
    correctedKsefNumbers: corrected
      .map((c) => str(c.NrKSeFFaKorygowanej))
      .filter((n): n is string => n !== null),
    headerExchangeRate: parseDecimal(str(fa.KursWalutyZ)),
    lines: rows.map(parseLine),
  };
};
