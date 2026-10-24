import { RocketChatApiError, type RocketChatRooms } from 'src/lib/notify/rocketchat';

// Dane CRM potrzebne do kanałów: ID kanału zapisane w projekcie i loginy Rocket.Chat członków projektu.
export type ChannelStore = {
  getRoomId: (projectId: string) => Promise<string | null>;
  setRoomId: (projectId: string, roomId: string) => Promise<void>;
  listMemberUsernames: (projectId: string) => Promise<string[]>;
  getUsername: (employeeId: string) => Promise<string | null>;
};

// Domyślna walidacja nazw kanałów w Rocket.Chat to [0-9a-zA-Z-_.]+, więc usuwamy polskie znaki i resztę zamieniamy na "-".
export const projectChannelName = (projectName: string | null | undefined): string =>
  (projectName ?? '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z_.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);

// Zajęta nazwa: drugi raz z końcówką z identyfikatora projektu. Końcówka jest stała, więc ponowione zdarzenie
// trafia na ten sam kanał (DUPLICATE) zamiast tworzyć kolejny.
export const createProjectChannel = async (
  createGroup: RocketChatRooms['createGroup'],
  projectId: string,
  projectName: string | null | undefined,
): Promise<{ created: string; roomId: string } | { skipped: 'DUPLICATE'; name: string }> => {
  const suffix = projectId.replace(/-/g, '').slice(0, 8);
  const base = projectChannelName(projectName);
  const candidates = base ? [base, `${base}-${suffix}`] : [`projekt-${suffix}`];
  for (const name of candidates) {
    try {
      const room = await createGroup(name);
      return { created: room.name, roomId: room.id };
    } catch (error) {
      if (!(error instanceof RocketChatApiError) || error.errorType !== 'error-duplicate-channel-name') throw error;
    }
  }
  return { skipped: 'DUPLICATE', name: candidates[candidates.length - 1] };
};

// Nowy projekt: prywatny kanał, ID w projekcie i zaproszenie osób przypisanych już w chwili utworzenia.
export const setUpProjectChannel = async (
  rooms: RocketChatRooms,
  store: ChannelStore,
  projectId: string,
  projectName: string | null | undefined,
) => {
  const result = await createProjectChannel(rooms.createGroup, projectId, projectName);
  if (!('roomId' in result)) return result;
  await store.setRoomId(projectId, result.roomId);
  const invited = await inviteUsernames(rooms, result.roomId, await store.listMemberUsernames(projectId));
  return { ...result, ...invited };
};

const inviteUsernames = async (rooms: RocketChatRooms, roomId: string, usernames: string[]) => {
  const invited: string[] = [];
  const unknown: string[] = [];
  for (const username of new Set(usernames)) {
    const userId = await rooms.findUserId(username);
    if (!userId) {
      unknown.push(username);
      continue;
    }
    await rooms.invite(roomId, userId);
    invited.push(username);
  }
  return { invited, unknown };
};

type Membership = { projectId?: string | null; employeeId?: string | null; deletedAt?: string | null };

const active = (row: Membership | undefined) =>
  row && !row.deletedAt && row.projectId && row.employeeId
    ? { projectId: row.projectId, employeeId: row.employeeId }
    : null;

// Członek projektu dodany, usunięty, przywrócony albo przepięty: zaproszenie do nowego kanału i usunięcie ze starego.
// Projekt bez kanału (utworzony przed tą funkcją albo bez tokenu) i pracownik bez loginu są pomijani.
export const syncProjectMembership = async (
  rooms: RocketChatRooms,
  store: ChannelStore,
  before: Membership | undefined,
  after: Membership | undefined,
) => {
  const from = active(before);
  const to = active(after);
  if (from?.projectId === to?.projectId && from?.employeeId === to?.employeeId) return { skipped: 'NO_CHANGE' };

  const result: { invited?: string; kicked?: string; skipped: string[] } = { skipped: [] };
  if (from) {
    const roomId = await store.getRoomId(from.projectId);
    const username = await store.getUsername(from.employeeId);
    // ta sama osoba może być przypisana do projektu drugi raz – wtedy zostaje w kanale
    if (!roomId || !username) result.skipped.push(!roomId ? 'NO_CHANNEL' : 'NO_USERNAME');
    else if (!(await store.listMemberUsernames(from.projectId)).includes(username)) {
      const userId = await rooms.findUserId(username);
      if (userId) {
        await rooms.kick(roomId, userId);
        result.kicked = username;
      } else result.skipped.push('UNKNOWN_USER');
    }
  }
  if (to) {
    const roomId = await store.getRoomId(to.projectId);
    const username = await store.getUsername(to.employeeId);
    if (!roomId || !username) result.skipped.push(!roomId ? 'NO_CHANNEL' : 'NO_USERNAME');
    else {
      const { invited, unknown } = await inviteUsernames(rooms, roomId, [username]);
      if (invited.length) result.invited = username;
      if (unknown.length) result.skipped.push('UNKNOWN_USER');
    }
  }
  return result;
};
