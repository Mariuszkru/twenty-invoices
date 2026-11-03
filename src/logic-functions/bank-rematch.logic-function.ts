import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { appKv } from 'src/lib/bank/bank-from-env';
import { REMATCH_DAYS, rematchUnmatched } from 'src/lib/bank/rematch';
import { BANK_KV_KEYS } from 'src/lib/bank/run-bank-sync';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';
import { errorMessage } from 'src/lib/sync/import-details';

type LockValue = { until: number };
const LOCK_TTL_MS = 2 * 60 * 1000;

// Przycisk "Dopasuj automatycznie": to samo dopasowanie co przebieg dzienny, na danych już zapisanych w CRM,
// bez zapytania do banku. Dotyczy tylko nieprzypisanych transakcji; rozliczeń automatycznych i ręcznych nie zmienia.
// Wspólny lock z pobieraniem wyciągu, żeby dwa przebiegi nie przypięły tej samej transakcji dwa razy.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankRematch,
  name: 'bank-rematch',
  description: 'Ponawia automatyczne dopasowanie nieprzypisanych transakcji bankowych do faktur z CRM.',
  timeoutSeconds: 120,
  httpRouteTriggerSettings: {
    path: '/bank/rematch',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const now = Date.now();
    const lock = await appKv.get<LockValue>(BANK_KV_KEYS.lock);
    if (lock && lock.until > now) {
      return { ok: false, message: 'Trwa pobieranie wyciągu albo dopasowanie. Spróbuj za chwilę.' };
    }
    await appKv.set(BANK_KV_KEYS.lock, { until: now + LOCK_TTL_MS } satisfies LockValue);
    try {
      const result = await rematchUnmatched(createTwentyBankStore(), now);
      console.log(`[bank-rematch] ${JSON.stringify(result)}`);
      return { ok: true, days: REMATCH_DAYS, ...result };
    } catch (e) {
      console.error(`[bank-rematch] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    } finally {
      await appKv.set(BANK_KV_KEYS.lock, { until: 0 } satisfies LockValue);
    }
  },
});
