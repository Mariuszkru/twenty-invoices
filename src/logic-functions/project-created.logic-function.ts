import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { rocketChatApiFromEnv } from 'src/lib/notify/from-env';
import { createRocketChatRooms } from 'src/lib/notify/rocketchat';
import { setUpProjectChannel } from 'src/lib/projects/project-channel';
import { createTwentyChannelStore } from 'src/lib/projects/twenty-channel-store';

type ProjectRow = { name?: string | null };

// Nowy projekt dostaje prywatny kanał w Rocket.Chat nazwany jak projekt. Bez tokenu API Rocket.Chat nic nie robimy.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<ProjectRow>>) => {
  const api = rocketChatApiFromEnv();
  if (!api) return { skipped: 'NOT_CONFIGURED' };
  const { after } = event.properties as { after?: ProjectRow };
  return setUpProjectChannel(createRocketChatRooms(api), createTwentyChannelStore(), event.recordId, after?.name);
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectCreated,
  name: 'project-created',
  description: 'Tworzy prywatny kanał w Rocket.Chat dla nowego projektu.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'project.created' },
  handler,
});
