import { MATCH_STATUS, PAYMENT_STATUS } from 'src/constants/options';
import { AMOUNT_TOLERANCE_MICROS } from 'src/lib/bank/match';
import type { BankStore } from 'src/lib/bank/store';
import type { Currency } from 'src/lib/sync/mapping';

// Status płatności faktury wyliczany z sumy jej rozliczeń (bez pominiętych transakcji). Ten sam kod obsługuje
// dopasowanie automatyczne, panel "Rozlicz przelew" i ręczne zmiany rozliczeń.

export type InvoicePayment = {
  paymentStatus: string;
  paidAmount: Currency | null;
  paidAt: string | null;
};

// Nazwa rekordu rozliczenia widoczna w CRM: numer faktury i kwota.
export const allocationName = (invoiceName: string | null, amountMicros: number, currencyCode: string) =>
  `${invoiceName ?? 'Faktura'} ← ${(amountMicros / 1_000_000).toFixed(2)} ${currencyCode}`;

export const computePayment = (
  gross: Currency | null,
  transactions: { amount: Currency | null; bookingDate: string | null }[],
): InvoicePayment => {
  const currency = gross?.currencyCode ?? transactions[0]?.amount?.currencyCode ?? 'PLN';
  const counted = transactions.filter((t) => t.amount && t.amount.currencyCode === currency);
  const paid = counted.reduce((sum, t) => sum + (t.amount?.amountMicros ?? 0), 0);
  if (paid <= 0) return { paymentStatus: PAYMENT_STATUS.UNPAID, paidAmount: null, paidAt: null };

  const dates = counted.map((t) => t.bookingDate).filter((d): d is string => !!d).sort();
  const paidAt = dates[dates.length - 1] ?? null;
  const isPaid = gross !== null && paid >= gross.amountMicros - AMOUNT_TOLERANCE_MICROS;
  return {
    paymentStatus: isPaid ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIAL,
    paidAmount: { amountMicros: paid, currencyCode: currency },
    paidAt,
  };
};

export const recomputeInvoicePayment = async (store: BankStore, invoiceId: string): Promise<InvoicePayment> => {
  const [gross, allocations] = await Promise.all([
    store.getInvoiceGross(invoiceId),
    store.listInvoiceAllocations(invoiceId),
  ]);
  const payment = computePayment(
    gross,
    allocations.filter((a) => a.matchStatus !== MATCH_STATUS.IGNORED),
  );
  await store.updateInvoicePayment(invoiceId, payment);
  return payment;
};
