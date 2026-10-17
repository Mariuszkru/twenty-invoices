import { describe, expect, it } from 'vitest';

import { createKsefHttpClient, KsefApiError, KsefRateLimitError } from 'src/lib/ksef/http';

const respond = (responses: Response[]) => {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return responses.shift()!;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe('createKsefHttpClient', () => {
  it('czeka krótką blokadę 429 i ponawia', async () => {
    const sleeps: number[] = [];
    const { fetchImpl, calls } = respond([
      new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('{"ok":true}', { status: 200 }),
    ]);
    const http = createKsefHttpClient({ baseUrl: 'https://k', fetchImpl, sleep: async (ms) => void sleeps.push(ms) });

    expect(await http.json('/x')).toEqual({ ok: true });
    expect(sleeps).toEqual([2000]);
    expect(calls).toHaveLength(2);
  });

  it('długą blokadę 429 zgłasza od razu jako KsefRateLimitError', async () => {
    const { fetchImpl } = respond([new Response('{}', { status: 429, headers: { 'retry-after': '900' } })]);
    const http = createKsefHttpClient({ baseUrl: 'https://k', fetchImpl, sleep: async () => {} });

    await expect(http.json('/x')).rejects.toMatchObject({ name: 'KsefRateLimitError', retryAfterSeconds: 900 });
    await expect(Promise.reject(new KsefRateLimitError(1))).rejects.toBeInstanceOf(KsefApiError);
  });

  it('błąd 4xx zawiera opis wyjątku KSeF', async () => {
    const body = JSON.stringify({ exception: { exceptionDetailList: [{ exceptionCode: 21405, exceptionDescription: 'Błąd walidacji', details: ['pole X'] }] } });
    const { fetchImpl } = respond([new Response(body, { status: 400 })]);
    const http = createKsefHttpClient({ baseUrl: 'https://k', fetchImpl, sleep: async () => {} });

    await expect(http.json('/x', { method: 'POST', body: {} })).rejects.toThrow('21405: Błąd walidacji (pole X)');
  });

  it('ponawia błędy 5xx', async () => {
    const { fetchImpl, calls } = respond([new Response('', { status: 503 }), new Response('<xml/>', { status: 200 })]);
    const http = createKsefHttpClient({ baseUrl: 'https://k', fetchImpl, sleep: async () => {} });

    expect(await http.text('/x', { accept: 'application/xml' })).toBe('<xml/>');
    expect(calls).toHaveLength(2);
    expect((calls[0].headers as Record<string, string>).accept).toBe('application/xml');
  });
});
