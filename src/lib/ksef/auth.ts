import { constants, publicEncrypt, X509Certificate } from 'node:crypto';

import type { KsefHttpClient } from 'src/lib/ksef/http';

// Uwierzytelnienie tokenem KSeF (uwierzytelnianie.md, p. 2.2):
// challenge -> zaszyfrowany "token|timestampMs" (RSA-OAEP SHA-256) -> status -> redeem accessToken.

type ChallengeResponse = { challenge: string; timestamp: string; timestampMs: number };
type PublicKeyCertificate = {
  certificate: string;
  publicKeyId?: string;
  validFrom: string;
  validTo: string;
  usage: string[];
};
type InitResponse = {
  referenceNumber: string;
  authenticationToken: { token: string; validUntil: string };
};
type StatusResponse = { status: { code: number; description: string; details?: string[] | null } };
type TokensResponse = {
  accessToken: { token: string; validUntil: string };
  refreshToken: { token: string; validUntil: string };
};

export class KsefAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KsefAuthError';
  }
}

const STATUS_IN_PROGRESS = 100;
const STATUS_SUCCESS = 200;

export const pickTokenEncryptionCertificate = (
  certificates: PublicKeyCertificate[],
  now: Date,
): PublicKeyCertificate => {
  const valid = certificates.filter(
    (c) =>
      c.usage.includes('KsefTokenEncryption') &&
      new Date(c.validFrom) <= now &&
      new Date(c.validTo) > now,
  );
  if (valid.length === 0) {
    throw new KsefAuthError('KSeF nie zwrócił ważnego certyfikatu do szyfrowania tokena.');
  }
  // najdłużej ważny – przy rotacji kluczy MF publikuje nowy z późniejszym validTo
  return valid.sort((a, b) => Date.parse(b.validTo) - Date.parse(a.validTo))[0];
};

export const encryptKsefToken = (token: string, timestampMs: number, certificateB64: string) => {
  const publicKey = new X509Certificate(Buffer.from(certificateB64, 'base64')).publicKey;
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(`${token}|${timestampMs}`, 'utf8'),
  ).toString('base64');
};

type AuthenticateParams = {
  http: KsefHttpClient;
  nip: string;
  ksefToken: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  maxPolls?: number;
};

export const authenticateWithKsefToken = async ({
  http,
  nip,
  ksefToken,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => new Date(),
  maxPolls = 20,
}: AuthenticateParams): Promise<string> => {
  const challenge = await http.json<ChallengeResponse>('/auth/challenge', {
    method: 'POST',
  });
  const certificates = await http.json<PublicKeyCertificate[]>('/security/public-key-certificates');
  const certificate = pickTokenEncryptionCertificate(certificates, now());

  const init = await http.json<InitResponse>('/auth/ksef-token', {
    method: 'POST',
    body: {
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken: encryptKsefToken(ksefToken, challenge.timestampMs, certificate.certificate),
      ...(certificate.publicKeyId ? { publicKeyId: certificate.publicKeyId } : {}),
    },
  });

  const operationToken = init.authenticationToken.token;
  for (let poll = 0; ; poll++) {
    const { status } = await http.json<StatusResponse>(`/auth/${init.referenceNumber}`, {
      bearer: operationToken,
    });
    if (status.code === STATUS_SUCCESS) break;
    if (status.code !== STATUS_IN_PROGRESS) {
      const details = status.details?.length ? ` (${status.details.join('; ')})` : '';
      throw new KsefAuthError(
        `Uwierzytelnienie w KSeF nieudane: ${status.code} ${status.description}${details}`,
      );
    }
    if (poll >= maxPolls) {
      throw new KsefAuthError('Uwierzytelnienie w KSeF nie zakończyło się w oczekiwanym czasie.');
    }
    await sleep(Math.min(500 * (poll + 1), 3000));
  }

  const tokens = await http.json<TokensResponse>('/auth/token/redeem', {
    method: 'POST',
    bearer: operationToken,
  });
  return tokens.accessToken.token;
};
