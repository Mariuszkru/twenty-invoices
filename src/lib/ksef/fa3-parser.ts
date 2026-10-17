import { XMLParser } from 'fast-xml-parser';

import { parseDecimal, toMicros } from 'src/lib/decimal';
import { parsePayment, type ParsedPayment } from 'src/lib/ksef/fa3-payment';

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
  payment: ParsedPayment;
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
  isArray: (name) =>
    ['FaWiersz', 'DaneFaKorygowanej', 'TerminPlatnosci', 'ZaplataCzesciowa', 'RachunekBankowy'].includes(name),
});

const str = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const GROSZ_MICROS = 10_000;

// "23" -> 23, "0 KR" -> 0, "zw" / "oo" / "np I" -> null (bez VAT w kwocie brutto)
export const numericVatRate = (rate: string | null): number | null => {
  const match = rate === null ? null : /^(\d+(?:[.,]\d+)?)/.exec(rate);
  return match ? Number(match[1].replace(',', '.')) : null;
};

// Netto z brutto zaokrąglone do grosza; dla stawek nienumerycznych (zw, oo, np) brutto = netto.
export const netFromGross = (grossMicros: number, rate: string | null): number => {
  const numeric = numericVatRate(rate);
  if (!numeric) return grossMicros;
  return Math.round((grossMicros * 100) / (100 + numeric) / GROSZ_MICROS) * GROSZ_MICROS;
};

// Sumy netto w nagłówku (P_13_x) dla stawek, z których faktura liczona od brutto wylicza VAT.
const HEADER_NET_BY_RATE: Record<string, string> = {
  '23': 'P_13_1',
  '22': 'P_13_1',
  '8': 'P_13_2',
  '7': 'P_13_2',
  '5': 'P_13_3',
  '4': 'P_13_4',
  '3': 'P_13_4',
};

type RawLine = { line: ParsedLine; netDerivedFromGross: boolean };

const parseLine = (row: Record<string, unknown>): RawLine => {
  const quantity = parseDecimal(str(row.P_8B));
  const unitNet = toMicros(str(row.P_9A));
  const gross = toMicros(str(row.P_11A));
  const lineVat = toMicros(str(row.P_11Vat));
  const vatRate = str(row.P_12) ?? str(row.P_12_XII);

  // Faktury liczone od brutto (art. 106e ust. 7 i 8) nie mają P_11: netto = brutto − VAT wiersza,
  // a gdy i tego brak – brutto przeliczone stawką (VAT liczy się wtedy od sumy brutto w nagłówku).
  let net = toMicros(str(row.P_11));
  let netDerivedFromGross = false;
  if (net === null && gross !== null && lineVat !== null) net = gross - lineVat;
  if (net === null && quantity !== null && unitNet !== null) net = Math.round(quantity * unitNet);
  if (net === null && gross !== null) {
    net = netFromGross(gross, vatRate);
    netDerivedFromGross = true;
  }

  const lineNo = str(row.NrWierszaFa);
  return {
    netDerivedFromGross,
    line: {
      lineNo: lineNo === null ? null : Number(lineNo),
      name: str(row.P_7),
      unit: str(row.P_8A),
      quantity,
      unitNetPriceMicros: unitNet,
      netMicros: net ?? 0,
      grossMicros: gross,
      vatRate,
      gtin: str(row.GTIN),
      pkwiu: str(row.PKWiU),
      productCode: str(row.Indeks),
      uuid: str(row.UU_ID),
      isBeforeCorrection: str(row.StanPrzed) === '1',
      exchangeRate: parseDecimal(str(row.KursWaluty)),
    },
  };
};

// Netto wyliczone z brutto per wiersz może różnić się o grosze od sumy w nagłówku (VAT liczony od sumy brutto).
// Różnicę przenosimy na największą pozycję danej stawki, żeby suma pozycji zgadzała się z fakturą.
const reconcileWithHeader = (raw: RawLine[], fa: Record<string, unknown>) => {
  if (raw.some((r) => r.line.isBeforeCorrection)) return;
  const groups = new Map<string, RawLine[]>();
  for (const r of raw) {
    const header = HEADER_NET_BY_RATE[String(numericVatRate(r.line.vatRate))];
    if (header) groups.set(header, [...(groups.get(header) ?? []), r]);
  }
  for (const [header, lines] of groups) {
    const headerNet = toMicros(str(fa[header]));
    if (headerNet === null || !lines.every((l) => l.netDerivedFromGross)) continue;
    const diff = headerNet - lines.reduce((acc, l) => acc + l.line.netMicros, 0);
    if (diff === 0 || Math.abs(diff) > lines.length * GROSZ_MICROS) continue;
    const largest = lines.reduce((a, b) =>
      Math.abs(b.line.netMicros) > Math.abs(a.line.netMicros) ? b : a,
    );
    largest.line.netMicros += diff;
  }
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
  const raw = rows.map(parseLine);
  reconcileWithHeader(raw, fa);

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
    lines: raw.map((r) => r.line),
    payment: parsePayment(fa.Platnosc),
  };
};
