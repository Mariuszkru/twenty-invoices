import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SYNC_TIMES,
  dueSlot,
  manualFetchAllowed,
  nextSlot,
  parseSyncTimes,
  shouldCountManual,
  warsawClock,
} from 'src/lib/bank/schedule';

const TIMES = ['12:00', '15:40', '18:00'];
// 18.10.2026 to jeszcze czas letni (UTC+2)
const at = (utc: string) => new Date(`2026-10-18T${utc}:00Z`);

describe('parseSyncTimes', () => {
  it('normalizuje, sortuje i usuwa duplikaty', () => {
    expect(parseSyncTimes('18:00, 9:30,12:00 ,12:00')).toEqual({ times: ['09:30', '12:00', '18:00'], ignored: [] });
  });

  it('pomija błędne wpisy i nadmiarowe godziny ponad 3', () => {
    expect(parseSyncTimes('9:5, 25:00, 08:00, 10:00, 12:00, 14:00')).toEqual({
      times: ['08:00', '10:00', '12:00'],
      ignored: ['9:5', '25:00', '14:00'],
    });
  });

  it('pusta albo całkiem błędna wartość daje domyślne godziny', () => {
    expect(parseSyncTimes(undefined).times).toEqual(DEFAULT_SYNC_TIMES);
    expect(parseSyncTimes('rano').times).toEqual(DEFAULT_SYNC_TIMES);
  });
});

describe('warsawClock', () => {
  it('uwzględnia czas letni i zimowy', () => {
    expect(warsawClock(at('10:05'))).toEqual({ date: '2026-10-18', time: '12:05' });
    // po zmianie czasu 25.10.2026: UTC+1
    expect(warsawClock(new Date('2026-10-26T11:00:00Z'))).toEqual({ date: '2026-10-26', time: '12:00' });
    expect(warsawClock(new Date('2026-10-18T22:30:00Z'))).toEqual({ date: '2026-10-19', time: '00:30' });
  });
});

describe('dueSlot', () => {
  it('przed pierwszą godziną nic nie wypada', () => {
    expect(dueSlot(TIMES, at('09:50'), null)).toBeNull();
  });

  it('po 12:00 wypada termin 12:00, ale tylko raz', () => {
    expect(dueSlot(TIMES, at('10:05'), null)).toBe('2026-10-18 12:00');
    expect(dueSlot(TIMES, at('10:15'), '2026-10-18 12:00')).toBeNull();
  });

  it('pominięte terminy dają jedno pobranie za najpóźniejszy', () => {
    expect(dueSlot(TIMES, at('16:30'), '2026-10-18 12:00')).toBe('2026-10-18 18:00');
  });

  it('następny dzień zaczyna się od nowa, a wczorajszych terminów nie nadrabia', () => {
    expect(dueSlot(TIMES, new Date('2026-10-19T08:00:00Z'), '2026-10-18 18:00')).toBeNull();
    expect(dueSlot(TIMES, new Date('2026-10-19T10:00:00Z'), '2026-10-18 18:00')).toBe('2026-10-19 12:00');
  });
});

describe('nextSlot', () => {
  it('pokazuje najbliższy termin dziś albo pierwszy jutro', () => {
    expect(nextSlot(TIMES, at('10:05'))).toEqual({ date: '2026-10-18', time: '15:40' });
    expect(nextSlot(TIMES, at('16:30'))).toEqual({ date: '2026-10-19', time: '12:00' });
  });
});

describe('limit ręcznego pobrania', () => {
  it('raz na dzień kalendarzowy w Polsce', () => {
    expect(manualFetchAllowed(null, at('10:00'))).toBe(true);
    expect(manualFetchAllowed('2026-10-18', at('10:00'))).toBe(false);
    // 23:30 UTC 18.10 to już 19.10 w Polsce
    expect(manualFetchAllowed('2026-10-18', at('23:30'))).toBe(true);
  });

  it('zużywa dzień tylko wtedy, gdy przebieg doszedł do banku', () => {
    expect(shouldCountManual({ ok: true, fetched: 0 })).toBe(true);
    expect(shouldCountManual({ ok: false, fetched: 6 })).toBe(true);
    expect(shouldCountManual({ ok: false, fetched: 0 })).toBe(false);
    expect(shouldCountManual({ ok: false, skipped: 'NO_CONSENT', fetched: 0 })).toBe(false);
    expect(shouldCountManual({ ok: true, skipped: 'LOCKED', fetched: 0 })).toBe(false);
    expect(shouldCountManual({ ok: false, error: 'CONFIG' })).toBe(false);
  });
});
