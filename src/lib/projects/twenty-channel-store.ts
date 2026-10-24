import { CoreApiClient } from 'twenty-client-sdk/core';

import type { ChannelStore } from 'src/lib/projects/project-channel';
import type { Edges, LooseClient } from 'src/lib/sync/twenty-store';

const PAGE = 200;

// ID kanału jest polem tylko dla aplikacji (writability APPLICATION) – zawsze uprawnienia aplikacji.
export const createTwentyChannelStore = (): ChannelStore => {
  const client = new CoreApiClient({ runAs: 'application' }) as LooseClient;

  return {
    getRoomId: async (projectId) => {
      const result = await client.query({
        projects: { __args: { filter: { id: { eq: projectId } }, first: 1 }, edges: { node: { rocketChatRoomId: true } } },
      });
      return (result.projects as Edges<{ rocketChatRoomId: string | null }>).edges[0]?.node.rocketChatRoomId || null;
    },

    setRoomId: async (projectId, roomId) => {
      await client.mutation({ updateProject: { __args: { id: projectId, data: { rocketChatRoomId: roomId } }, id: true } });
    },

    listMemberUsernames: async (projectId) => {
      const result = await client.query({
        employees: {
          __args: { filter: { projectId: { eq: projectId } }, first: PAGE },
          edges: { node: { rocketChatUsername: true } },
        },
      });
      return (result.employees as Edges<{ rocketChatUsername: string | null }>).edges
        .map((e) => e.node.rocketChatUsername?.trim())
        .filter((username): username is string => !!username);
    },
  };
};
