import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { onProjectChanged } from 'src/lib/projects/recompute';
import { createTwentyProjectStore } from 'src/lib/projects/twenty-project-store';

type ProjectRow = { companyId?: string | null; personId?: string | null; deletedAt?: string | null };

// Projekt utworzony albo zmieniony przez osobę: klient "firma i osoba naraz" jest cofany do stanu sprzed zapisu
// (Twenty nie pozwala odrzucić zapisu synchronicznie), brak klienta trafia do uwag, pola wyliczane się odświeżają.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<ProjectRow>>) => {
  if (!event.workspaceMemberId) return { skipped: 'NOT_A_USER_CHANGE' };
  const { before, after } = event.properties as { before?: ProjectRow; after?: ProjectRow };
  if (!after || after.deletedAt) return { skipped: 'DELETED' };
  return onProjectChanged(createTwentyProjectStore(), event.recordId, before ?? null, after);
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectChanged,
  name: 'project-changed',
  description: 'Waliduje klienta projektu (dokładnie firma albo osoba) i odświeża jego pola wyliczane.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'project.*' },
  handler,
});
