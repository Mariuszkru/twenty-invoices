import { kv } from 'twenty-sdk/logic-function';

import { KSEF_BASE_URLS, resolveKsefEnv, type KsefEnv } from 'src/lib/ksef/environments';
import { createKsefHttpClient } from 'src/lib/ksef/http';
import { fetchNbpRateBefore } from 'src/lib/nbp';
import { runSync, type SyncSummary } from 'src/lib/sync/run-sync';
import { createTwentyStore } from 'src/lib/sync/twenty-store';

export const normalizeNip = (value: string | undefined) => (value ?? '').replace(/\D/g, '');

export type SyncConfigError = { ok: false; error: 'CONFIG'; message: string };

type SyncConfig = { error: string } | { ksefToken: string; nip: string; env: KsefEnv };

export const readSyncConfig = (): SyncConfig => {
  const ksefToken = process.env.KSEF_TOKEN?.trim();
  const nip = normalizeNip(process.env.KSEF_NIP);
  if (!ksefToken) {
    return { error: 'Brak zmiennej aplikacji KSEF_TOKEN (ustaw ją w ustawieniach aplikacji).' };
  }
  if (nip.length !== 10) {
    return { error: 'Zmienna KSEF_NIP musi zawierać 10-cyfrowy NIP.' };
  }
  return { ksefToken, nip, env: resolveKsefEnv(process.env.KSEF_ENV) };
};

// Wspólny punkt wejścia crona i zadania ręcznego: składa zależności z process.env i uruchamia synchronizację.
export const syncFromEnv = async (budgetMs: number): Promise<SyncSummary | SyncConfigError> => {
  const config = readSyncConfig();
  if ('error' in config) {
    return { ok: false, error: 'CONFIG', message: config.error };
  }
  return runSync({
    http: createKsefHttpClient({ baseUrl: KSEF_BASE_URLS[config.env] }),
    kv: {
      get: (key) => kv.get(key),
      set: (key, value) => kv.set(key, value),
    },
    store: createTwentyStore(),
    nip: config.nip,
    ksefToken: config.ksefToken,
    nbpRate: (currency, date) => fetchNbpRateBefore(currency, date),
    budgetMs,
    log: (message) => console.log(`[ksef-sync] ${message}`),
  });
};
