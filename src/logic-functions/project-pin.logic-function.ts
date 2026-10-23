import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { PinError, pinLines, type PinItem } from 'src/lib/projects/pin';
import { createTwentyProjectStore } from 'src/lib/projects/twenty-project-store';
import { errorMessage } from 'src/lib/sync/import-details';

type PinBody = { projectId?: string; items?: PinItem[]; note?: string | null };

// Zapis z panelu "Przypnij pozycje faktur": tworzy przypisania i przelicza marżę projektu.
export default defineLogicFunction({
  universalIdentifier: ID.fnProjectPin,
  name: 'project-pin',
  description: 'Przypina wybrane pozycje faktur do projektu jako przychód albo koszt.',
  timeoutSeconds: 60,
  httpRouteTriggerSettings: {
    path: '/projects/pin',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async (event: { body: object | null }) => {
    const { projectId, items, note } = (event.body ?? {}) as PinBody;
    if (!projectId || !Array.isArray(items)) return { ok: false, message: 'Wybierz projekt i pozycje.' };
    try {
      return { ok: true, ...(await pinLines(createTwentyProjectStore(), projectId, items, note?.trim() || null)) };
    } catch (e) {
      if (!(e instanceof PinError)) console.error(`[project-pin] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    }
  },
});
