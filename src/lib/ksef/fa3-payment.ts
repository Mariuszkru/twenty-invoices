import { DUE_DATE_SOURCE, PAYMENT_METHOD_BY_CODE, type DueDateSource } from 'src/constants/options';
import { sumMicros, toMicros } from 'src/lib/decimal';

// Sekcja Fa/Platnosc z FA(3): terminy, zapłaty przy wystawieniu, forma płatności, rachunek, IPKSeF.

export type RelativeTerm = { count: number; unit: string; event: string };

export type ParsedPayment = {
  dueDates: string[];
  relativeTerms: RelativeTerm[];
  // stan z chwili wystawienia faktury
  paidInFull: boolean;
  paidAt: string | null;
  partialPaidMicros: number | null;
  method: string | null;
  bankAccount: string | null;
  ksefPaymentId: string | null;
};

const str = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? [value as Record<string, unknown>] : [];

const methodOf = (node: Record<string, unknown>): string | null => {
  const code = str(node.FormaPlatnosci);
  if (code) return PAYMENT_METHOD_BY_CODE[code] ?? 'OTHER';
  return str(node.PlatnoscInna) === '1' ? 'OTHER' : null;
};

export const EMPTY_PAYMENT: ParsedPayment = {
  dueDates: [],
  relativeTerms: [],
  paidInFull: false,
  paidAt: null,
  partialPaidMicros: null,
  method: null,
  bankAccount: null,
  ksefPaymentId: null,
};

export const parsePayment = (platnosc: unknown): ParsedPayment => {
  if (!platnosc || typeof platnosc !== 'object') return EMPTY_PAYMENT;
  const p = platnosc as Record<string, unknown>;

  const terms = asArray(p.TerminPlatnosci);
  const partials = asArray(p.ZaplataCzesciowa);
  const partialFlag = str(p.ZnacznikZaplatyCzesciowej);
  const partialDates = partials.map((z) => str(z.DataZaplatyCzesciowej)).filter((d): d is string => !!d);

  const paidInFull = str(p.Zaplacono) === '1' || partialFlag === '2';
  const paidAt =
    str(p.DataZaplaty) ?? (partialDates.length > 0 ? [...partialDates].sort().reverse()[0] : null);

  return {
    dueDates: terms.map((t) => str(t.Termin)).filter((d): d is string => !!d),
    relativeTerms: terms.flatMap((t) => {
      const opis = t.TerminOpis as Record<string, unknown> | undefined;
      const count = Number(str(opis?.Ilosc));
      const unit = str(opis?.Jednostka);
      const event = str(opis?.ZdarzeniePoczatkowe);
      return opis && Number.isFinite(count) && unit ? [{ count, unit, event: event ?? '' }] : [];
    }),
    paidInFull,
    paidAt,
    partialPaidMicros:
      partials.length > 0
        ? sumMicros(partials.map((z) => toMicros(str(z.KwotaZaplatyCzesciowej)) ?? 0))
        : null,
    method: methodOf(p) ?? partials.map(methodOf).find((m) => m !== null) ?? null,
    bankAccount: str(asArray(p.RachunekBankowy)[0]?.NrRB)?.replace(/\s/g, '') ?? null,
    ksefPaymentId: str(p.IPKSeF),
  };
};

const addToDate = (date: string, count: number, unit: 'day' | 'month'): string => {
  const d = new Date(`${date}T00:00:00Z`);
  if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + count);
  else d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
};

type TermContext = {
  issueDate: string | null;
  saleDate: string | null;
  // dla faktur KSeF data otrzymania = data nadania numeru KSeF (u nas: data zapisu w KSeF)
  receivedDate: string | null;
};

// "14 dni od daty wystawienia" -> data. null, gdy jednostki albo zdarzenia nie da się jednoznacznie ustalić.
export const resolveRelativeTerm = (term: RelativeTerm, ctx: TermContext): string | null => {
  const unit = term.unit.toLowerCase();
  const event = term.event.toLowerCase();

  let step: { count: number; unit: 'day' | 'month' } | null = null;
  if (/^(dz|dni|d\.?$|day)/.test(unit)) step = { count: term.count, unit: 'day' };
  else if (/^(tydz|tyg|week)/.test(unit)) step = { count: term.count * 7, unit: 'day' };
  else if (/^(mies|m-c|month)/.test(unit)) step = { count: term.count, unit: 'month' };
  if (!step) return null;

  let base: string | null = null;
  if (/wystaw/.test(event)) base = ctx.issueDate;
  else if (/(dostaw|wykona|sprzeda|realiz|usług|uslug)/.test(event)) base = ctx.saleDate ?? ctx.issueDate;
  else if (/(dor[eę]cz|otrzym|odbi[oó]r|przyj|wp[łl]yw|ksef)/.test(event)) base = ctx.receivedDate;
  if (!base) return null;

  return addToDate(base, step.count, step.unit);
};

// Najwcześniejszy termin: daty z faktury mają pierwszeństwo przed wyliczonymi z opisu.
export const resolveDueDate = (
  payment: ParsedPayment,
  ctx: TermContext,
): { dueDate: string; source: DueDateSource } | null => {
  if (payment.dueDates.length > 0) {
    return { dueDate: [...payment.dueDates].sort()[0], source: DUE_DATE_SOURCE.INVOICE };
  }
  const resolved = payment.relativeTerms
    .map((t) => resolveRelativeTerm(t, ctx))
    .filter((d): d is string => !!d)
    .sort();
  return resolved.length > 0 ? { dueDate: resolved[0], source: DUE_DATE_SOURCE.DESCRIPTION } : null;
};
