export type FetchImpl = typeof fetch;

export class KsefApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'KsefApiError';
  }
}

// 429 z czasem blokady dłuższym, niż możemy odczekać w jednym przebiegu – synchronizacja kończy się i wraca w kolejnym cronie.
export class KsefRateLimitError extends KsefApiError {
  constructor(
    readonly retryAfterSeconds: number,
    body?: string,
  ) {
    super(`KSeF: przekroczony limit zapytań, ponów za ${retryAfterSeconds} s`, 429, body);
    this.name = 'KsefRateLimitError';
  }
}

export type KsefRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  bearer?: string;
  accept?: string;
};

export type KsefHttpClient = {
  json: <T>(path: string, options?: KsefRequestOptions) => Promise<T>;
  text: (path: string, options?: KsefRequestOptions) => Promise<string>;
};

type HttpClientConfig = {
  baseUrl: string;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  // najdłuższa blokada 429, na jaką czekamy w miejscu
  maxInlineWaitSeconds?: number;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const errorDetails = (body: string): string => {
  try {
    const parsed = JSON.parse(body) as Record<string, any>;
    const exception = parsed.exception?.exceptionDetailList?.[0];
    if (exception) {
      return `${exception.exceptionCode}: ${exception.exceptionDescription}${
        exception.details?.length ? ` (${exception.details.join('; ')})` : ''
      }`;
    }
    return parsed.detail ?? parsed.title ?? parsed.message ?? body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
};

export const createKsefHttpClient = ({
  baseUrl,
  fetchImpl = fetch,
  sleep = defaultSleep,
  maxInlineWaitSeconds = 20,
  maxAttempts = 3,
}: HttpClientConfig): KsefHttpClient => {
  const request = async (path: string, options: KsefRequestOptions = {}): Promise<string> => {
    const headers: Record<string, string> = { accept: options.accept ?? 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch (e) {
        if (attempt >= maxAttempts) throw e;
        await sleep(1000 * attempt);
        continue;
      }

      const body = await response.text();
      if (response.ok) return body;

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '60') || 60;
        if (retryAfter > maxInlineWaitSeconds || attempt >= maxAttempts) {
          throw new KsefRateLimitError(retryAfter, body);
        }
        await sleep(retryAfter * 1000);
        continue;
      }
      if (response.status >= 500 && attempt < maxAttempts) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new KsefApiError(
        `KSeF ${options.method ?? 'GET'} ${path} -> ${response.status}: ${errorDetails(body)}`,
        response.status,
        body,
      );
    }
  };

  return {
    json: async <T>(path: string, options?: KsefRequestOptions) =>
      JSON.parse(await request(path, options)) as T,
    text: request,
  };
};
