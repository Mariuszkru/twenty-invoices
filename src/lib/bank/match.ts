import { BANK_DIRECTION, DIRECTION, type Direction } from 'src/constants/options';
import type { BankTransactionRecord } from 'src/lib/bank/transactions';
import type { Currency } from 'src/lib/sync/mapping';

// Dopasowanie transakcji do faktury. Zasada: nigdy nie zgadujemy między kilkoma kandydatami – niepewna
// transakcja zostaje nieprzypisana z uwagą, dlaczego. Ta sama funkcja działa na fakturach otwartych
// i na już zapłaconych (wtedy `paidAmount` to suma przypiętych transakcji, a nie pole faktury).

// 1 grosz w micros
export const AMOUNT_TOLERANCE_MICROS = 10_000;
// płatność kartą albo przez bramkę (PayU, Przelewy24, Paynow) bez numeru w tytule: data faktury blisko księgowania
export const CARD_DATE_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OpenInvoice = {
  id: string;
  name: string | null;
  ksefNumber: string | null;
  ksefPaymentId: string | null;
  direction: Direction;
  grossAmount: Currency | null;
  paidAmount: Currency | null;
  bankAccount: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
};

export type MatchableTransaction = Pick<
  BankTransactionRecord,
  'direction' | 'amount' | 'remittanceInformation' | 'counterpartyName' | 'counterpartyAccount' | 'bookingDate'
>;

export type MatchResult = { invoiceId: string | null; note: string };

export const remainingMicros = (invoice: OpenInvoice): number =>
  (invoice.grossAmount?.amountMicros ?? 0) -
  (invoice.paidAmount?.currencyCode === invoice.grossAmount?.currencyCode ? (invoice.paidAmount?.amountMicros ?? 0) : 0);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Numer faktury w tytule przelewu: separatory (/ - _ . spacja) są opcjonalne, a numer musi stać osobno,
// żeby "1/2026" nie trafiało w "11/2026".
const partsPattern = (parts: string[]) =>
  new RegExp(`(?<![A-Z0-9])${parts.map(escapeRegExp).join('[\\s/\\\\\\-_.]*')}(?![A-Z0-9])`);

const numberParts = (number: string) => number.toUpperCase().split(/[\s/\\\-_.]+/).filter(Boolean);

const numberPattern = (number: string): RegExp | null => {
  const parts = numberParts(number);
  return parts.join('').length < 4 ? null : partsPattern(parts);
};

// Rdzeń numeru bez literowego prefiksu ("FV 31/09/2026" -> "31/09/2026"), bo klienci piszą "FRA", "F-ra", "Faktura".
// Co najmniej dwie części i jedna z cyfrą, żeby sam rok czy pojedyncza liczba nie dawały trafień.
const corePattern = (number: string): RegExp | null => {
  const parts = numberParts(number);
  const first = parts.findIndex((p) => /\d/.test(p));
  if (first <= 0) return null;
  const core = parts.slice(first);
  return core.length >= 2 && core.join('').length >= 5 ? partsPattern(core) : null;
};

const titleMentions = (title: string, invoice: OpenInvoice): string | null => {
  const upper = title.toUpperCase();
  if (invoice.ksefNumber && upper.includes(invoice.ksefNumber.toUpperCase())) return 'numer KSeF';
  if (invoice.ksefPaymentId && invoice.ksefPaymentId.length >= 6 && upper.includes(invoice.ksefPaymentId.toUpperCase())) {
    return 'identyfikator płatności KSeF';
  }
  const pattern = invoice.name ? numberPattern(invoice.name) : null;
  return pattern?.test(upper) ? 'numer faktury' : null;
};

export const normalizeAccount = (value: string | null): string | null => {
  const digits = value?.replace(/[^0-9]/g, '') ?? '';
  // polski NRB ma 26 cyfr; IBAN z prefiksem PL porównujemy po tych samych cyfrach
  return digits.length >= 10 ? digits.slice(-26) : null;
};

const normalizeName = (value: string | null) =>
  (value ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Ł/g, 'L')
    .replace(/[^A-Z0-9]/g, '');

// Nazwy z banku bywają ucięte albo z dopiskami ("SPÓŁKA Z O.O." vs "SP. Z O.O.") – wystarcza zgodny początek.
const namesMatch = (a: string | null, b: string | null) => {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x.length < 4 || y.length < 4) return false;
  const prefix = Math.min(12, x.length, y.length);
  return x.slice(0, prefix) === y.slice(0, prefix);
};

const formatAmount = (micros: number) => (micros / 1_000_000).toFixed(2);

export const matchTransaction = (tx: MatchableTransaction, invoices: OpenInvoice[]): MatchResult => {
  const direction = tx.direction === BANK_DIRECTION.CREDIT ? DIRECTION.SALE : DIRECTION.PURCHASE;
  const candidates = invoices.filter(
    (i) =>
      i.direction === direction &&
      i.grossAmount?.currencyCode === tx.amount.currencyCode &&
      (i.grossAmount?.amountMicros ?? 0) > 0 &&
      remainingMicros(i) > AMOUNT_TOLERANCE_MICROS,
  );
  const amountFits = (i: OpenInvoice) => Math.abs(remainingMicros(i) - tx.amount.amountMicros) < AMOUNT_TOLERANCE_MICROS;

  // 1) numer faktury, numer KSeF albo IPKSeF w tytule
  const title = tx.remittanceInformation ?? '';
  const byNumber = title
    ? candidates.flatMap((i) => {
        const reason = titleMentions(title, i);
        return reason ? [{ invoice: i, reason }] : [];
      })
    : [];
  const numberHit = byNumber.length > 1 ? byNumber.filter((h) => amountFits(h.invoice)) : byNumber;
  if (numberHit.length === 1) {
    const { invoice, reason } = numberHit[0];
    const remaining = remainingMicros(invoice);
    const amountNote =
      tx.amount.amountMicros + AMOUNT_TOLERANCE_MICROS < remaining
        ? `, wpłata częściowa (pozostało ${formatAmount(remaining - tx.amount.amountMicros)})`
        : tx.amount.amountMicros - AMOUNT_TOLERANCE_MICROS > remaining
          ? `, nadpłata ${formatAmount(tx.amount.amountMicros - remaining)}`
          : '';
    return { invoiceId: invoice.id, note: `W tytule ${reason} ${invoice.name ?? ''}`.trim() + amountNote };
  }
  if (byNumber.length > 1) {
    return {
      invoiceId: null,
      note: `Tytuł pasuje do kilku faktur: ${byNumber.map((h) => h.invoice.name ?? h.invoice.id).join(', ')}`,
    };
  }

  // 1b) sam rdzeń numeru (inny prefiks niż na fakturze) – tylko przy zgodnej kwocie
  const byCore = title
    ? candidates.filter((i) => amountFits(i) && i.name && corePattern(i.name)?.test(title.toUpperCase()))
    : [];
  if (byCore.length === 1) {
    return { invoiceId: byCore[0].id, note: `W tytule numer ${byCore[0].name ?? ''} (inny prefiks) i zgodna kwota` };
  }

  // 2) bez numeru: dokładna kwota i potwierdzony kontrahent (rachunek przy zakupie, nazwa przy sprzedaży)
  const byAmount = candidates.filter(amountFits);
  const confirmed = byAmount.filter((i) =>
    direction === DIRECTION.PURCHASE
      ? normalizeAccount(tx.counterpartyAccount) !== null &&
        normalizeAccount(tx.counterpartyAccount) === normalizeAccount(i.bankAccount)
      : namesMatch(tx.counterpartyName, i.counterpartyName),
  );
  if (confirmed.length === 1) {
    const by = direction === DIRECTION.PURCHASE ? 'rachunek odbiorcy' : 'nazwa kontrahenta';
    return { invoiceId: confirmed[0].id, note: `Zgodna kwota i ${by} (${confirmed[0].name ?? ''})` };
  }
  if (confirmed.length > 1) {
    return { invoiceId: null, note: `Kilka faktur tego kontrahenta z tą kwotą (${confirmed.length})` };
  }

  // 3) wydatek kartą albo przez bramkę płatności: bank nie podaje dostawcy, więc dokładna kwota i data faktury
  // ±3 dni od księgowania. Gdy rachunek odbiorcy należy do znanego dostawcy, ta reguła nie ma zastosowania.
  const txAccount = normalizeAccount(tx.counterpartyAccount);
  const knownSupplier = txAccount !== null && candidates.some((i) => normalizeAccount(i.bankAccount) === txAccount);
  if (direction === DIRECTION.PURCHASE && tx.bookingDate && !knownSupplier) {
    const booked = Date.parse(`${tx.bookingDate}T00:00:00Z`);
    const byDate = byAmount.filter(
      (i) => i.issueDate && Math.abs(Date.parse(`${i.issueDate.slice(0, 10)}T00:00:00Z`) - booked) <= CARD_DATE_WINDOW_DAYS * DAY_MS,
    );
    if (byDate.length === 1) {
      return {
        invoiceId: byDate[0].id,
        note: `Zgodna kwota i data faktury ±${CARD_DATE_WINDOW_DAYS} dni (${byDate[0].name ?? ''}, ${byDate[0].counterpartyName ?? ''})`,
      };
    }
    if (byDate.length > 1) {
      return {
        invoiceId: null,
        note: `Kilka faktur z tą kwotą i datą: ${byDate.map((i) => i.name ?? i.id).join(', ')}`,
      };
    }
  }

  if (byAmount.length > 0) {
    return {
      invoiceId: null,
      note: `Faktury z tą kwotą (${byAmount.length}), ale kontrahent się nie zgadza: ${byAmount
        .slice(0, 5)
        .map((i) => i.name ?? i.id)
        .join(', ')}`,
    };
  }
  return { invoiceId: null, note: 'Brak faktury z tym numerem albo kwotą' };
};
