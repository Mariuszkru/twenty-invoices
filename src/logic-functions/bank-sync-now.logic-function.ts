import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { bankSyncFromEnv } from 'src/lib/bank/bank-from-env';

// Ręczne pobranie wyciągu z panelu połączenia z bankiem. Liczy się do dziennego limitu zapytań PSD2 (ok. 4 na rachunek).
// Przebieg trwa kilka sekund, więc uruchamiamy go od razu: zadanie z kolejki potrafiło po wdrożeniu korzystać
// z nieaktualnego schematu GraphQL (brak nowego obiektu), a bezpośrednie wywołanie nie.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankSyncNow,
  name: 'bank-sync-now',
  description: 'Pobiera wyciąg bankowy od razu (ręczne uruchomienie z panelu).',
  timeoutSeconds: 120,
  httpRouteTriggerSettings: {
    path: '/bank/sync',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const result = await bankSyncFromEnv();
    console.log(`[bank-sync-now] ${JSON.stringify(result)}`);
    return result;
  },
});
