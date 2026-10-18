import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { appKv, bankSyncFromEnv, readBankConfig } from 'src/lib/bank/bank-from-env';
import { BANK_KV_KEYS } from 'src/lib/bank/run-bank-sync';
import { dueSlot, parseSyncTimes } from 'src/lib/bank/schedule';

// Pobieranie wyciągu o godzinach z BANK_SYNC_TIMES (czas polski). Wzorzec crona jest stały w manifeście, więc
// funkcja budzi się co 10 minut i sama sprawdza, czy minął kolejny termin; bank odpytuje tylko wtedy.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankSync,
  name: 'bank-sync',
  description: 'Pobiera wyciąg bankowy z Enable Banking o ustawionych godzinach i oznacza zapłacone faktury.',
  timeoutSeconds: 120,
  cronTriggerSettings: { pattern: '*/10 * * * *' },
  handler: async () => {
    if ('error' in readBankConfig()) return { skipped: 'NOT_CONFIGURED' };
    const { times, ignored } = parseSyncTimes(process.env.BANK_SYNC_TIMES);
    const slot = dueSlot(times, new Date(), await appKv.get<string>(BANK_KV_KEYS.lastSlot));
    if (!slot) return { skipped: 'NOT_DUE' };

    // termin zapisujemy przed pobraniem: awaria albo timeout nie może powtórzyć zapytania do banku (limit PSD2)
    await appKv.set(BANK_KV_KEYS.lastSlot, slot);
    if (ignored.length) console.log(`[bank-sync] pominięte godziny z BANK_SYNC_TIMES: ${ignored.join(', ')}`);
    const result = await bankSyncFromEnv();
    console.log(`[bank-sync] termin ${slot}: ${JSON.stringify(result)}`);
    return { slot, ...result };
  },
});
