import type { FetchImpl } from 'src/lib/ksef/http';

// Webhook przychodzący Rocket.Chat: POST {"text": "..."} z markdownem.
// parseUrls: false wyłącza podgląd linków (OEmbed) – przy kilku fakturach podglądy CRM zajmowały cały kanał.
export const createRocketChatSender =
  (webhookUrl: string, fetchImpl: FetchImpl = fetch) =>
  async (text: string): Promise<void> => {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, parseUrls: false }),
    });
    if (!response.ok) {
      throw new Error(`Rocket.Chat odrzucił wiadomość: HTTP ${response.status}`);
    }
  };

export class RocketChatApiError extends Error {
  constructor(
    message: string,
    readonly errorType: string | null,
  ) {
    super(message);
    this.name = 'RocketChatApiError';
  }
}

export type RocketChatApiConfig = { serverUrl: string; userId: string; authToken: string };

// Adres serwera wyprowadzamy z webhooka (…/hooks/<id>/<token>), żeby nie trzymać go w drugiej zmiennej.
export const rocketChatServerUrl = (webhookUrl: string): string => {
  const index = webhookUrl.indexOf('/hooks/');
  if (index < 0) throw new Error('Webhook Rocket.Chat nie ma postaci …/hooks/…');
  return webhookUrl.slice(0, index);
};

type ApiBody = { success?: boolean; errorType?: string; error?: string } & Record<string, unknown>;

export type RocketChatRooms = {
  createGroup: (name: string) => Promise<{ id: string; name: string }>;
  rename: (roomId: string, name: string) => Promise<{ id: string; name: string }>;
  findUserId: (username: string) => Promise<string | null>;
  invite: (roomId: string, userId: string) => Promise<void>;
  kick: (roomId: string, userId: string) => Promise<void>;
};

// REST API (Personal Access Token): kanały prywatne (groups.*), właścicielem jest użytkownik tokenu.
export const createRocketChatRooms = (
  { serverUrl, userId, authToken }: RocketChatApiConfig,
  fetchImpl: FetchImpl = fetch,
): RocketChatRooms => {
  const call = async (path: string, init: { query?: Record<string, string>; body?: unknown }, what: string) => {
    const query = init.query ? `?${new URLSearchParams(init.query)}` : '';
    const response = await fetchImpl(`${serverUrl}/api/v1/${path}${query}`, {
      method: init.body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-user-id': userId, 'x-auth-token': authToken },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const body = (await response.json().catch(() => null)) as ApiBody | null;
    if (!response.ok || !body?.success) {
      throw new RocketChatApiError(
        `Rocket.Chat: ${what}: HTTP ${response.status} ${body?.error ?? ''}`.trim(),
        body?.errorType ?? null,
      );
    }
    return body;
  };

  return {
    createGroup: async (name) => {
      const body = await call('groups.create', { body: { name } }, `nie utworzył kanału ${name}`);
      const group = body.group as { _id: string; name: string };
      return { id: group._id, name: group.name };
    },
    rename: async (roomId, name) => {
      const body = await call('groups.rename', { body: { roomId, name } }, `nie zmienił nazwy kanału na ${name}`);
      const group = body.group as { _id: string; name: string };
      return { id: group._id, name: group.name };
    },
    // nieznany login: users.info odpowiada 400 – zwracamy null, żeby literówka nie blokowała pozostałych osób
    findUserId: async (username) => {
      try {
        const body = await call('users.info', { query: { username } }, `brak użytkownika ${username}`);
        return (body.user as { _id: string })._id;
      } catch (error) {
        if (error instanceof RocketChatApiError && /HTTP (400|404)/.test(error.message)) return null;
        throw error;
      }
    },
    invite: async (roomId, memberId) => {
      await call('groups.invite', { body: { roomId, userId: memberId } }, 'nie dodał osoby do kanału');
    },
    kick: async (roomId, memberId) => {
      await call('groups.kick', { body: { roomId, userId: memberId } }, 'nie usunął osoby z kanału');
    },
  };
};
