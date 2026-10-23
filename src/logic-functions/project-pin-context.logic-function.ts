import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { pinContext } from 'src/lib/projects/pin';
import { createTwentyProjectStore } from 'src/lib/projects/twenty-project-store';
import { errorMessage } from 'src/lib/sync/import-details';

// Dane panelu "Przypnij pozycje faktur": projekty i pozycje faktur pasujące do wyszukiwania.
export default defineLogicFunction({
  universalIdentifier: ID.fnProjectPinContext,
  name: 'project-pin-context',
  description: 'Zwraca projekty i pozycje faktur do przypięcia (wyszukiwanie po numerze faktury albo kontrahencie).',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/projects/pin-context',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler: async (event: RoutePayload) => {
    try {
      return { ok: true, ...(await pinContext(createTwentyProjectStore(), event.queryStringParameters?.query ?? null)) };
    } catch (e) {
      console.error(`[project-pin-context] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    }
  },
});
