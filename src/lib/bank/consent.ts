import { BankConfigError, type EnableBankingClient } from 'src/lib/bank/enablebanking-http';

export { BankConfigError };

// Zgoda PSD2 na odczyt rachunku: POST /auth daje adres logowania w banku, bank wraca na redirect_url z kodem,
// a POST /sessions wymienia kod na sesję z listą rachunków. Sesja trafia do sekretnej zmiennej ENABLEBANKING_SESSION.

const DAY_SECONDS = 24 * 60 * 60;
const MAX_CONSENT_DAYS = 180;

export type BankAccount = { uid: string; iban: string | null; currency: string | null };

export type StoredBankSession = {
  v: 1;
  appId: string;
  sessionId: string;
  aspsp: { name: string; country: string };
  accounts: BankAccount[];
  validUntil: string;
};

// Zapis z innej aplikacji Enable Banking (zmieniony APP_ID) jest bezużyteczny – traktujemy go jak brak sesji.
export const parseStoredSession = (value: string | undefined, appId: string): StoredBankSession | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredBankSession>;
    return parsed.v === 1 && parsed.sessionId && parsed.validUntil && parsed.appId === appId
      ? (parsed as StoredBankSession)
      : null;
  } catch {
    return null;
  }
};

type Aspsp = {
  name: string;
  country: string;
  maximum_consent_validity?: number;
  psu_types?: string[];
};

export const findAspsp = async (client: EnableBankingClient, name: string, country: string): Promise<Aspsp> => {
  const { aspsps } = await client.get<{ aspsps: Aspsp[] }>('/aspsps', { country });
  const wanted = name.trim().toLowerCase();
  const found = aspsps.find((a) => a.name.toLowerCase() === wanted);
  if (found) return found;
  const similar = aspsps
    .filter((a) => a.name.toLowerCase().includes(wanted.slice(0, 3)))
    .map((a) => a.name)
    .slice(0, 10);
  throw new BankConfigError(
    `Nie znaleziono banku "${name}" w Enable Banking (${country}).` +
      (similar.length ? ` Podobne: ${similar.join(', ')}.` : ' Sprawdź zmienną ENABLEBANKING_ASPSP.'),
  );
};

type StartParams = {
  client: EnableBankingClient;
  aspspName: string;
  country: string;
  redirectUrl: string;
  state: string;
  now: Date;
};

export const startAuthorization = async ({ client, aspspName, country, redirectUrl, state, now }: StartParams) => {
  const aspsp = await findAspsp(client, aspspName, country);
  // bank może pozwalać na krócej niż 180 dni; minuta zapasu, żeby nie przekroczyć jego limitu
  const seconds = Math.min(MAX_CONSENT_DAYS * DAY_SECONDS, aspsp.maximum_consent_validity ?? 90 * DAY_SECONDS) - 60;
  const validUntil = new Date(now.getTime() + seconds * 1000).toISOString();
  const psuType = !aspsp.psu_types?.length || aspsp.psu_types.includes('business') ? 'business' : aspsp.psu_types[0];

  const response = await client.post<{ url: string }>('/auth', {
    access: { valid_until: validUntil },
    aspsp: { name: aspsp.name, country: aspsp.country },
    state,
    redirect_url: redirectUrl,
    psu_type: psuType,
  });
  return { url: response.url, aspsp: aspsp.name, validUntil };
};

// AccountResource; `uid` jest opcjonalne – rachunek bez niego nie pozwala pobrać transakcji
type ApiSessionAccount = { uid?: string | null; account_id?: { iban?: string | null } | null; currency?: string | null };

type ApiSession = {
  session_id: string;
  accounts: ApiSessionAccount[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
};

export const completeAuthorization = async (
  client: EnableBankingClient,
  code: string,
  appId: string,
): Promise<StoredBankSession> => {
  const session = await client.post<ApiSession>('/sessions', { code });
  const accounts = (session.accounts ?? []).flatMap((a) =>
    a.uid ? [{ uid: a.uid, iban: a.account_id?.iban ?? null, currency: a.currency ?? null }] : [],
  );
  if (accounts.length === 0) {
    throw new BankConfigError('Bank nie udostępnił żadnego rachunku. Połącz się ponownie i zaznacz rachunek firmowy.');
  }
  return {
    v: 1,
    appId,
    sessionId: session.session_id,
    aspsp: session.aspsp,
    accounts,
    validUntil: session.access.valid_until,
  };
};
