// Harmonogram pobierania wyciągu. Cron Twenty ma wzorzec zapisany w manifeście, więc budzi się co 10 minut,
// a o tym, czy wypada pobranie, decyduje zmienna BANK_SYNC_TIMES (godziny w czasie polskim).
// PSD2 pozwala na ok. 4 zapytania dziennie bez udziału użytkownika: 3 automatyczne + 1 ręczne.

export const DEFAULT_SYNC_TIMES = ['12:00', '15:40', '18:00'];
export const MAX_SYNC_TIMES = 3;

export type ParsedSyncTimes = { times: string[]; ignored: string[] };

export const parseSyncTimes = (value: string | undefined): ParsedSyncTimes => {
  const ignored: string[] = [];
  const valid = new Set<string>();
  for (const raw of (value ?? '').split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
    const hours = match ? Number(match[1]) : NaN;
    const minutes = match ? Number(match[2]) : NaN;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      valid.add(`${String(hours).padStart(2, '0')}:${match![2]}`);
    } else {
      ignored.push(raw);
    }
  }
  const sorted = [...valid].sort();
  ignored.push(...sorted.slice(MAX_SYNC_TIMES));
  const times = sorted.slice(0, MAX_SYNC_TIMES);
  return { times: times.length ? times : [...DEFAULT_SYNC_TIMES], ignored };
};

const WARSAW = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Data i godzina w Polsce (z czasem letnim/zimowym), niezależnie od strefy serwera.
export const warsawClock = (now: Date): { date: string; time: string } => {
  const parts = Object.fromEntries(WARSAW.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

// Najpóźniejszy dzisiejszy termin, który już minął i nie był jeszcze obsłużony. Kilka pominiętych terminów
// (np. cron nie działał) daje jedno pobranie; terminów z poprzednich dni nie nadrabiamy.
export const dueSlot = (times: string[], now: Date, lastSlot: string | null): string | null => {
  const { date, time } = warsawClock(now);
  const passed = times.filter((t) => t <= time);
  if (passed.length === 0) return null;
  const slot = `${date} ${passed[passed.length - 1]}`;
  return lastSlot && lastSlot >= slot ? null : slot;
};

// Najbliższy termin do pokazania w panelu: dziś albo pierwszy jutro.
export const nextSlot = (times: string[], now: Date): { date: string; time: string } | null => {
  if (times.length === 0) return null;
  const { date, time } = warsawClock(now);
  const later = times.find((t) => t > time);
  if (later) return { date, time: later };
  return { date: warsawClock(new Date(now.getTime() + 24 * 60 * 60 * 1000)).date, time: times[0] };
};

// Ręczne pobranie: raz dziennie (dzień liczony w czasie polskim).
export const manualFetchAllowed = (lastManualDate: string | null, now: Date) => lastManualDate !== warsawClock(now).date;

// Dzień ręcznego pobrania przepada tylko wtedy, gdy przebieg doszedł do banku. Brak konfiguracji, zgody, lock
// albo błąd przed pierwszym zapytaniem (fetched = 0) nie zużywa limitu.
export const shouldCountManual = (result: { ok: boolean; skipped?: string; fetched?: number; error?: string }) =>
  !result.error && !result.skipped && (result.ok || (result.fetched ?? 0) > 0);
