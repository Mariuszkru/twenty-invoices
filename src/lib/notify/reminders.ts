import { addDays, dueRemindersMessage, warsawDate } from 'src/lib/notify/messages';
import type { KvStore } from 'src/lib/sync/rate-budget';
import type { InvoiceStore } from 'src/lib/sync/store';

// Codzienne przypomnienie o niezapłaconych fakturach z terminem za N dni (domyślnie 3 i 1).
// Przeterminowanych nie pokazujemy, dopóki status płatności nie pochodzi z wyciągów bankowych.

export const KV_LAST_REMINDER_DATE = 'ksef:reminders:last-date';

export const parseReminderDays = (value: string | undefined): number[] => {
  const days = (value ?? '3,1')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d > 0);
  return [...new Set(days)].sort((a, b) => b - a);
};

type ReminderDeps = {
  store: Pick<InvoiceStore, 'findUnpaidDueOn'>;
  kv: KvStore;
  send: (text: string) => Promise<void>;
  crmUrl: string | null;
  days: number[];
  now: Date;
};

export const sendPaymentReminders = async (deps: ReminderDeps) => {
  const today = warsawDate(deps.now);
  if ((await deps.kv.get<string>(KV_LAST_REMINDER_DATE)) === today) {
    return { sent: false, reason: 'ALREADY_SENT_TODAY' as const };
  }

  const dates = deps.days.map((days) => ({ days, date: addDays(today, days) }));
  const due = await deps.store.findUnpaidDueOn(dates.map((d) => d.date));
  const groups = dates.map(({ days, date }) => ({
    days,
    date,
    invoices: due.filter((i) => i.dueDate === date),
  }));

  const message = dueRemindersMessage(groups, deps.crmUrl);
  if (message) await deps.send(message);
  await deps.kv.set(KV_LAST_REMINDER_DATE, today);
  return { sent: message !== null, invoices: due.length };
};
