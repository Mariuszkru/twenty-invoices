import { defineLogicFunction } from 'twenty-sdk/define';
import { enqueueJobs } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { readSyncConfig } from 'src/lib/sync/sync-from-env';

// Ręczne uruchomienie z menu poleceń. Synchronizacja trwa do kilku minut, więc tylko kolejkujemy zadanie
// i odpowiadamy od razu; nakładanie się z cronem blokuje lock w KV.
export default defineLogicFunction({
  universalIdentifier: ID.fnSyncNow,
  name: 'ksef-sync-now',
  description: 'Kolejkuje natychmiastową synchronizację faktur z KSeF.',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/ksef/sync',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const config = readSyncConfig();
    if ('error' in config) {
      return { ok: false, error: 'CONFIG', message: config.error };
    }
    await enqueueJobs({
      logicFunctionUniversalIdentifier: ID.fnSyncCron,
      jobs: [{ payload: {} }],
    });
    return { ok: true, queued: true };
  },
});
