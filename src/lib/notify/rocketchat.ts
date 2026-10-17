import type { FetchImpl } from 'src/lib/ksef/http';

// Webhook przychodzący Rocket.Chat: POST {"text": "..."} z markdownem.
export const createRocketChatSender =
  (webhookUrl: string, fetchImpl: FetchImpl = fetch) =>
  async (text: string): Promise<void> => {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(`Rocket.Chat odrzucił wiadomość: HTTP ${response.status}`);
    }
  };
