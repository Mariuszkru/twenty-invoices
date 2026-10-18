import { defineLogicFunction } from 'twenty-sdk/define';
import { enqueueJobs } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { readBankConfig } from 'src/lib/bank/bank-from-env';

// Ręczne pobranie wyciągu z panelu połączenia z bankiem. Liczy się do dziennego limitu zapytań PSD2 (ok. 4 na rachunek).
export default defineLogicFunction({
  universalIdentifier: ID.fnBankSyncNow,
  name: 'bank-sync-now',
  description: 'Kolejkuje natychmiastowe pobranie wyciągu bankowego.',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/bank/sync',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const config = readBankConfig();
    if ('error' in config) return { ok: false, message: config.error };
    await enqueueJobs({ logicFunctionUniversalIdentifier: ID.fnBankSync, jobs: [{ payload: {} }] });
    return { ok: true, queued: true };
  },
});
