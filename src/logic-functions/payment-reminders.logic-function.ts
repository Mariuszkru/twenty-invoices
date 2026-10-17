import { defineLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { notifierFromEnv } from 'src/lib/notify/from-env';
import { parseReminderDays, sendPaymentReminders } from 'src/lib/notify/reminders';
import { createTwentyStore } from 'src/lib/sync/twenty-store';

// Codzienny przegląd terminów płatności na Rocket.Chat. Cron jest w UTC: 6:00 = 8:00 latem, 7:00 zimą.
export default defineLogicFunction({
  universalIdentifier: ID.fnPaymentReminders,
  name: 'payment-reminders',
  description: 'Wysyła na Rocket.Chat listę niezapłaconych faktur z terminem za 3 dni i za 1 dzień.',
  timeoutSeconds: 30,
  cronTriggerSettings: { pattern: '0 6 * * *' },
  handler: async () => {
    const notifier = notifierFromEnv();
    if (!notifier) return { sent: false, reason: 'NO_WEBHOOK' };
    return sendPaymentReminders({
      store: createTwentyStore(),
      kv: { get: (key) => kv.get(key), set: (key, value) => kv.set(key, value) },
      send: notifier.send,
      crmUrl: notifier.crmUrl,
      days: parseReminderDays(process.env.PAYMENT_REMINDER_DAYS),
      now: new Date(),
    });
  },
});
