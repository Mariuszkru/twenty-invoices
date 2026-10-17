import { describe, expect, it } from 'vitest';

import { authenticateWithKsefToken, KsefAuthError, pickTokenEncryptionCertificate } from 'src/lib/ksef/auth';
import { createKsefHttpClient, KsefApiError } from 'src/lib/ksef/http';
import { createFakeKsef } from 'src/lib/__tests__/fake-ksef';

const noSleep = async () => {};

const setup = (overrides: Partial<Parameters<typeof createFakeKsef>[0]> = {}) => {
  const fake = createFakeKsef({
    token: 'TOKEN-123',
    nip: '5260250274',
    invoices: { Subject1: [], Subject2: [] },
    xmlByKsefNumber: {},
    hwm: '2026-10-17T00:00:00Z',
    ...overrides,
  });
  const http = createKsefHttpClient({ baseUrl: 'https://ksef.test/v2', fetchImpl: fake.fetchImpl, sleep: noSleep });
  return { fake, http };
};

describe('authenticateWithKsefToken', () => {
  it('szyfruje token|timestampMs RSA-OAEP SHA-256 i zwraca accessToken', async () => {
    const { fake, http } = setup({ authPollsBeforeSuccess: 2 });

    const token = await authenticateWithKsefToken({
      http,
      nip: '5260250274',
      ksefToken: 'TOKEN-123',
      sleep: noSleep,
    });

    expect(token).toBe('ACCESS');
    expect(fake.calls).toEqual([
      'POST /auth/challenge',
      'GET /security/public-key-certificates',
      'POST /auth/ksef-token',
      'GET /auth/REF-1',
      'GET /auth/REF-1',
      'GET /auth/REF-1',
      'POST /auth/token/redeem',
    ]);
  });

  it('zgłasza błąd KSeF przy złym tokenie', async () => {
    const { http } = setup();
    await expect(
      authenticateWithKsefToken({ http, nip: '5260250274', ksefToken: 'ZLY', sleep: noSleep }),
    ).rejects.toThrow(KsefApiError);
  });
});

describe('pickTokenEncryptionCertificate', () => {
  const cert = (usage: string, validTo: string) => ({
    certificate: usage + validTo,
    validFrom: '2025-01-01T00:00:00Z',
    validTo,
    usage: [usage],
  });

  it('wybiera ważny certyfikat do szyfrowania tokenów z najpóźniejszym końcem ważności', () => {
    const picked = pickTokenEncryptionCertificate(
      [
        cert('SymmetricKeyEncryption', '2099-01-01T00:00:00Z'),
        cert('KsefTokenEncryption', '2027-01-01T00:00:00Z'),
        cert('KsefTokenEncryption', '2028-01-01T00:00:00Z'),
        cert('KsefTokenEncryption', '2026-01-01T00:00:00Z'),
      ],
      new Date('2026-10-17T00:00:00Z'),
    );
    expect(picked.validTo).toBe('2028-01-01T00:00:00Z');
  });

  it('bez ważnego certyfikatu rzuca KsefAuthError', () => {
    expect(() =>
      pickTokenEncryptionCertificate([cert('KsefTokenEncryption', '2026-01-01T00:00:00Z')], new Date('2026-10-17')),
    ).toThrow(KsefAuthError);
  });
});
