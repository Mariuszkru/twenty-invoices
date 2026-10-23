import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { rocketChatApiFromEnv } from 'src/lib/notify/from-env';
import { createRocketChatChannelCreator } from 'src/lib/notify/rocketchat';
import { createProjectChannel } from 'src/lib/projects/project-channel';

type ProjectRow = { name?: string | null };

// Nowy projekt dostaje kanał w Rocket.Chat nazwany jak projekt. Bez tokenu API Rocket.Chat nic nie robimy.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<ProjectRow>>) => {
  const api = rocketChatApiFromEnv();
  if (!api) return { skipped: 'NOT_CONFIGURED' };
  const { after } = event.properties as { after?: ProjectRow };
  return createProjectChannel(createRocketChatChannelCreator(api), event.recordId, after?.name);
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectCreated,
  name: 'project-created',
  description: 'Tworzy kanał w Rocket.Chat dla nowego projektu.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'project.created' },
  handler,
});
