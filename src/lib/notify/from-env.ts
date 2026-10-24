import { createRocketChatSender } from 'src/lib/notify/rocketchat';

// Powiadomienia są opcjonalne: bez ROCKETCHAT_WEBHOOK_URL nic nie wysyłamy.
export const notifierFromEnv = () => {
  const webhookUrl = process.env.ROCKETCHAT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return null;
  return {
    send: createRocketChatSender(webhookUrl),
    crmUrl: process.env.CRM_URL?.trim() || null,
  };
};
