import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { rocketChatApiFromEnv } from 'src/lib/notify/from-env';
import { createRocketChatRooms } from 'src/lib/notify/rocketchat';
import { renameProjectChannel } from 'src/lib/projects/project-channel';
import { createTwentyChannelStore } from 'src/lib/projects/twenty-channel-store';

type ProjectRow = { name?: string | null };

// Zmiana nazwy projektu zmienia nazwę jego kanału w Rocket.Chat. Bez tokenu API Rocket.Chat nic nie robimy.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<ProjectRow>>) => {
  const api = rocketChatApiFromEnv();
  if (!api) return { skipped: 'NOT_CONFIGURED' };
  const { before, after } = event.properties as { before?: ProjectRow; after?: ProjectRow };
  return renameProjectChannel(
    createRocketChatRooms(api),
    createTwentyChannelStore(),
    event.recordId,
    before?.name,
    after?.name,
  );
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectRenamed,
  name: 'project-renamed',
  description: 'Zmienia nazwę kanału projektu w Rocket.Chat po zmianie nazwy projektu.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'project.updated', updatedFields: ['name'] },
  handler,
});
