import { describe, expect, it } from 'vitest';

import { createKsefHttpClient } from 'src/lib/ksef/http';
import { obtainAccessToken, tokenFingerprint } from 'src/lib/ksef/session';
import { createFakeKsef } from 'src/lib/__tests__/fake-ksef';

const NIP = '5260250274';
const NOW = new Date('2026-10-17T08:00:00Z');

const setup = (stored?: string) => {
  const fake = createFakeKsef({
    token: 'TOKEN',
    nip: NIP,
    invoices: { Subject1: [], Subject2: [] },
    xmlByKsefNumber: {},
    hwm: '2026-10-17T00:00:00Z',
  });
  const saved: string[] = [];
  const logs: string[] = [];
  const obtain = (ksefToken = 'TOKEN', nip = NIP) =>
    obtainAccessToken({
      http: createKsefHttpClient({ baseUrl: 'https://ksef.test/v2', fetchImpl: fake.fetchImpl, sleep: async () => {} }),
      nip,
      ksefToken,
      session: { stored, save: async (v) => void saved.push(v) },
      now: () => NOW,
      log: (m) => logs.push(m),
    });
  return { fake, saved, logs, obtain };
};

const session = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    nip: NIP,
    tokenFingerprint: tokenFingerprint('TOKEN'),
    refreshToken: 'REFRESH',
    refreshTokenValidUntil: '2026-10-20T00:00:00Z',
    ...overrides,
  });

const FULL_AUTH = [
  'POST /auth/challenge',
  'GET /security/public-key-certificates',
  'POST /auth/ksef-token',
  'GET /auth/REF-1',
  'POST /auth/token/redeem',
];

describe('obtainAccessToken', () => {
  it('bez zapisanej sesji loguje się w pełni i zapisuje refresh token', async () => {
    const { fake, saved, obtain } = setup();

    expect(await obtain()).toBe('ACCESS');
    expect(fake.calls).toEqual(FULL_AUTH);
    expect(JSON.parse(saved[0])).toEqual({
      v: 1,
      nip: NIP,
      tokenFingerprint: tokenFingerprint('TOKEN'),
      refreshToken: 'REFRESH',
      refreshTokenValidUntil: '2099-01-01T00:00:00Z',
    });
    // sam token KSeF nie trafia do zapisu
    expect(saved[0]).not.toContain('"TOKEN"');
  });

  it('z ważną sesją robi tylko jedno zapytanie /auth/token/refresh', async () => {
    const { fake, saved, obtain } = setup(session());

    expect(await obtain()).toBe('ACCESS');
    expect(fake.calls).toEqual(['POST /auth/token/refresh']);
    expect(saved).toEqual([]);
  });

  it.each([
    ['wygasła', session({ refreshTokenValidUntil: '2026-10-17T08:05:00Z' })],
    ['inny NIP', session({ nip: '7740001454' })],
    ['zmieniony token KSeF', session({ tokenFingerprint: tokenFingerprint('STARY') })],
    ['uszkodzona', 'nie-json'],
  ])('sesja %s -> pełne uwierzytelnienie', async (_label, stored) => {
    const { fake, saved, obtain } = setup(stored);

    expect(await obtain()).toBe('ACCESS');
    expect(fake.calls).toEqual(FULL_AUTH);
    expect(saved).toHaveLength(1);
  });

  it('odrzucony refresh token -> pełne uwierzytelnienie i nowa sesja', async () => {
    const { fake, saved, logs, obtain } = setup(session({ refreshToken: 'UNIEWAZNIONY' }));

    expect(await obtain()).toBe('ACCESS');
    expect(fake.calls).toEqual(['POST /auth/token/refresh', ...FULL_AUTH]);
    expect(saved).toHaveLength(1);
    expect(logs[0]).toContain('401');
  });
});
