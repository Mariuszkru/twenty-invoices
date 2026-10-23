import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { onEntryChanged } from 'src/lib/projects/recompute';
import { createTwentyProjectStore } from 'src/lib/projects/twenty-project-store';

type EntryRow = { projectId?: string | null; invoiceLineId?: string | null; deletedAt?: string | null };

// Przypisanie pozycji faktury do projektu dodane, zmienione albo usunięte w CRM: uzupełnia puste pola,
// przelicza status pozycji faktury i marżę projektów. Zapisy samej aplikacji pomijamy, żeby nie zapętlić triggera.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<EntryRow>>) => {
  if (!event.workspaceMemberId) return { skipped: 'NOT_A_USER_CHANGE' };
  const { before, after } = event.properties as { before?: EntryRow; after?: EntryRow };
  // usunięte przypisanie liczy się już tylko jako "przed"
  const current = after && !after.deletedAt ? after : null;
  await onEntryChanged(createTwentyProjectStore(), event.recordId, before ?? null, current);
  return { recomputed: event.recordId };
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectEntryChanged,
  name: 'project-entry-changed',
  description: 'Przelicza marżę projektu i przypisanie pozycji faktury po zmianie pozycji projektu.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'projectEntry.*' },
  handler,
});
