import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { appKv, loadBankSession, readBankConfig } from 'src/lib/bank/bank-from-env';
import { BANK_KV_KEYS, type BankSyncSummary } from 'src/lib/bank/run-bank-sync';

// Stan połączenia dla panelu w CRM: front component nie widzi sekretnych zmiennych, więc dostaje tylko
// to, co można pokazać (bank, rachunki, ważność zgody, ostatni przebieg).
export default defineLogicFunction({
  universalIdentifier: ID.fnBankStatus,
  name: 'bank-status',
  description: 'Zwraca stan połączenia z bankiem i ostatniego pobrania wyciągu.',
  timeoutSeconds: 10,
  httpRouteTriggerSettings: {
    path: '/bank/status',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler: async () => {
    const config = readBankConfig();
    const lastRun = await appKv.get<BankSyncSummary>(BANK_KV_KEYS.lastRun);
    if ('error' in config) return { configured: false, message: config.error, lastRun };
    const session = loadBankSession(config);
    return {
      configured: true,
      aspsp: config.aspsp,
      connected: !!session && Date.parse(session.validUntil) > Date.now(),
      validUntil: session?.validUntil ?? null,
      accounts: session?.accounts.map((a) => a.iban ?? a.uid) ?? [],
      lastRun,
    };
  },
});
