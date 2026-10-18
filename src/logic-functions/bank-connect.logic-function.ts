import { randomUUID } from 'node:crypto';

import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { appKv, bankClientFor, callbackUrl, readBankConfig } from 'src/lib/bank/bank-from-env';
import { BankConfigError, startAuthorization } from 'src/lib/bank/consent';
import { BANK_KV_KEYS } from 'src/lib/bank/run-bank-sync';
import { errorMessage } from 'src/lib/sync/import-details';

const STATE_TTL_MS = 15 * 60 * 1000;

export type PendingState = { value: string; expiresAt: number };

// Początek autoryzacji w banku: zwraca adres logowania. Losowy `state` (jednorazowy, 15 min) chroni callback
// przed podstawieniem cudzego kodu autoryzacji.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankConnect,
  name: 'bank-connect',
  description: 'Rozpoczyna autoryzację dostępu do rachunku bankowego w Enable Banking.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/bank/connect',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async () => {
    const config = readBankConfig();
    if ('error' in config) return { ok: false, message: config.error };
    const redirectUrl = callbackUrl();
    if (!redirectUrl) return { ok: false, message: 'Ustaw zmienną CRM_URL – z niej powstaje adres powrotu z banku.' };

    const state = randomUUID();
    await appKv.set(BANK_KV_KEYS.state, { value: state, expiresAt: Date.now() + STATE_TTL_MS } satisfies PendingState);
    try {
      const auth = await startAuthorization({
        client: bankClientFor(config),
        aspspName: config.aspsp,
        country: config.country,
        redirectUrl,
        state,
        now: new Date(),
      });
      return { ok: true, ...auth };
    } catch (e) {
      if (!(e instanceof BankConfigError)) console.error(`[bank-connect] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    }
  },
});
