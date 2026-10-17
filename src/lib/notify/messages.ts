import { DIRECTION, type Direction } from 'src/constants/options';
import type { Currency } from 'src/lib/sync/mapping';

// Treści wiadomości na czat (markdown Rocket.Chat: *pogrubienie*, [tekst](url)).

export type InvoiceSummary = {
  id: string;
  name: string | null;
  counterpartyName: string | null;
  direction: Direction;
  grossAmount: Currency | null;
  dueDate: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Data kalendarzowa w Polsce (cron chodzi w UTC, a termin płatności to data polska).
export const warsawDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(now);

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const formatMoney = (amount: Currency | null): string => {
  if (!amount) return '—';
  const value = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount.amountMicros / 1_000_000)
    .replace(/ /g, ' ');
  return `${value} ${amount.currencyCode}`;
};

const formatDate = (date: string) => date.split('-').reverse().join('.');

export const recordUrl = (crmUrl: string | null, id: string) =>
  crmUrl ? `${crmUrl.replace(/\/+$/, '')}/object/ksefInvoice/${id}` : null;

const invoiceLine = (invoice: InvoiceSummary, crmUrl: string | null) => {
  const url = recordUrl(crmUrl, invoice.id);
  const number = url ? `[${invoice.name ?? 'bez numeru'}](${url})` : (invoice.name ?? 'bez numeru');
  const due = invoice.dueDate ? `termin ${formatDate(invoice.dueDate)}` : 'brak terminu na fakturze';
  return `• *${invoice.counterpartyName ?? 'nieznany kontrahent'}* – ${number} – ${formatMoney(invoice.grossAmount)} brutto – ${due}`;
};

export const newPurchaseInvoicesMessage = (invoices: InvoiceSummary[], crmUrl: string | null) =>
  [
    invoices.length === 1
      ? ':page_facing_up: Nowa faktura zakupowa w KSeF:'
      : `:page_facing_up: Nowe faktury zakupowe w KSeF (${invoices.length}):`,
    ...invoices.map((i) => invoiceLine(i, crmUrl)),
  ].join('\n');

const daysLabel = (days: number) => (days === 1 ? 'jutro' : `za ${days} dni`);

// null = nic do przypomnienia (nie wysyłamy pustej wiadomości)
export const dueRemindersMessage = (
  groups: { days: number; date: string; invoices: InvoiceSummary[] }[],
  crmUrl: string | null,
): string | null => {
  const sections = groups.flatMap(({ days, date, invoices }) => {
    const purchases = invoices.filter((i) => i.direction === DIRECTION.PURCHASE);
    const sales = invoices.filter((i) => i.direction === DIRECTION.SALE);
    return [
      ...(purchases.length
        ? [`*Do zapłaty ${daysLabel(days)} (${formatDate(date)}):*`, ...purchases.map((i) => invoiceLine(i, crmUrl))]
        : []),
      ...(sales.length
        ? [`*Klienci – termin ${daysLabel(days)} (${formatDate(date)}):*`, ...sales.map((i) => invoiceLine(i, crmUrl))]
        : []),
    ];
  });
  return sections.length ? [':alarm_clock: Zbliżające się terminy płatności', ...sections].join('\n') : null;
};
