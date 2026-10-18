import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { appKv, bankSyncFromEnv } from 'src/lib/bank/bank-from-env';
import { BANK_KV_KEYS } from 'src/lib/bank/run-bank-sync';
import { manualFetchAllowed, shouldCountManual, warsawClock } from 'src/lib/bank/schedule';

// Ręczne pobranie wyciągu z panelu, raz dziennie: z trzema terminami automatycznymi daje 4 zapytania, limit PSD2.
// Przebieg trwa kilka sekund, więc uruchamiamy go od razu: zadanie z kolejki potrafiło po wdrożeniu korzystać
// z nieaktualnego schematu GraphQL (brak nowego obiektu), a bezpośrednie wywołanie nie.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankSyncNow,
  name: 'bank-sync-now',
  description: 'Pobiera wyciąg bankowy od razu (ręczne uruchomienie z panelu, raz dziennie).',
  timeoutSeconds: 120,
  httpRouteTriggerSettings: {
    path: '/bank/sync',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const now = new Date();
    if (!manualFetchAllowed(await appKv.get<string>(BANK_KV_KEYS.manualDate), now)) {
      return { ok: false, limited: true, message: 'Ręczne pobranie było już dziś użyte. Następne możliwe jutro.' };
    }
    const result = await bankSyncFromEnv();
    if (shouldCountManual(result)) await appKv.set(BANK_KV_KEYS.manualDate, warsawClock(now).date);
    console.log(`[bank-sync-now] ${JSON.stringify(result)}`);
    return result;
  },
});
