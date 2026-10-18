import { createPrivateKey, createSign, type KeyObject } from 'node:crypto';

import type { FetchImpl } from 'src/lib/ksef/http';

// Klient API Enable Banking. Każde zapytanie niesie JWT podpisany kluczem prywatnym aplikacji (RS256),
// z identyfikatorem aplikacji w nagłówku `kid`. Token ważny maksymalnie 24 h – wystawiamy na godzinę.

export const ENABLEBANKING_BASE_URL = 'https://api.enablebanking.com';
const JWT_TTL_SECONDS = 60 * 60;

// Błąd konfiguracji (zmienne aplikacji, bank, rachunki) – komunikat dla użytkownika, bez logowania jako awaria.
export class BankConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankConfigError';
  }
}

export class EnableBankingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // kod błędu Enable Banking, np. EXPIRED_SESSION, ASPSP_RATE_LIMIT_EXCEEDED
    readonly code?: string,
  ) {
    super(message);
    this.name = 'EnableBankingApiError';
  }
}

// Zgoda w banku wygasła, została cofnięta albo sesja nie istnieje – potrzebne ponowne połączenie z bankiem.
export const isConsentError = (e: unknown): boolean =>
  e instanceof EnableBankingApiError &&
  (e.status === 401 || e.status === 403 || /SESSION|CONSENT|UNAUTHORI[SZ]ED/i.test(e.code ?? ''));

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

// PEM wklejony do zmiennej aplikacji może stracić znaki nowej linii albo dostać dosłowne "\n" – odtwarzamy format.
export const normalizePem = (value: string): string => {
  const text = value.trim().replace(/\\n/g, '\n');
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  if (!match) return text;
  const lines = match[2].replace(/\s+/g, '').match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`;
};

// Klucz z ENABLEBANKING_PRIVATE_KEY: PEM (także sklejony w jedną linię), samo base64 bez nagłówków albo JWK
// wyeksportowany z przeglądarki. Komunikat błędu opisuje tylko rodzaj i długość wartości, nigdy jej treść.
export const loadPrivateKey = (value: string): KeyObject => {
  const text = value.trim().replace(/\\n/g, '\n');
  const describe = (header: string | undefined) =>
    `nagłówek: ${header ? `BEGIN ${header}` : 'brak'}, długość: ${text.length} znaków`;

  if (text.startsWith('{')) {
    try {
      return createPrivateKey({ key: JSON.parse(text), format: 'jwk' });
    } catch {
      throw new BankConfigError(`ENABLEBANKING_PRIVATE_KEY wygląda na JWK, ale nie jest poprawnym kluczem prywatnym RSA (długość: ${text.length} znaków).`);
    }
  }

  const header = /-----BEGIN ([A-Z0-9 ]+)-----/.exec(text)?.[1];
  if (header && !header.endsWith('PRIVATE KEY')) {
    throw new BankConfigError(
      `ENABLEBANKING_PRIVATE_KEY zawiera ${header === 'CERTIFICATE' ? 'certyfikat' : `"${header}"`}, a nie klucz prywatny. Wklej zawartość pliku z kluczem prywatnym (BEGIN PRIVATE KEY).`,
    );
  }
  if (header === 'ENCRYPTED PRIVATE KEY') {
    throw new BankConfigError('ENABLEBANKING_PRIVATE_KEY jest zaszyfrowany hasłem. Odszyfruj go: openssl pkcs8 -in klucz.pem -out private.pem');
  }
  if (header && !text.includes(`-----END ${header}-----`)) {
    throw new BankConfigError(`ENABLEBANKING_PRIVATE_KEY jest ucięty – brak linii END (${describe(header)}). Wklej cały plik.`);
  }

  // samo base64 bez nagłówków traktujemy jak PKCS#8
  const pem = header ? normalizePem(text) : normalizePem(`-----BEGIN PRIVATE KEY-----${text}-----END PRIVATE KEY-----`);
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') {
      throw new BankConfigError(`ENABLEBANKING_PRIVATE_KEY to klucz ${key.asymmetricKeyType}, a Enable Banking wymaga RSA.`);
    }
    return key;
  } catch (e) {
    if (e instanceof BankConfigError) throw e;
    throw new BankConfigError(`ENABLEBANKING_PRIVATE_KEY nie jest poprawnym kluczem prywatnym (${describe(header)}). Wklej cały plik klucza.`);
  }
};

export const createJwt = (appId: string, privateKey: string | KeyObject, now: Date): string => {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const payload = base64url(
    JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + JWT_TTL_SECONDS }),
  );
  const key = typeof privateKey === 'string' ? loadPrivateKey(privateKey) : privateKey;
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(key).toString('base64url');
  return `${header}.${payload}.${signature}`;
};

export type EnableBankingClient = {
  get: <T>(path: string, query?: Record<string, string | undefined>) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
};

type ClientConfig = {
  appId: string;
  privateKey: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  maxAttempts?: number;
  // najdłuższa blokada 429, na jaką czekamy w miejscu
  maxInlineWaitSeconds?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseError = (body: string): { code?: string; message: string } => {
  try {
    const parsed = JSON.parse(body) as Record<string, any>;
    const code = typeof parsed.error === 'string' ? parsed.error : undefined;
    const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
    return { code, message: [parsed.message, detail].filter(Boolean).join(' – ') || body.slice(0, 300) };
  } catch {
    return { message: body.slice(0, 300) };
  }
};

export const createEnableBankingClient = ({
  appId,
  privateKey,
  baseUrl = ENABLEBANKING_BASE_URL,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = () => new Date(),
  maxAttempts = 3,
  maxInlineWaitSeconds = 20,
}: ClientConfig): EnableBankingClient => {
  // klucz parsujemy raz na klienta, przy pierwszym zapytaniu
  let key: KeyObject | null = null;
  const request = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    key ??= loadPrivateKey(privateKey);
    for (let attempt = 1; ; attempt++) {
      const headers: Record<string, string> = {
        accept: 'application/json',
        authorization: `Bearer ${createJwt(appId, key, now())}`,
      };
      if (body !== undefined) headers['content-type'] = 'application/json';

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt >= maxAttempts) throw e;
        await sleep(1000 * attempt);
        continue;
      }

      const text = await response.text();
      if (response.ok) return (text ? JSON.parse(text) : {}) as T;

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '60') || 60;
        if (retryAfter <= maxInlineWaitSeconds && attempt < maxAttempts) {
          await sleep(retryAfter * 1000);
          continue;
        }
      } else if (response.status >= 500 && attempt < maxAttempts) {
        await sleep(1000 * attempt);
        continue;
      }
      const { code, message } = parseError(text);
      throw new EnableBankingApiError(
        `Enable Banking ${method} ${path.split('?')[0]} -> ${response.status}${code ? ` ${code}` : ''}: ${message}`,
        response.status,
        code,
      );
    }
  };

  return {
    get: (path, query) => {
      const params = new URLSearchParams(
        Object.entries(query ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ).toString();
      return request('GET', params ? `${path}?${params}` : path);
    },
    post: (path, body) => request('POST', path, body),
  };
};
