import { describe, expect, it } from 'vitest';

import { createRocketChatChannelCreator, rocketChatServerUrl } from 'src/lib/notify/rocketchat';
import { createProjectChannel, projectChannelName } from 'src/lib/projects/project-channel';

const PROJECT_ID = '3f2a9c1b-7d4e-4a8b-9c0d-1e2f3a4b5c6d';

// Fałszywy serwer Rocket.Chat: pamięta istniejące kanały i zapytania.
const fakeRocketChat = (existing: string[] = []) => {
  const channels = new Set(existing);
  const requests: { url: string; headers: Record<string, string>; name: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const { name } = JSON.parse(init.body as string) as { name: string };
    requests.push({ url, headers: init.headers as Record<string, string>, name });
    if (channels.has(name)) {
      return new Response(
        JSON.stringify({ success: false, errorType: 'error-duplicate-channel-name', error: 'duplicate' }),
        { status: 400 },
      );
    }
    channels.add(name);
    return new Response(JSON.stringify({ success: true, channel: { _id: `id-${name}`, name } }));
  }) as typeof fetch;
  const create = createRocketChatChannelCreator(
    { serverUrl: 'https://chat.example.pl', userId: 'u1', authToken: 't1' },
    fetchImpl,
  );
  return { create, channels, requests };
};

describe('kanał Rocket.Chat dla projektu', () => {
  it('nazwa bez polskich znaków i spacji', () => {
    expect(projectChannelName('Wdrożenie CRM – Łódź / 2026')).toBe('wdrozenie-crm-lodz-2026');
    expect(projectChannelName('  ')).toBe('');
    expect(projectChannelName(null)).toBe('');
  });

  it('adres serwera z webhooka', () => {
    expect(rocketChatServerUrl('https://chat.example.pl/hooks/abc/def')).toBe('https://chat.example.pl');
    expect(() => rocketChatServerUrl('https://chat.example.pl/x')).toThrow();
  });

  it('tworzy kanał przez REST API z tokenem', async () => {
    const chat = fakeRocketChat();
    expect(await createProjectChannel(chat.create, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      created: 'wdrozenie-crm',
    });
    expect(chat.requests[0]).toMatchObject({
      url: 'https://chat.example.pl/api/v1/channels.create',
      headers: { 'x-user-id': 'u1', 'x-auth-token': 't1' },
    });
  });

  it('zajęta nazwa dostaje końcówkę z ID, ponowione zdarzenie nie tworzy trzeciego kanału', async () => {
    const chat = fakeRocketChat(['wdrozenie-crm']);
    expect(await createProjectChannel(chat.create, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      created: 'wdrozenie-crm-3f2a9c1b',
    });
    expect(await createProjectChannel(chat.create, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      skipped: 'DUPLICATE',
      name: 'wdrozenie-crm-3f2a9c1b',
    });
    expect(chat.channels.size).toBe(2);
  });

  it('projekt bez nazwy', async () => {
    const chat = fakeRocketChat();
    expect(await createProjectChannel(chat.create, PROJECT_ID, '')).toEqual({ created: 'projekt-3f2a9c1b' });
  });

  it('inny błąd API nie jest połykany', async () => {
    const create = createRocketChatChannelCreator(
      { serverUrl: 'https://chat.example.pl', userId: 'u1', authToken: 'zly' },
      (async () => new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401 })) as typeof fetch,
    );
    await expect(createProjectChannel(create, PROJECT_ID, 'X')).rejects.toThrow('HTTP 401');
  });
});
