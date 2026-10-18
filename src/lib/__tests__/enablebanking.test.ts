import { createPrivateKey, createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  completeAuthorization,
  findAspsp,
  parseStoredSession,
  startAuthorization,
} from 'src/lib/bank/consent';
import {
  createEnableBankingClient,
  createJwt,
  EnableBankingApiError,
  isConsentError,
  loadPrivateKey,
  normalizePem,
} from 'src/lib/bank/enablebanking-http';
import { toTransactionRecord } from 'src/lib/bank/transactions';
import { apiTransaction, createFakeEnableBanking } from 'src/lib/__tests__/fake-enablebanking';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const NOW = new Date('2026-10-18T05:00:00Z');

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('createJwt', () => {
  it('podpisuje RS256 z kid = identyfikator aplikacji i claimami wymaganymi przez Enable Banking', () => {
    const [header, payload, signature] = createJwt('app-1', privateKey, NOW).split('.');
    expect(decode(header)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-1' });
    expect(decode(payload)).toEqual({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 3600,
    });
    const valid = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, signature, 'base64url');
    expect(valid).toBe(true);
  });

  it('odtwarza PEM wklejony w jednej linii', () => {
    const flattened = privateKey.replace(/\n/g, ' ');
    expect(normalizePem(flattened)).toBe(privateKey);
    expect(() => createJwt('app-1', flattened, NOW)).not.toThrow();
  });
});

describe('loadPrivateKey', () => {
  const body = privateKey.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');

  it('przyjmuje samo base64 bez nagłówków i JWK z przeglądarki', () => {
    expect(loadPrivateKey(body).asymmetricKeyType).toBe('rsa');
    const jwk = JSON.stringify(createPrivateKey(privateKey).export({ format: 'jwk' }));
    expect(loadPrivateKey(jwk).asymmetricKeyType).toBe('rsa');
  });

  it('rozpoznaje certyfikat zamiast klucza', () => {
    expect(() => loadPrivateKey('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----')).toThrow('certyfikat');
  });

  it('rozpoznaje ucięty klucz i nie pokazuje jego treści', () => {
    const truncated = privateKey.slice(0, 200);
    const error = (() => {
      try {
        loadPrivateKey(truncated);
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toContain('ucięty');
    expect(error?.message).not.toContain(body.slice(0, 20));
  });

  it('błędne dane opisuje rodzajem i długością', () => {
    expect(() => loadPrivateKey('-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----')).toThrow(
      'nie jest poprawnym kluczem prywatnym (nagłówek: BEGIN PRIVATE KEY',
    );
  });
});

describe('createEnableBankingClient', () => {
  const respond = (responses: Response[]) => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return responses.shift()!;
    }) as unknown as typeof fetch;
    return { fetchImpl, urls };
  };

  it('ponawia 5xx i dokleja parametry zapytania', async () => {
    const { fetchImpl, urls } = respond([new Response('', { status: 503 }), new Response('{"ok":1}')]);
    const client = createEnableBankingClient({ appId: 'a', privateKey, fetchImpl, sleep: async () => {} });
    expect(await client.get('/x', { date_from: '2026-10-01', continuation_key: undefined })).toEqual({ ok: 1 });
    expect(urls).toEqual(['https://api.enablebanking.com/x?date_from=2026-10-01', 'https://api.enablebanking.com/x?date_from=2026-10-01']);
  });

  it('zgłasza kod błędu Enable Banking', async () => {
    const { fetchImpl } = respond([
      new Response('{"code":401,"message":"Session is expired","error":"EXPIRED_SESSION"}', { status: 401 }),
    ]);
    const client = createEnableBankingClient({ appId: 'a', privateKey, fetchImpl, sleep: async () => {} });
    const error = (await client.get('/accounts/1/transactions').catch((e: unknown) => e)) as EnableBankingApiError;
    expect(error).toBeInstanceOf(EnableBankingApiError);
    expect(error.code).toBe('EXPIRED_SESSION');
    expect(isConsentError(error)).toBe(true);
    expect(isConsentError(new EnableBankingApiError('x', 500))).toBe(false);
  });
});

describe('zgoda', () => {
  const aspsps = [
    { name: 'mBank', country: 'PL', maximum_consent_validity: 90 * 24 * 3600, psu_types: ['personal', 'business'] },
    { name: 'PKO BP', country: 'PL' },
  ];

  it('startAuthorization ogranicza ważność do limitu banku i prosi o konto firmowe', async () => {
    const { client, calls } = createFakeEnableBanking({ aspsps });
    const result = await startAuthorization({
      client,
      aspspName: 'mbank',
      country: 'PL',
      redirectUrl: 'https://crm.example/s/bank/callback',
      state: 'state-1',
      now: NOW,
    });
    expect(result.url).toBe('https://bank.example/login?x=1');
    expect(calls[1].body).toEqual({
      access: { valid_until: '2027-01-16T04:59:00.000Z' },
      aspsp: { name: 'mBank', country: 'PL' },
      state: 'state-1',
      redirect_url: 'https://crm.example/s/bank/callback',
      psu_type: 'business',
    });
  });

  it('nieznany bank: komunikat z podobnymi nazwami', async () => {
    const { client } = createFakeEnableBanking({ aspsps });
    await expect(findAspsp(client, 'mBank Korporacyjny', 'PL')).rejects.toThrow('Podobne: mBank');
  });

  it('completeAuthorization zapisuje sesję przypiętą do aplikacji', async () => {
    const { client } = createFakeEnableBanking();
    const session = await completeAuthorization(client, 'code-1', 'app-1');
    expect(session).toEqual({
      v: 1,
      appId: 'app-1',
      sessionId: 'session-1',
      aspsp: { name: 'mBank', country: 'PL' },
      accounts: [{ uid: 'acc-1', iban: 'PL61109010140000071219812874', currency: 'PLN' }],
      validUntil: '2027-04-16T08:00:00Z',
    });
    expect(parseStoredSession(JSON.stringify(session), 'app-1')).toEqual(session);
    expect(parseStoredSession(JSON.stringify(session), 'inna-aplikacja')).toBeNull();
  });
});

describe('toTransactionRecord', () => {
  const account = { uid: 'acc-1', iban: 'PL61109010140000071219812874', currency: 'PLN' };

  it('przy wydatku kontrahentem jest odbiorca, kwota zawsze dodatnia', () => {
    const record = toTransactionRecord(
      apiTransaction({
        amount: '-49.90',
        credit_debit_indicator: 'DBIT',
        creditor: { name: 'Dostawca sp. z o.o.' },
        creditor_account: { iban: 'PL27 1140 2004 0000 3002 0135 5387' },
        remittance_information: ['FZ/7/2026', ' abonament '],
      }),
      account,
    );
    expect(record).toMatchObject({
      externalId: 'acc-1:ref-1',
      direction: 'DEBIT',
      amount: { amountMicros: 49_900_000, currencyCode: 'PLN' },
      counterpartyName: 'Dostawca sp. z o.o.',
      counterpartyAccount: 'PL27114020040000300201355387',
      remittanceInformation: 'FZ/7/2026 abonament',
      name: 'Dostawca sp. z o.o. – FZ/7/2026 abonament',
    });
  });

  it('bez entry_reference liczy stabilny klucz z treści', () => {
    const a = toTransactionRecord(apiTransaction({ entry_reference: null }), account);
    const b = toTransactionRecord(apiTransaction({ entry_reference: null }), account);
    const c = toTransactionRecord(apiTransaction({ entry_reference: null, amount: '101.00' }), account);
    expect(a.externalId).toMatch(/^acc-1:h:[0-9a-f]{32}$/);
    expect(a.externalId).toBe(b.externalId);
    expect(a.externalId).not.toBe(c.externalId);
  });
});
