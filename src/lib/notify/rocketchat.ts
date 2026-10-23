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

// REST API (Personal Access Token): kanał publiczny, właścicielem jest użytkownik tokenu.
export const createRocketChatChannelCreator =
  ({ serverUrl, userId, authToken }: RocketChatApiConfig, fetchImpl: FetchImpl = fetch) =>
  async (name: string): Promise<{ id: string; name: string }> => {
    const response = await fetchImpl(`${serverUrl}/api/v1/channels.create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId, 'x-auth-token': authToken },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      channel?: { _id: string; name: string };
      errorType?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.success || !body.channel) {
      throw new RocketChatApiError(
        `Rocket.Chat nie utworzył kanału ${name}: HTTP ${response.status} ${body?.error ?? ''}`.trim(),
        body?.errorType ?? null,
      );
    }
    return { id: body.channel._id, name: body.channel.name };
  };
