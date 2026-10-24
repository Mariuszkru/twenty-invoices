import { describe, expect, it } from 'vitest';

import { createRocketChatRooms, rocketChatServerUrl } from 'src/lib/notify/rocketchat';
import {
  createProjectChannel,
  projectChannelName,
  renameProjectChannel,
  setUpProjectChannel,
  syncProjectMembership,
  type ChannelStore,
} from 'src/lib/projects/project-channel';

const PROJECT_ID = '3f2a9c1b-7d4e-4a8b-9c0d-1e2f3a4b5c6d';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Fałszywy serwer Rocket.Chat: pamięta kanały prywatne, ich członków, użytkowników i zapytania.
const fakeRocketChat = (existing: string[] = [], users: string[] = ['anna', 'jan']) => {
  const groups = new Map<string, { name: string; members: Set<string> }>(
    existing.map((name) => [`id-${name}`, { name, members: new Set<string>() }]),
  );
  const requests: { url: string; headers: Record<string, string>; body: Record<string, string> | null }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, string>) : null;
    requests.push({ url, headers: init.headers as Record<string, string>, body });
    const path = new URL(url).pathname.replace('/api/v1/', '');
    if (path === 'groups.create') {
      if ([...groups.values()].some((g) => g.name === body!.name)) {
        return json({ success: false, errorType: 'error-duplicate-channel-name', error: 'duplicate' }, 400);
      }
      groups.set(`id-${body!.name}`, { name: body!.name, members: new Set() });
      return json({ success: true, group: { _id: `id-${body!.name}`, name: body!.name } });
    }
    if (path === 'groups.rename') {
      if ([...groups].some(([id, g]) => g.name === body!.name && id !== body!.roomId)) {
        return json({ success: false, errorType: 'error-duplicate-channel-name', error: 'duplicate' }, 400);
      }
      groups.get(body!.roomId)!.name = body!.name;
      return json({ success: true, group: { _id: body!.roomId, name: body!.name } });
    }
    if (path === 'users.info') {
      const username = new URL(url).searchParams.get('username')!;
      return users.includes(username)
        ? json({ success: true, user: { _id: `u-${username}` } })
        : json({ success: false, error: 'User not found.' }, 400);
    }
    if (path === 'groups.invite') {
      groups.get(body!.roomId)!.members.add(body!.userId);
      return json({ success: true });
    }
    if (path === 'groups.kick') {
      groups.get(body!.roomId)!.members.delete(body!.userId);
      return json({ success: true });
    }
    return json({ success: false }, 404);
  }) as typeof fetch;
  const rooms = createRocketChatRooms({ serverUrl: 'https://chat.example.pl', userId: 'u1', authToken: 't1' }, fetchImpl);
  return { rooms, groups, requests };
};

// Pamięciowy CRM: projekty z ID kanału, pracownicy z loginem i przypisania.
const memoryStore = (
  usernames: Record<string, string | null> = { e1: 'anna', e2: 'jan', e3: null, e4: 'ktos' },
  members: { projectId: string; employeeId: string }[] = [],
) => {
  const roomIds = new Map<string, string>();
  const store: ChannelStore = {
    getRoomId: async (projectId) => roomIds.get(projectId) ?? null,
    setRoomId: async (projectId, roomId) => void roomIds.set(projectId, roomId),
    listMemberUsernames: async (projectId) =>
      members
        .filter((m) => m.projectId === projectId)
        .map((m) => usernames[m.employeeId])
        .filter((u): u is string => !!u),
    getUsername: async (employeeId) => usernames[employeeId] ?? null,
  };
  return { store, roomIds, members };
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

  it('tworzy kanał prywatny przez REST API z tokenem', async () => {
    const chat = fakeRocketChat();
    expect(await createProjectChannel(chat.rooms.createGroup, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      created: 'wdrozenie-crm',
      roomId: 'id-wdrozenie-crm',
    });
    expect(chat.requests[0]).toMatchObject({
      url: 'https://chat.example.pl/api/v1/groups.create',
      headers: { 'x-user-id': 'u1', 'x-auth-token': 't1' },
    });
  });

  it('zajęta nazwa dostaje końcówkę z ID, ponowione zdarzenie nie tworzy trzeciego kanału', async () => {
    const chat = fakeRocketChat(['wdrozenie-crm']);
    expect(await createProjectChannel(chat.rooms.createGroup, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      created: 'wdrozenie-crm-3f2a9c1b',
      roomId: 'id-wdrozenie-crm-3f2a9c1b',
    });
    expect(await createProjectChannel(chat.rooms.createGroup, PROJECT_ID, 'Wdrożenie CRM')).toEqual({
      skipped: 'DUPLICATE',
      name: 'wdrozenie-crm-3f2a9c1b',
    });
    expect(chat.groups.size).toBe(2);
  });

  it('nazwa zajęta przez kanał zarchiwizowany też dostaje końcówkę', async () => {
    const rooms = createRocketChatRooms(
      { serverUrl: 'https://chat.example.pl', userId: 'u1', authToken: 't1' },
      (async (_url: string, init: RequestInit) => {
        const { name } = JSON.parse(init.body as string) as { name: string };
        return name === 'crm'
          ? json({ success: false, errorType: 'error-archived-duplicate-name', error: 'archived' }, 400)
          : json({ success: true, group: { _id: 'g1', name } });
      }) as typeof fetch,
    );
    expect(await createProjectChannel(rooms.createGroup, PROJECT_ID, 'CRM')).toEqual({
      created: 'crm-3f2a9c1b',
      roomId: 'g1',
    });
  });

  it('projekt bez nazwy', async () => {
    const chat = fakeRocketChat();
    expect(await createProjectChannel(chat.rooms.createGroup, PROJECT_ID, '')).toMatchObject({
      created: 'projekt-3f2a9c1b',
    });
  });

  it('inny błąd API nie jest połykany', async () => {
    const rooms = createRocketChatRooms(
      { serverUrl: 'https://chat.example.pl', userId: 'u1', authToken: 'zly' },
      (async () => json({ success: false, error: 'unauthorized' }, 401)) as typeof fetch,
    );
    await expect(createProjectChannel(rooms.createGroup, PROJECT_ID, 'X')).rejects.toThrow('HTTP 401');
  });

  it('nowy projekt: ID kanału w projekcie i zaproszenie już przypisanych osób', async () => {
    const chat = fakeRocketChat();
    const crm = memoryStore(undefined, [
      { projectId: PROJECT_ID, employeeId: 'e1' },
      { projectId: PROJECT_ID, employeeId: 'e3' },
      { projectId: PROJECT_ID, employeeId: 'e4' },
    ]);
    expect(await setUpProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM')).toEqual({
      created: 'crm',
      roomId: 'id-crm',
      invited: ['anna'],
      unknown: ['ktos'],
    });
    expect(crm.roomIds.get(PROJECT_ID)).toBe('id-crm');
    expect([...chat.groups.get('id-crm')!.members]).toEqual(['u-anna']);
  });
});

describe('zmiana nazwy projektu', () => {
  const setUp = async (existing: string[] = []) => {
    const chat = fakeRocketChat(existing);
    const crm = memoryStore();
    await setUpProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM');
    return { chat, crm, channelName: () => chat.groups.get('id-crm')!.name };
  };

  it('zmienia nazwę kanału', async () => {
    const { chat, crm, channelName } = await setUp();
    expect(await renameProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM', 'Wdrożenie CRM')).toEqual({
      renamed: 'wdrozenie-crm',
    });
    expect(channelName()).toBe('wdrozenie-crm');
  });

  it('zajęta nazwa dostaje końcówkę z ID', async () => {
    const { chat, crm, channelName } = await setUp(['erp']);
    expect(await renameProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM', 'ERP')).toEqual({
      renamed: 'erp-3f2a9c1b',
    });
    expect(channelName()).toBe('erp-3f2a9c1b');
  });

  it('nazwa kanału wychodzi ta sama: nic nie wysyła', async () => {
    const { chat, crm } = await setUp();
    const sent = chat.requests.length;
    expect(await renameProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM', 'crm ')).toEqual({
      skipped: 'SAME_NAME',
    });
    expect(chat.requests.length).toBe(sent);
  });

  it('projekt bez kanału', async () => {
    const { chat, crm } = await setUp();
    expect(await renameProjectChannel(chat.rooms, crm.store, 'inny', 'A', 'B')).toEqual({ skipped: 'NO_CHANNEL' });
  });
});

describe('członkowie projektu w kanale', () => {
  const setUp = async () => {
    const chat = fakeRocketChat();
    const crm = memoryStore();
    await setUpProjectChannel(chat.rooms, crm.store, PROJECT_ID, 'CRM');
    const members = () => [...chat.groups.get('id-crm')!.members];
    return { chat, crm, members };
  };

  it('przypisanie zaprasza, usunięcie przypisania wyrzuca', async () => {
    const { chat, crm, members } = await setUp();
    const row = { projectId: PROJECT_ID, employeeId: 'e1' };
    crm.members.push(row);
    expect(await syncProjectMembership(chat.rooms, crm.store, undefined, row)).toEqual({
      invited: 'anna',
      skipped: [],
    });
    expect(members()).toEqual(['u-anna']);

    crm.members.splice(0, 1);
    expect(await syncProjectMembership(chat.rooms, crm.store, row, { ...row, deletedAt: '2026-10-24' })).toEqual({
      kicked: 'anna',
      skipped: [],
    });
    expect(members()).toEqual([]);
  });

  it('zmiana pracownika w przypisaniu: stary wychodzi, nowy wchodzi', async () => {
    const { chat, crm, members } = await setUp();
    await chat.rooms.invite('id-crm', 'u-anna');
    crm.members.push({ projectId: PROJECT_ID, employeeId: 'e2' });
    await syncProjectMembership(
      chat.rooms,
      crm.store,
      { projectId: PROJECT_ID, employeeId: 'e1' },
      { projectId: PROJECT_ID, employeeId: 'e2' },
    );
    expect(members()).toEqual(['u-jan']);
  });

  it('osoba przypisana drugi raz zostaje w kanale po usunięciu jednego przypisania', async () => {
    const { chat, crm, members } = await setUp();
    await chat.rooms.invite('id-crm', 'u-anna');
    crm.members.push({ projectId: PROJECT_ID, employeeId: 'e1' });
    await syncProjectMembership(chat.rooms, crm.store, { projectId: PROJECT_ID, employeeId: 'e1' }, undefined);
    expect(members()).toEqual(['u-anna']);
  });

  it('pomija pracownika bez loginu, nieznany login i projekt bez kanału', async () => {
    const { chat, crm } = await setUp();
    expect(await syncProjectMembership(chat.rooms, crm.store, undefined, { projectId: PROJECT_ID, employeeId: 'e3' })).toEqual({
      skipped: ['NO_USERNAME'],
    });
    expect(await syncProjectMembership(chat.rooms, crm.store, undefined, { projectId: PROJECT_ID, employeeId: 'e4' })).toEqual({
      skipped: ['UNKNOWN_USER'],
    });
    expect(await syncProjectMembership(chat.rooms, crm.store, undefined, { projectId: 'inny', employeeId: 'e1' })).toEqual({
      skipped: ['NO_CHANNEL'],
    });
  });

  it('zmiana innych pól przypisania nic nie robi', async () => {
    const { chat, crm } = await setUp();
    const row = { projectId: PROJECT_ID, employeeId: 'e1' };
    expect(await syncProjectMembership(chat.rooms, crm.store, row, row)).toEqual({ skipped: 'NO_CHANGE' });
  });
});
