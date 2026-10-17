// Kwoty w Twenty (CURRENCY) to amountMicros (1 jednostka = 1 000 000). Liczymy na BigInt, żeby uniknąć błędów floatów.

const DECIMAL_PATTERN = /^([+-])?(\d*)(?:[.,](\d*))?$/;

// "1234.56" | "-0,5" | 12.3 -> micros. Zwraca null dla pustych/niepoprawnych wartości.
export const toMicros = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 1_000_000) : null;
  }
  const trimmed = value.trim().replace(/\s/g, '');
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  const [, sign, intPart, fracPart = ''] = match;
  const frac7 = (fracPart + '0000000').slice(0, 7);
  let micros = BigInt(intPart || '0') * 1_000_000n + BigInt(frac7.slice(0, 6));
  // zaokrąglenie połówkowe na 7. cyfrze
  if (Number(frac7[6]) >= 5) micros += 1n;
  return Number(sign === '-' ? -micros : micros);
};

export const parseDecimal = (value: string | null | undefined): number | null => {
  const micros = toMicros(value);
  return micros === null ? null : micros / 1_000_000;
};

// micros × kurs (np. 4.2563) z zaokrągleniem do pełnych micros.
export const convertMicros = (micros: number, rate: number): number => Math.round(micros * rate);

export const sumMicros = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);
