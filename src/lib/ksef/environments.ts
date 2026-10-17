// Publiczne środowiska KSeF API 2.0 (https://github.com/CIRFMF/ksef-api/blob/main/srodowiska.md).
export const KSEF_BASE_URLS = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  demo: 'https://api-demo.ksef.mf.gov.pl/v2',
  prod: 'https://api.ksef.mf.gov.pl/v2',
} as const;

export type KsefEnv = keyof typeof KSEF_BASE_URLS;

export const resolveKsefEnv = (value: string | undefined): KsefEnv =>
  value === 'prod' || value === 'demo' ? value : 'test';
