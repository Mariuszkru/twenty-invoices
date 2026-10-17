import type { FetchImpl } from 'src/lib/ksef/http';

// Kurs średni NBP (tabela A) z ostatniego dnia roboczego przed datą – zasada z art. 31a ustawy o VAT.
// Używany tylko, gdy faktura w walucie obcej nie podaje kursu (KursWaluty / KursWalutyZ).

const DAY_MS = 24 * 60 * 60 * 1000;

type NbpRatesResponse = { rates: { effectiveDate: string; mid: number }[] };

export const fetchNbpRateBefore = async (
  currency: string,
  date: string,
  fetchImpl: FetchImpl = fetch,
): Promise<number | null> => {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(day)) return null;
  const end = new Date(day - DAY_MS).toISOString().slice(0, 10);
  const start = new Date(day - 10 * DAY_MS).toISOString().slice(0, 10);
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${start}/${end}/?format=json`;

  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const data = (await response.json()) as NbpRatesResponse;
  const last = data.rates?.[data.rates.length - 1];
  return last ? last.mid : null;
};
