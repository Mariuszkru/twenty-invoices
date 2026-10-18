import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { kv } from 'twenty-sdk/logic-function';

import { parseStoredSession, type StoredBankSession } from 'src/lib/bank/consent';
import { createEnableBankingClient } from 'src/lib/bank/enablebanking-http';
import { runBankSync, type BankSyncSummary } from 'src/lib/bank/run-bank-sync';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';
import { notifierFromEnv } from 'src/lib/notify/from-env';
import type { KvStore } from 'src/lib/sync/rate-budget';

// Zależności wyciągów bankowych składane ze zmiennych aplikacji. Bez ENABLEBANKING_APP_ID integracja jest wyłączona.

export type BankConfig = { appId: string; privateKey: string; aspsp: string; country: string };

export const readBankConfig = (): BankConfig | { error: string } => {
  const appId = process.env.ENABLEBANKING_APP_ID?.trim();
  const privateKey = process.env.ENABLEBANKING_PRIVATE_KEY?.trim();
  const aspsp = process.env.ENABLEBANKING_ASPSP?.trim();
  if (!appId) return { error: 'Brak zmiennej ENABLEBANKING_APP_ID (identyfikator aplikacji Enable Banking).' };
  if (!privateKey) return { error: 'Brak zmiennej ENABLEBANKING_PRIVATE_KEY (klucz prywatny PEM).' };
  if (!aspsp) return { error: 'Brak zmiennej ENABLEBANKING_ASPSP (nazwa banku z listy Enable Banking).' };
  return { appId, privateKey, aspsp, country: process.env.ENABLEBANKING_COUNTRY?.trim().toUpperCase() || 'PL' };
};

export const bankClientFor = (config: BankConfig) =>
  createEnableBankingClient({ appId: config.appId, privateKey: config.privateKey });

export const appKv: KvStore = {
  get: (key) => kv.get(key),
  set: (key, value) => kv.set(key, value),
};

export const loadBankSession = (config: BankConfig): StoredBankSession | null =>
  parseStoredSession(process.env.ENABLEBANKING_SESSION, config.appId);

export const saveBankSession = async (session: StoredBankSession) => {
  await new MetadataApiClient({ runAs: 'application' }).mutation({
    updateOneApplicationVariable: { __args: { key: 'ENABLEBANKING_SESSION', value: JSON.stringify(session) } },
  });
};

export const callbackUrl = () => {
  const crmUrl = process.env.CRM_URL?.trim().replace(/\/+$/, '');
  return crmUrl ? `${crmUrl}/s/bank/callback` : null;
};

export const bankSyncFromEnv = async (): Promise<BankSyncSummary | { ok: false; error: 'CONFIG'; message: string }> => {
  const config = readBankConfig();
  if ('error' in config) return { ok: false, error: 'CONFIG', message: config.error };
  return runBankSync({
    client: bankClientFor(config),
    kv: appKv,
    store: createTwentyBankStore(),
    session: loadBankSession(config),
    notify: notifierFromEnv() ?? undefined,
    log: (message) => console.log(`[bank-sync] ${message}`),
  });
};
