import { describe, expect, it } from 'vitest';

import { DIRECTION } from 'src/constants/options';
import {
  dueRemindersMessage,
  formatMoney,
  newPurchaseInvoicesMessage,
  warsawDate,
  type InvoiceSummary,
} from 'src/lib/notify/messages';
import { parseReminderDays, sendPaymentReminders } from 'src/lib/notify/reminders';
import { createRocketChatSender } from 'src/lib/notify/rocketchat';
import { createMemoryKv } from 'src/lib/__tests__/memory-store';

const CRM = 'https://crm.example.pl/';

const invoice = (overrides: Partial<InvoiceSummary>): InvoiceSummary => ({
  id: 'inv-1',
  name: 'FV/1/10/2026',
  counterpartyName: 'Dostawca Sp. z o.o.',
  direction: DIRECTION.PURCHASE,
  grossAmount: { amountMicros: 1_845_500_000, currencyCode: 'PLN' },
  dueDate: '2026-10-20',
  ...overrides,
});

describe('formatowanie', () => {
  it('kwota po polsku', () => {
    expect(formatMoney({ amountMicros: 12_345_678_900, currencyCode: 'PLN' })).toBe('12 345,68 PLN');
    expect(formatMoney(null)).toBe('—');
  });

  it('data w strefie Europe/Warsaw (cron chodzi w UTC)', () => {
    expect(warsawDate(new Date('2026-10-17T22:30:00Z'))).toBe('2026-10-18');
    expect(warsawDate(new Date('2026-01-17T22:30:00Z'))).toBe('2026-01-17');
  });

  it('nowe faktury zakupowe z linkiem do CRM', () => {
    expect(newPurchaseInvoicesMessage([invoice({})], CRM)).toBe(
      ':page_facing_up: Nowa faktura zakupowa w KSeF:\n' +
        '• *Dostawca Sp. z o.o.* – [FV/1/10/2026](https://crm.example.pl/object/ksefInvoice/inv-1) – 1845,50 PLN brutto – termin 20.10.2026',
    );
    expect(newPurchaseInvoicesMessage([invoice({ dueDate: null }), invoice({ id: 'inv-2' })], null)).toContain(
      'Nowe faktury zakupowe w KSeF (2):\n• *Dostawca Sp. z o.o.* – FV/1/10/2026 – 1845,50 PLN brutto – brak terminu na fakturze',
    );
  });

  it('przypomnienie rozdziela zakupy i klientów, pomija puste grupy', () => {
    const message = dueRemindersMessage(
      [
        { days: 3, date: '2026-10-20', invoices: [invoice({}), invoice({ id: 'inv-2', direction: DIRECTION.SALE, counterpartyName: 'Klient' })] },
        { days: 1, date: '2026-10-18', invoices: [] },
      ],
      null,
    );
    expect(message).toBe(
      ':alarm_clock: Zbliżające się terminy płatności\n' +
        '*Do zapłaty za 3 dni (20.10.2026):*\n' +
        '• *Dostawca Sp. z o.o.* – FV/1/10/2026 – 1845,50 PLN brutto – termin 20.10.2026\n' +
        '*Klienci – termin za 3 dni (20.10.2026):*\n' +
        '• *Klient* – FV/1/10/2026 – 1845,50 PLN brutto – termin 20.10.2026',
    );
    expect(dueRemindersMessage([{ days: 1, date: '2026-10-18', invoices: [] }], null)).toBeNull();
  });
});

describe('sendPaymentReminders', () => {
  const setup = (due: InvoiceSummary[]) => {
    const sent: string[] = [];
    const queried: string[][] = [];
    const { kv } = createMemoryKv();
    const run = (now: Date) =>
      sendPaymentReminders({
        store: {
          findUnpaidDueOn: async (dates) => {
            queried.push(dates);
            return due.filter((i) => i.dueDate && dates.includes(i.dueDate));
          },
        },
        kv,
        send: async (text) => void sent.push(text),
        crmUrl: null,
        days: parseReminderDays('3,1'),
        now,
      });
    return { sent, queried, run };
  };

  it('pyta o terminy za 3 i 1 dzień (data polska) i wysyła raz dziennie', async () => {
    const { sent, queried, run } = setup([invoice({ dueDate: '2026-10-20' }), invoice({ id: 'x', dueDate: '2026-10-18' })]);

    expect(await run(new Date('2026-10-17T06:00:00Z'))).toMatchObject({ sent: true, invoices: 2 });
    expect(queried).toEqual([['2026-10-20', '2026-10-18']]);
    expect(sent[0]).toContain('za 3 dni (20.10.2026)');
    expect(sent[0]).toContain('jutro (18.10.2026)');

    expect(await run(new Date('2026-10-17T10:00:00Z'))).toMatchObject({ sent: false, reason: 'ALREADY_SENT_TODAY' });
    expect(sent).toHaveLength(1);
  });

  it('nic do przypomnienia -> brak wiadomości', async () => {
    const { sent, run } = setup([]);
    expect(await run(new Date('2026-10-17T06:00:00Z'))).toMatchObject({ sent: false, invoices: 0 });
    expect(sent).toEqual([]);
  });

  it.each([
    ['3,1', [3, 1]],
    ['1, 7,3,abc,0,3', [7, 3, 1]],
    [undefined, [3, 1]],
  ])('parseReminderDays(%s)', (input, expected) => {
    expect(parseReminderDays(input)).toEqual(expected);
  });
});

describe('createRocketChatSender', () => {
  it('wysyła JSON {text} i zgłasza błąd HTTP', async () => {
    const calls: { url: string; body: string }[] = [];
    const ok = createRocketChatSender('https://chat/hooks/x', (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response('{"success":true}', { status: 200 });
    }) as unknown as typeof fetch);
    await ok('cześć');
    expect(calls).toEqual([{ url: 'https://chat/hooks/x', body: '{"text":"cześć"}' }]);

    const failing = createRocketChatSender('https://chat/hooks/x', (async () =>
      new Response('', { status: 404 })) as unknown as typeof fetch);
    await expect(failing('x')).rejects.toThrow('HTTP 404');
  });
});
