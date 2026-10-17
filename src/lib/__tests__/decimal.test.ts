import { describe, expect, it } from 'vitest';

import { convertMicros, parseDecimal, toMicros } from 'src/lib/decimal';

describe('toMicros', () => {
  it.each([
    ['1200.00', 1_200_000_000],
    ['0.1', 100_000],
    ['-200.5', -200_500_000],
    ['-0,5', -500_000],
    ['95.2857', 95_285_700],
    ['1.0000005', 1_000_001],
    ['-1.0000005', -1_000_001],
    ['12', 12_000_000],
    [' 1 000.25 ', 1_000_250_000],
  ])('%s -> %d', (input, expected) => {
    expect(toMicros(input)).toBe(expected);
  });

  it('akceptuje liczby z metadanych KSeF', () => {
    expect(toMicros(1845.1)).toBe(1_845_100_000);
  });

  it.each([null, undefined, '', 'abc', '.', '1.2.3'])('zwraca null dla %s', (input) => {
    expect(toMicros(input as string)).toBeNull();
  });
});

describe('parseDecimal / convertMicros', () => {
  it('parsuje ilości i kursy', () => {
    expect(parseDecimal('10.5')).toBe(10.5);
    expect(parseDecimal('4.3000')).toBe(4.3);
  });

  it('przelicza micros po kursie z zaokrągleniem', () => {
    expect(convertMicros(1_000_500_000, 4.2563)).toBe(4_258_428_150);
  });
});
