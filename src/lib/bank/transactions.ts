import { createHash } from 'node:crypto';

import { BANK_DIRECTION, type BankDirection } from 'src/constants/options';
import type { BankAccount } from 'src/lib/bank/consent';
import type { EnableBankingClient } from 'src/lib/bank/enablebanking-http';
import { toMicros } from 'src/lib/decimal';
import type { Currency } from 'src/lib/sync/mapping';

// Pobranie zaksięgowanych transakcji rachunku (GET /accounts/{uid}/transactions) ze stronicowaniem
// po continuation_key i mapowanie na rekordy obiektu bankTransaction.

const MAX_PAGES = 50;
const NAME_MAX_LENGTH = 120;

type ApiAccountRef = { iban?: string | null; other?: { identification?: string | null } | null } | null;

export type ApiTransaction = {
  entry_reference?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: 'CRDT' | 'DBIT';
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  creditor_account?: ApiAccountRef;
  debtor_account?: ApiAccountRef;
};

export type BankTransactionRecord = {
  externalId: string;
  name: string;
  bookingDate: string | null;
  valueDate: string | null;
  direction: BankDirection;
  amount: Currency;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  remittanceInformation: string | null;
  accountIban: string | null;
};

const accountNumber = (ref: ApiAccountRef | undefined) =>
  ref?.iban?.replace(/\s/g, '') || ref?.other?.identification?.replace(/\s/g, '') || null;

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const toTransactionRecord = (t: ApiTransaction, account: BankAccount): BankTransactionRecord => {
  const direction = t.credit_debit_indicator === 'CRDT' ? BANK_DIRECTION.CREDIT : BANK_DIRECTION.DEBIT;
  // przy wpływie kontrahentem jest zleceniodawca (debtor), przy wydatku odbiorca (creditor)
  const party = direction === BANK_DIRECTION.CREDIT ? t.debtor : t.creditor;
  const partyAccount = direction === BANK_DIRECTION.CREDIT ? t.debtor_account : t.creditor_account;
  const title = (t.remittance_information ?? []).map((s) => s.trim()).filter(Boolean).join(' ') || null;
  const bookingDate = t.booking_date ?? t.value_date ?? t.transaction_date ?? null;
  const amountMicros = Math.abs(toMicros(t.transaction_amount.amount) ?? 0);
  const counterpartyName = party?.name?.trim() || null;
  const counterpartyAccount = accountNumber(partyAccount);

  // bez entry_reference klucz liczymy z treści; dwa identyczne przelewy tego samego dnia sklejają się w jeden
  const externalId = t.entry_reference
    ? `${account.uid}:${t.entry_reference}`
    : `${account.uid}:h:${createHash('sha256')
        .update([bookingDate, t.credit_debit_indicator, amountMicros, title, counterpartyAccount].join('|'))
        .digest('hex')
        .slice(0, 32)}`;

  return {
    externalId,
    name: shorten(
      [counterpartyName ?? (direction === BANK_DIRECTION.CREDIT ? 'Wpływ' : 'Wydatek'), title]
        .filter(Boolean)
        .join(' – '),
      NAME_MAX_LENGTH,
    ),
    bookingDate,
    valueDate: t.value_date ?? null,
    direction,
    amount: { amountMicros, currencyCode: t.transaction_amount.currency },
    counterpartyName,
    counterpartyAccount,
    remittanceInformation: title,
    accountIban: account.iban,
  };
};

type FetchParams = {
  client: EnableBankingClient;
  account: BankAccount;
  dateFrom: string;
  dateTo: string;
};

// Tylko transakcje zaksięgowane (BOOK); oczekujące (PDNG) mogą jeszcze zniknąć albo zmienić kwotę.
export const fetchBookedTransactions = async ({
  client,
  account,
  dateFrom,
  dateTo,
}: FetchParams): Promise<BankTransactionRecord[]> => {
  const records: BankTransactionRecord[] = [];
  let continuationKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.get<{ transactions: ApiTransaction[]; continuation_key?: string | null }>(
      `/accounts/${encodeURIComponent(account.uid)}/transactions`,
      { date_from: dateFrom, date_to: dateTo, continuation_key: continuationKey },
    );
    for (const t of response.transactions ?? []) {
      if ((t.status ?? 'BOOK') === 'BOOK') records.push(toTransactionRecord(t, account));
    }
    continuationKey = response.continuation_key ?? undefined;
    if (!continuationKey) break;
  }
  return records;
};
