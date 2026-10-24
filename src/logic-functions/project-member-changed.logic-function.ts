import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { rocketChatApiFromEnv } from 'src/lib/notify/from-env';
import { createRocketChatRooms } from 'src/lib/notify/rocketchat';
import { syncProjectMembership } from 'src/lib/projects/project-channel';
import { createTwentyChannelStore } from 'src/lib/projects/twenty-channel-store';

type MemberRow = { projectId?: string | null; employeeId?: string | null; deletedAt?: string | null };

// Przypisanie pracownika do projektu dodaje go do kanału projektu w Rocket.Chat, usunięcie przypisania – usuwa.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<MemberRow>>) => {
  const api = rocketChatApiFromEnv();
  if (!api) return { skipped: 'NOT_CONFIGURED' };
  const { before, after } = event.properties as { before?: MemberRow; after?: MemberRow };
  return syncProjectMembership(createRocketChatRooms(api), createTwentyChannelStore(), before, after);
};

export default defineLogicFunction({
  universalIdentifier: ID.fnProjectMemberChanged,
  name: 'project-member-changed',
  description: 'Dodaje albo usuwa pracownika z kanału projektu w Rocket.Chat po zmianie członków projektu.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'projectMember.*' },
  handler,
});
