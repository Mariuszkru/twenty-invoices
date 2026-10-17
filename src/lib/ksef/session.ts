import { createHash } from 'node:crypto';

import { authenticateWithKsefToken, refreshAccessToken } from 'src/lib/ksef/auth';
import { KsefApiError, type KsefHttpClient } from 'src/lib/ksef/http';

// Sesja KSeF między przebiegami: refresh token trzymany w sekretnej zmiennej aplikacji (szyfrowanej w bazie).
// Zapis jest przypięty do NIP-u i odcisku tokena KSeF – zmiana któregokolwiek wymusza pełne uwierzytelnienie.

type StoredSession = {
  v: 1;
  nip: string;
  tokenFingerprint: string;
  refreshToken: string;
  refreshTokenValidUntil: string;
};

// odświeżamy tylko, gdy refresh token zachowa ważność dłużej niż ten margines
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export const tokenFingerprint = (ksefToken: string) =>
  createHash('sha256').update(ksefToken).digest('hex').slice(0, 16);

const parseStored = (value: string | undefined): StoredSession | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredSession>;
    return parsed.v === 1 && parsed.refreshToken && parsed.refreshTokenValidUntil
      ? (parsed as StoredSession)
      : null;
  } catch {
    return null;
  }
};

export type SessionStore = {
  stored: string | undefined;
  save: (value: string) => Promise<void>;
};

type ObtainParams = {
  http: KsefHttpClient;
  nip: string;
  ksefToken: string;
  session?: SessionStore;
  now: () => Date;
  log: (message: string) => void;
};

export const obtainAccessToken = async ({
  http,
  nip,
  ksefToken,
  session,
  now,
  log,
}: ObtainParams): Promise<string> => {
  const fingerprint = tokenFingerprint(ksefToken);
  const stored = parseStored(session?.stored);

  const reusable =
    stored &&
    stored.nip === nip &&
    stored.tokenFingerprint === fingerprint &&
    Date.parse(stored.refreshTokenValidUntil) - now().getTime() > REFRESH_MARGIN_MS;

  if (reusable) {
    try {
      return await refreshAccessToken(http, stored.refreshToken);
    } catch (e) {
      // unieważniony refresh token (np. utrata uprawnień) – wracamy do pełnego uwierzytelnienia
      if (!(e instanceof KsefApiError) || e.status >= 500 || e.status === 429) throw e;
      log(`Refresh token odrzucony (${e.status}), pełne uwierzytelnienie.`);
    }
  }

  const tokens = await authenticateWithKsefToken({ http, nip, ksefToken, now });

  if (session) {
    const value: StoredSession = {
      v: 1,
      nip,
      tokenFingerprint: fingerprint,
      refreshToken: tokens.refreshToken,
      refreshTokenValidUntil: tokens.refreshTokenValidUntil,
    };
    try {
      await session.save(JSON.stringify(value));
    } catch (e) {
      // brak zapisu to tylko utrata optymalizacji – synchronizacja idzie dalej
      log(`Nie zapisano sesji KSeF: ${(e as Error).message}`);
    }
  }
  return tokens.accessToken;
};
