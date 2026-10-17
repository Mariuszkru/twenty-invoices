import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { syncFromEnv } from 'src/lib/sync/sync-from-env';

// Cykliczna synchronizacja. MF zaleca interwał nie krótszy niż 15 minut na podmiot.
// Uruchamiana też jako zadanie w tle przez ksef-sync-now.
export default defineLogicFunction({
  universalIdentifier: ID.fnSyncCron,
  name: 'ksef-sync',
  description: 'Pobiera nowe faktury sprzedaży i zakupu z KSeF oraz ich pozycje.',
  timeoutSeconds: 300,
  cronTriggerSettings: { pattern: '*/15 * * * *' },
  handler: async () => syncFromEnv(240_000),
});
