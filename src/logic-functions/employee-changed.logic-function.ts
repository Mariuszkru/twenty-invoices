import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { rocketChatApiFromEnv } from 'src/lib/notify/from-env';
import { createRocketChatRooms } from 'src/lib/notify/rocketchat';
import { syncProjectMembership } from 'src/lib/projects/project-channel';
import { createTwentyChannelStore } from 'src/lib/projects/twenty-channel-store';

type EmployeeRow = { projectId?: string | null; rocketChatUsername?: string | null; deletedAt?: string | null };

// Pracownik dodany do projektu trafia do kanału projektu w Rocket.Chat; przeniesiony, zdjęty z projektu albo usunięty –
// wychodzi ze starego kanału.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<EmployeeRow>>) => {
  const api = rocketChatApiFromEnv();
  if (!api) return { skipped: 'NOT_CONFIGURED' };
  const { before, after } = event.properties as { before?: EmployeeRow; after?: EmployeeRow };
  return syncProjectMembership(createRocketChatRooms(api), createTwentyChannelStore(), before, after);
};

export default defineLogicFunction({
  universalIdentifier: ID.fnEmployeeChanged,
  name: 'employee-changed',
  description: 'Dodaje albo usuwa pracownika z kanału projektu w Rocket.Chat po zmianie projektu albo loginu pracownika.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'employee.*' },
  handler,
});
