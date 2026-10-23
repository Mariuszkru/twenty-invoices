import { ALLOCATION_STATUS, DIRECTION, ENTRY_TYPE, type EntryType } from 'src/constants/options';
import { AMOUNT_TOLERANCE_MICROS } from 'src/lib/bank/match';
import { convertMicros, sumMicros } from 'src/lib/decimal';
import type { StoredEntry, StoredLine, StoredProject } from 'src/lib/projects/store';
import type { Currency } from 'src/lib/sync/mapping';

// Czysta logika marży projektu. Wszystko liczone od zera z bieżących danych, więc kolejność zdarzeń nie ma znaczenia.

const PLN = 'PLN';

export const formatMoney = (value: Currency) => `${(value.amountMicros / 1_000_000).toFixed(2)} ${value.currencyCode}`;

// Netto pozycji ze znakiem korekty: wiersz "stan przed korektą" odejmuje się od wiersza po korekcie.
export const lineSignedNet = (line: StoredLine): Currency | null =>
  line.netAmount
    ? { amountMicros: line.netAmount.amountMicros * (line.isBeforeCorrection ? -1 : 1) || 0, currencyCode: line.netAmount.currencyCode }
    : null;

// Podpowiedź typu z rodzaju dokumentu: sprzedaż → przychód, zakup → koszt.
export const defaultEntryType = (direction: string | null): EntryType | null =>
  direction === DIRECTION.SALE ? ENTRY_TYPE.REVENUE : direction === DIRECTION.PURCHASE ? ENTRY_TYPE.COST : null;

// Kurs pozycji do PLN: ten sam, którym synchronizacja policzyła marginEffectPln (kurs z faktury albo NBP).
const lineRateToPln = (line: StoredLine): number | null => {
  const net = line.netAmount;
  if (!net) return null;
  if (net.currencyCode === PLN) return 1;
  if (!net.amountMicros || !line.marginEffectPln) return null;
  return Math.abs(line.marginEffectPln.amountMicros) / Math.abs(net.amountMicros);
};

export type PlnConversion = { amountPln: Currency | null; issue: string | null };

// Kwota pozycji projektu w PLN. Nigdy nie sumujemy różnych walut bez kursu – brak kursu to uwaga, nie zero.
export const entryAmountPln = (amount: Currency | null, line: StoredLine | null): PlnConversion => {
  if (!amount) return { amountPln: null, issue: 'Brak kwoty.' };
  if (amount.currencyCode === PLN) return { amountPln: amount, issue: null };
  if (!line?.netAmount) return { amountPln: null, issue: `Brak kursu ${amount.currencyCode}: przypnij pozycję faktury albo podaj kwotę w PLN.` };
  if (line.netAmount.currencyCode !== amount.currencyCode) {
    return { amountPln: null, issue: `Waluta kwoty (${amount.currencyCode}) inna niż waluta pozycji (${line.netAmount.currencyCode}).` };
  }
  const rate = lineRateToPln(line);
  if (rate === null) return { amountPln: null, issue: `Brak kursu ${amount.currencyCode} na fakturze.` };
  return { amountPln: { amountMicros: convertMicros(amount.amountMicros, rate), currencyCode: PLN }, issue: null };
};

const sameCurrencyTotal = (entries: Pick<StoredEntry, 'amount'>[], currencyCode: string) =>
  sumMicros(entries.filter((e) => e.amount?.currencyCode === currencyCode).map((e) => e.amount!.amountMicros));

// Niepodzielona reszta pozycji faktury – domyślna kwota nowego przypisania.
export const remainingLineAmount = (line: StoredLine, otherEntries: Pick<StoredEntry, 'amount'>[]): Currency | null => {
  const net = lineSignedNet(line);
  if (!net) return null;
  const rest = net.amountMicros - sameCurrencyTotal(otherEntries, net.currencyCode);
  // reszta o przeciwnym znaku (pozycja już przekroczona) to nie podpowiedź, tylko 0
  return { amountMicros: rest * Math.sign(net.amountMicros) > 0 ? rest : 0, currencyCode: net.currencyCode };
};

export type LineAllocation = { status: string; overIssue: string | null };

// Status "Przypisanie do usługi" i kontrola, że suma przypisań nie przekracza netto pozycji (w znaku pozycji).
export const lineAllocation = (line: StoredLine, entries: Pick<StoredEntry, 'amount'>[]): LineAllocation => {
  const net = lineSignedNet(line);
  if (!entries.length || !net) return { status: ALLOCATION_STATUS.UNASSIGNED, overIssue: null };
  const total = sameCurrencyTotal(entries, net.currencyCode);
  const sign = Math.sign(net.amountMicros) || 1;
  const limit = Math.abs(net.amountMicros);
  const over = total * sign > limit + AMOUNT_TOLERANCE_MICROS || total * sign < -AMOUNT_TOLERANCE_MICROS;
  const overIssue = over
    ? `Suma przypisań pozycji (${formatMoney({ amountMicros: total, currencyCode: net.currencyCode })}) nie mieści się w jej netto (${formatMoney(net)}).`
    : null;
  const status = Math.abs(total) >= limit - AMOUNT_TOLERANCE_MICROS ? ALLOCATION_STATUS.ASSIGNED : ALLOCATION_STATUS.PARTIAL;
  return { status, overIssue };
};

export type ProjectMargin = {
  revenuePln: Currency;
  costPln: Currency;
  marginPln: Currency;
  marginPercent: number | null;
  skipped: number;
};

// Przychód = Σ PRZYCHÓD, koszt = Σ KOSZT (netto PLN), marża = przychód − koszt, marża % = marża / przychód.
export const computeMargin = (entries: Pick<StoredEntry, 'type' | 'amountPln'>[]): ProjectMargin => {
  const counted = entries.filter((e) => e.type && e.amountPln);
  const total = (type: EntryType) =>
    sumMicros(counted.filter((e) => e.type === type).map((e) => e.amountPln!.amountMicros));
  const revenue = total(ENTRY_TYPE.REVENUE);
  const cost = total(ENTRY_TYPE.COST);
  const margin = revenue - cost;
  return {
    revenuePln: { amountMicros: revenue, currencyCode: PLN },
    costPln: { amountMicros: cost, currencyCode: PLN },
    marginPln: { amountMicros: margin, currencyCode: PLN },
    // przy przychodzie 0 marża procentowa nie istnieje
    marginPercent: revenue === 0 ? null : Math.round((margin / revenue) * 10_000) / 10_000,
    skipped: entries.length - counted.length,
  };
};

type ClientIds = Pick<StoredProject, 'companyId' | 'personId'>;

export const clientName = (project: StoredProject): string | null =>
  project.companyId ? project.companyName : project.personId ? project.personName : null;

export const clientIssue = ({ companyId, personId }: ClientIds): string | null => {
  if (companyId && personId) return 'Projekt ma jednocześnie firmę i osobę: zostaw tylko jedno.';
  if (!companyId && !personId) return 'Brak klienta: ustaw firmę albo osobę.';
  return null;
};

export const CLIENT_REJECTED_NOTE = 'Odrzucono zmianę klienta: projekt może mieć firmę albo osobę, nie obie naraz.';

// Odrzucenie klienta "firma i osoba naraz": wraca do stanu sprzed zapisu (dla nowego projektu – bez klienta).
// null = zapis poprawny, nic nie cofamy.
export const rejectedClientChange = (before: ClientIds | null, after: ClientIds): ClientIds | null => {
  if (!after.companyId || !after.personId) return null;
  if (before?.companyId && before.personId) return { companyId: before.companyId, personId: null };
  return { companyId: before?.companyId ?? null, personId: before?.personId ?? null };
};
