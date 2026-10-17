// Licznik zapytań w przesuwnym oknie (jak w KSeF: req/min i req/h liczone równolegle).
// Stan trzymamy w KV, bo każdy przebieg funkcji to osobny proces.

export type KvStore = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<void>;
};

export type RateLimit = { perMinute: number; perHour: number };

// Limity produkcyjne z limity/limity-api.md z zapasem na ręczne użycie API przez podatnika.
export const KSEF_LIMITS = {
  metadata: { perMinute: 14, perHour: 18 },
  download: { perMinute: 14, perHour: 60 },
} satisfies Record<string, RateLimit>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type RateBudget = {
  available: () => number;
  record: (count?: number) => void;
  persist: () => Promise<void>;
};

export const loadRateBudget = async (
  kv: KvStore,
  name: string,
  limit: RateLimit,
  now: () => number = Date.now,
): Promise<RateBudget> => {
  const key = `ksef:rate:${name}`;
  let log = ((await kv.get<number[]>(key)) ?? []).filter((t) => now() - t < HOUR);

  return {
    available: () => {
      const t = now();
      const lastMinute = log.filter((x) => t - x < MINUTE).length;
      return Math.max(0, Math.min(limit.perMinute - lastMinute, limit.perHour - log.length));
    },
    record: (count = 1) => {
      const t = now();
      log = [...log.filter((x) => t - x < HOUR), ...Array.from({ length: count }, () => t)];
    },
    persist: () => kv.set(key, log),
  };
};
