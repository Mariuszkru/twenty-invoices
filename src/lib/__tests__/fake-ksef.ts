import { constants, createPrivateKey, privateDecrypt } from 'node:crypto';

import type { KsefInvoiceMetadata } from 'src/lib/ksef/invoices';
import { fixture } from 'src/lib/__tests__/fixtures';

// Atrapa KSeF API 2.0 jako fetch: sprawdza zaszyfrowany token kluczem prywatnym certyfikatu testowego.

export const TEST_CERT_B64 = fixture('test-cert.b64.txt').trim();
const TEST_KEY = createPrivateKey({
  key: Buffer.from(fixture('test-key.pkcs8.b64.txt').trim(), 'base64'),
  format: 'der',
  type: 'pkcs8',
});

export type FakeKsefOptions = {
  token: string;
  nip: string;
  invoices: Record<'Subject1' | 'Subject2', KsefInvoiceMetadata[]>;
  xmlByKsefNumber: Record<string, string>;
  hwm: string;
  authPollsBeforeSuccess?: number;
  rateLimitDownloads?: boolean;
};

export const createFakeKsef = (options: FakeKsefOptions) => {
  const calls: string[] = [];
  let polls = 0;
  const timestampMs = 1_792_225_136_493;

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v2/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
    calls.push(`${init?.method ?? 'GET'} ${path}`);

    if (path === '/auth/challenge') {
      return json({ challenge: 'CH-1', timestamp: '2026-10-17T08:00:00Z', timestampMs, clientIp: '1.1.1.1' });
    }
    if (path === '/security/public-key-certificates') {
      return json([
        {
          certificate: TEST_CERT_B64,
          publicKeyId: 'key-1',
          validFrom: '2025-01-01T00:00:00Z',
          validTo: '2099-01-01T00:00:00Z',
          usage: ['KsefTokenEncryption'],
        },
      ]);
    }
    if (path === '/auth/ksef-token') {
      const plain = privateDecrypt(
        { key: TEST_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(body.encryptedToken, 'base64'),
      ).toString('utf8');
      const ok =
        plain === `${options.token}|${timestampMs}` &&
        body.challenge === 'CH-1' &&
        body.contextIdentifier?.value === options.nip;
      if (!ok) return json({ exception: { exceptionDetailList: [{ exceptionCode: 21405, exceptionDescription: 'Błąd tokena' }] } }, 400);
      return json({ referenceNumber: 'REF-1', authenticationToken: { token: 'OP-TOKEN', validUntil: '2099-01-01T00:00:00Z' } }, 202);
    }
    if (path === '/auth/REF-1') {
      if (auth !== 'Bearer OP-TOKEN') return json({}, 401);
      polls++;
      const done = polls > (options.authPollsBeforeSuccess ?? 0);
      return json({ status: done ? { code: 200, description: 'OK' } : { code: 100, description: 'W toku' } });
    }
    if (path === '/auth/token/redeem') {
      return json({
        accessToken: { token: 'ACCESS', validUntil: '2099-01-01T00:00:00Z' },
        refreshToken: { token: 'REFRESH', validUntil: '2099-01-01T00:00:00Z' },
      });
    }
    if (auth !== 'Bearer ACCESS') return json({}, 401);

    if (path === '/invoices/query/metadata') {
      const subject = body.subjectType as 'Subject1' | 'Subject2';
      const from = Date.parse(body.dateRange.from);
      const to = Math.min(Date.parse(body.dateRange.to), Date.parse(options.hwm));
      const matching = options.invoices[subject].filter((i) => {
        const t = Date.parse(i.permanentStorageDate);
        return t >= from && t <= to;
      });
      const offset = Number(url.searchParams.get('pageOffset'));
      const size = Number(url.searchParams.get('pageSize'));
      const page = matching.slice(offset, offset + size);
      return json({
        hasMore: offset + size < matching.length,
        isTruncated: false,
        permanentStorageHwmDate: new Date(to).toISOString(),
        invoices: page,
      });
    }
    const download = /^\/invoices\/ksef\/(.+)$/.exec(path);
    if (download) {
      if (options.rateLimitDownloads) return json({}, 429, { 'retry-after': '600' });
      const xml = options.xmlByKsefNumber[decodeURIComponent(download[1])];
      if (!xml) return json({ exception: { exceptionDetailList: [{ exceptionCode: 21164, exceptionDescription: 'Faktura nie istnieje' }] } }, 404);
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    return json({ title: `nieobsłużone ${path}` }, 500);
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls };
};
