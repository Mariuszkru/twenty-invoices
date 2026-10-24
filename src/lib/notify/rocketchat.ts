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
