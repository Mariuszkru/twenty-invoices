import { convertMicros, parseDecimal, toMicros } from 'src/lib/decimal';
import { ManualImportError, type ManualInvoice, type ManualLine } from 'src/lib/manual/types';

// Parser tekstowego formatu wymiany Symfonii AMS („INFO{ … }”, bloki „Nazwa{ … }” i wiersze „klucz =wartość”),
// eksportowanego np. przez Systim. Dokumentacja: https://pomoc.symfonia.pl/data/fk/erp/2022_1/data/import_specjalny_(format_3_0).htm Bierze dokumenty sprzedaży (Dokument, rodzaj_dok = sprzedaży) z pozycjami
// towarowymi; pomija dokumenty anulowane oraz zapisy księgowe (Zapis) i rejestr VAT (Rejestr).

type Block = { name: string; fields: Map<string, string>; children: Block[] };

// Drzewo bloków. Klucz powtórzony w bloku (np. „kurs”, „opis” w części FK) – obowiązuje pierwsze wystąpienie.
export const parseBlocks = (text: string): Block => {
  const root: Block = { name: '', fields: new Map(), children: [] };
  const stack = [root];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const current = stack[stack.length - 1];
    if (line.endsWith('{')) {
      const block: Block = { name: line.slice(0, -1).trim(), fields: new Map(), children: [] };
      current.children.push(block);
      stack.push(block);
    } else if (line.startsWith('}')) {
      if (stack.length > 1) stack.pop();
    } else {
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!current.fields.has(key)) current.fields.set(key, line.slice(eq + 1).trim());
    }
  }
  return root;
};

const field = (block: Block | undefined, key: string): string | null => {
  const value = block?.fields.get(key)?.trim();
  return value ? value : null;
};

const child = (block: Block, name: string) => block.children.find((c) => c.name === name);

const findAll = (block: Block, name: string): Block[] =>
  block.children.flatMap((c) => (c.name === name ? [c] : findAll(c, name)));

const amount = (block: Block, key: string, number: string): number => {
  const micros = toMicros(field(block, key));
  if (micros === null) throw new ManualImportError(`Faktura ${number}: brak kwoty ${key}.`);
  return micros;
};

// Pseudostawki z dokumentacji importu specjalnego (sekcja „pozycja vat”): ujemne wartości zamiast procentu.
const PSEUDO_RATES: Record<number, string> = { [-1]: 'zw', [-2]: 'np' };

// wartstvat to stawka × 100 (800 = 8%); ujemna – pseudostawka
const vatRateOf = (value: string | null): string | null => {
  const raw = parseDecimal(value);
  if (raw === null) return null;
  if (raw < 0) return PSEUDO_RATES[raw / 100] ?? PSEUDO_RATES[raw] ?? null;
  return String(raw / 100);
};

// Typy wzorcowe FK (pole ObsługujJak); Systim wpisuje je też w NazwaKor dokumentów niekorygujących.
const DOCUMENT_TYPES = new Set(['DP', 'FVZ', 'FKZ', 'FVS', 'FKS', 'DIM', 'DEX', 'RUZ', 'RKZ', 'RUS', 'RKS', 'RK', 'WB', 'RZL', 'FWN', 'WNT', 'WDT', 'PWN']);

const asDocumentNumber = (value: string | null) => (value && !DOCUMENT_TYPES.has(value) ? value : null);

const parseLine = (raw: Block, number: string, rate: number | null): ManualLine => {
  const netMicros = amount(raw, 'wartnetto', number);
  const vatMicros = amount(raw, 'wartvat', number);
  const quantity = parseDecimal(field(raw, 'ilosc'));
  const toPln = (micros: number) => (rate === null ? micros : convertMicros(micros, rate));
  return {
    name: field(raw, 'opis') ?? field(raw, 'kod'),
    quantity,
    unit: field(raw, 'jm'),
    // „cena” bywa ceną brutto (faktury liczone od brutto), więc cenę netto liczymy z wartości netto
    unitNetPriceMicros: quantity ? Math.round(netMicros / quantity) : null,
    vatRate: vatRateOf(field(raw, 'wartstvat')),
    netMicros,
    vatMicros,
    netPlnMicros: toPln(netMicros),
    vatPlnMicros: toPln(vatMicros),
  };
};

const parseDocument = (doc: Block, numbersById: Map<string, string>): ManualInvoice => {
  const number = field(doc, 'kod');
  if (!number) throw new ManualImportError('Dokument sprzedaży bez numeru (kod).');
  const currency = field(doc, 'waluta')?.toUpperCase() ?? 'PLN';
  const rate = currency === 'PLN' ? null : parseDecimal(field(doc, 'kurs'));
  const lines = doc.children.filter((c) => c.name === 'Pozycja dokumentu');
  if (lines.length === 0) throw new ManualImportError(`Faktura ${number}: brak pozycji.`);
  const buyer = child(doc, 'Dane nabywcy') ?? doc;
  const issueDate = field(doc, 'data');
  const saleDate = field(doc, 'datasp');
  // korekta sprzedaży: typ wzorcowy FKS albo odwołanie do dokumentu korygowanego
  const correctedId = field(doc, 'iddokkoryg');
  const isCorrection =
    field(doc, 'obsluguj jak') === 'FKS' || field(doc, 'd') === 'FKS' || (correctedId !== null && correctedId !== '0');
  // numer faktury korygowanej: NazwaKor dokumentu, numerKor rejestru VAT, a w ostateczności dokument z tego pliku
  const correctedNumber = isCorrection
    ? (asDocumentNumber(field(doc, 'NazwaKor')) ??
      asDocumentNumber(field(child(doc, 'Rejestr'), 'numerKor')) ??
      (correctedId ? (numbersById.get(correctedId) ?? null) : null))
    : null;
  return {
    number,
    issueDate,
    // jak w FA(3): puste, gdy równa dacie wystawienia
    saleDate: saleDate === issueDate ? null : saleDate,
    dueDate: field(doc, 'plattermin'),
    isCorrection,
    correctedNumber,
    currency,
    buyerName: field(buyer, 'khnazwa'),
    buyerTaxId: field(buyer, 'khnip'),
    // forma_platnosci to kod liczbowy bez słownika w pliku ani w dokumentacji formatu – nie zgadujemy
    paymentMethod: null,
    description: field(doc, 'opis'),
    lines: lines.map((line) => parseLine(line, number, rate)),
  };
};

export const parseSymfoniaText = (text: string): ManualInvoice[] => {
  const root = parseBlocks(text);
  if (!root.children.some((c) => c.name === 'INFO')) {
    throw new ManualImportError('Plik nie jest eksportem w formacie Symfonii (brak bloku INFO).');
  }
  const documents = findAll(root, 'Dokument').filter(
    (d) => field(d, 'rodzaj_dok') === 'sprzedaży' && field(d, 'anulowany') !== '1',
  );
  if (documents.length === 0) throw new ManualImportError('Plik nie zawiera dokumentów sprzedaży.');
  const numbersById = new Map(
    documents.flatMap((d) => {
      const id = field(d, 'id');
      const number = field(d, 'kod');
      return id && number ? [[id, number] as const] : [];
    }),
  );
  return documents.map((d) => parseDocument(d, numbersById));
};
