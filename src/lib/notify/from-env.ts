import { createRocketChatSender, rocketChatServerUrl } from 'src/lib/notify/rocketchat';

// Powiadomienia są opcjonalne: bez ROCKETCHAT_WEBHOOK_URL nic nie wysyłamy.
export const notifierFromEnv = () => {
  const webhookUrl = process.env.ROCKETCHAT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return null;
  return {
    send: createRocketChatSender(webhookUrl),
    crmUrl: process.env.CRM_URL?.trim() || null,
  };
};

// Kanały projektów wymagają REST API (Personal Access Token); adres serwera bierzemy z webhooka.
export const rocketChatApiFromEnv = () => {
  const webhookUrl = process.env.ROCKETCHAT_WEBHOOK_URL?.trim();
  const userId = process.env.ROCKETCHAT_USER_ID?.trim();
  const authToken = process.env.ROCKETCHAT_AUTH_TOKEN?.trim();
  if (!webhookUrl || !userId || !authToken) return null;
  return { serverUrl: rocketChatServerUrl(webhookUrl), userId, authToken };
};
