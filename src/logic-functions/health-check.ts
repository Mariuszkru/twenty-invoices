import { defineHealthCheck } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { HEALTH_CHECK_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { KV_KEYS, type SyncSummary } from 'src/lib/sync/run-sync';
import { readSyncConfig } from 'src/lib/sync/sync-from-env';

// Pokazuje w ustawieniach aplikacji wynik ostatniej synchronizacji (zapisany w KV przez runSync).
export default defineHealthCheck({
  universalIdentifier: HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  name: 'health-check',
  handler: async () => {
    const config = readSyncConfig();
    if ('error' in config) {
      return { status: 'ERROR', title: 'Konfiguracja KSeF niekompletna', description: config.error };
    }

    const lastRun = await kv.get<SyncSummary>(KV_KEYS.lastRun);
    if (!lastRun) {
      return {
        status: 'INFO',
        title: 'Synchronizacja jeszcze się nie odbyła',
        description: 'Pierwszy przebieg uruchomi się w ciągu 15 minut albo z menu poleceń.',
      };
    }
    if (!lastRun.ok) {
      return {
        status: 'ERROR',
        title: 'Ostatnia synchronizacja z KSeF nie powiodła się',
        description: `${lastRun.finishedAt}: ${lastRun.message ?? 'nieznany błąd'}`,
      };
    }
    if (lastRun.failed > 0) {
      return {
        status: 'WARNING',
        title: `${lastRun.failed} faktur(y) nie udało się zaimportować`,
        description: 'Szczegóły w polu „Błąd importu” faktur ze statusem Błąd.',
      };
    }
    if (lastRun.pendingLeft || lastRun.catchingUp) {
      return {
        status: 'INFO',
        title: 'Trwa pobieranie faktur z KSeF',
        description: 'Limity KSeF pozwalają pobrać ok. 60 dokumentów na godzinę; reszta dojdzie w kolejnych przebiegach.',
      };
    }
    return { status: 'OK' };
  },
});
