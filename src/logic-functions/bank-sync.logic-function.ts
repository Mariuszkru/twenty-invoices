import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { bankSyncFromEnv } from 'src/lib/bank/bank-from-env';

// Codzienne pobranie wyciągu i dopasowanie płatności. Cron w UTC: 5:00, godzinę przed payment-reminders,
// żeby przypomnienia pomijały faktury opłacone poprzedniego dnia.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankSync,
  name: 'bank-sync',
  description: 'Pobiera wyciąg bankowy z Enable Banking i oznacza zapłacone faktury.',
  timeoutSeconds: 120,
  cronTriggerSettings: { pattern: '0 5 * * *' },
  handler: async () => {
    const result = await bankSyncFromEnv();
    console.log(`[bank-sync] ${JSON.stringify(result)}`);
    return result;
  },
});
