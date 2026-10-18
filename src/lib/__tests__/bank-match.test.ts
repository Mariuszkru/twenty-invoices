import { describe, expect, it } from 'vitest';

import { matchTransaction, normalizeAccount, type MatchableTransaction } from 'src/lib/bank/match';
import { computePayment } from 'src/lib/bank/payment';
import { openInvoice } from 'src/lib/__tests__/fake-enablebanking';

const PLN = (amount: number) => ({ amountMicros: Math.round(amount * 1_000_000), currencyCode: 'PLN' });

const tx = (overrides: Partial<MatchableTransaction>): MatchableTransaction => ({
  direction: 'CREDIT',
  amount: PLN(1230),
  remittanceInformation: null,
  counterpartyName: 'Inna Firma',
  counterpartyAccount: null,
  bookingDate: '2026-10-16',
  ...overrides,
});

describe('matchTransaction', () => {
  it('dopasowuje po numerze faktury w tytule mimo innych separatorów', () => {
    const invoices = [openInvoice({ id: 'a', name: 'FV/10/2026/001' }), openInvoice({ id: 'b', name: 'FV/10/2026/002' })];
    const result = matchTransaction(tx({ remittanceInformation: 'Zapłata za fv 10-2026-001, dziękuję' }), invoices);
    expect(result.invoiceId).toBe('a');
    expect(result.note).toContain('numer faktury');
  });

  it('nie myli 1/2026 z 11/2026', () => {
    const invoices = [openInvoice({ id: 'a', name: 'FS 1/2026' }), openInvoice({ id: 'b', name: 'FS 11/2026' })];
    expect(matchTransaction(tx({ remittanceInformation: 'FS 11/2026' }), invoices).invoiceId).toBe('b');
  });

  it('dopasowuje po identyfikatorze płatności KSeF', () => {
    const invoices = [openInvoice({ id: 'a', name: 'A/1', ksefPaymentId: 'ABCDEF123456' })];
    expect(matchTransaction(tx({ remittanceInformation: 'IPKSeF ABCDEF123456' }), invoices).invoiceId).toBe('a');
  });

  it('wpłata mniejsza niż kwota faktury z numerem w tytule to wpłata częściowa', () => {
    const result = matchTransaction(
      tx({ amount: PLN(500), remittanceInformation: 'FV/10/2026/001 rata 1' }),
      [openInvoice({ id: 'a' })],
    );
    expect(result).toEqual({ invoiceId: 'a', note: expect.stringContaining('wpłata częściowa (pozostało 730.00)') });
  });

  it('wpływ dopasowuje tylko faktury sprzedaży, wydatek tylko zakupowe', () => {
    const purchase = openInvoice({ id: 'p', direction: 'PURCHASE', name: 'FZ/1/2026' });
    expect(matchTransaction(tx({ remittanceInformation: 'FZ/1/2026' }), [purchase]).invoiceId).toBeNull();
    expect(matchTransaction(tx({ direction: 'DEBIT', remittanceInformation: 'FZ/1/2026' }), [purchase]).invoiceId).toBe('p');
  });

  it('pomija faktury w innej walucie', () => {
    const eur = openInvoice({ id: 'e', grossAmount: { amountMicros: 1_230_000_000, currencyCode: 'EUR' } });
    expect(matchTransaction(tx({ remittanceInformation: 'FV/10/2026/001' }), [eur]).invoiceId).toBeNull();
  });

  it('bez numeru: zakup po kwocie i rachunku odbiorcy', () => {
    const invoices = [
      openInvoice({ id: 'p1', direction: 'PURCHASE', bankAccount: '27 1140 2004 0000 3002 0135 5387' }),
      openInvoice({ id: 'p2', direction: 'PURCHASE', bankAccount: '61 1090 1014 0000 0712 1981 2874' }),
    ];
    const result = matchTransaction(
      tx({ direction: 'DEBIT', remittanceInformation: 'Usługi IT', counterpartyAccount: 'PL27114020040000300201355387' }),
      invoices,
    );
    expect(result.invoiceId).toBe('p1');
  });

  it('bez numeru: sprzedaż po kwocie i nazwie kontrahenta', () => {
    const invoices = [openInvoice({ id: 's', counterpartyName: 'ACME Spółka z o.o.' })];
    expect(matchTransaction(tx({ counterpartyName: 'ACME SPOLKA Z OGRANICZONA' }), invoices).invoiceId).toBe('s');
  });

  it('nie zgaduje przy kilku kandydatach', () => {
    const invoices = [
      openInvoice({ id: 'a', name: 'X/1', counterpartyName: 'ACME' }),
      openInvoice({ id: 'b', name: 'X/2', counterpartyName: 'ACME' }),
    ];
    const result = matchTransaction(tx({ counterpartyName: 'ACME' }), invoices);
    expect(result.invoiceId).toBeNull();
    expect(result.note).toContain('Kilka faktur');
  });

  it('kwota bez potwierdzonego kontrahenta zostaje nieprzypisana', () => {
    const result = matchTransaction(tx({ counterpartyName: 'Ktoś Inny' }), [openInvoice({ id: 'a' })]);
    expect(result.invoiceId).toBeNull();
    expect(result.note).toContain('kontrahent się nie zgadza');
  });

  it('rdzeń numeru z innym prefiksem dopasowuje tylko przy zgodnej kwocie', () => {
    const invoices = [openInvoice({ id: 'a', name: 'FV 31/09/2026', counterpartyName: 'Euro-Bud' })];
    expect(matchTransaction(tx({ remittanceInformation: 'FRA 31/09/2026', counterpartyName: 'X' }), invoices)).toEqual({
      invoiceId: 'a',
      note: expect.stringContaining('inny prefiks'),
    });
    expect(
      matchTransaction(tx({ amount: PLN(100), remittanceInformation: 'FRA 31/09/2026', counterpartyName: 'X' }), invoices)
        .invoiceId,
    ).toBeNull();
  });

  it('sam rok albo pojedyncza liczba nie są rdzeniem numeru', () => {
    const invoices = [openInvoice({ id: 'a', name: 'FV 2026', counterpartyName: 'Euro-Bud' })];
    expect(matchTransaction(tx({ remittanceInformation: 'Zapłata 2026', counterpartyName: 'X' }), invoices).invoiceId).toBeNull();
  });

  it('wydatek kartą: dokładna kwota i data faktury ±3 dni, tylko przy jednym kandydacie', () => {
    const card = tx({
      direction: 'DEBIT',
      amount: PLN(522.75),
      remittanceInformation: '00000095191730150 MOBILE-PAYMENT-POS-TX-CODE',
      counterpartyName: null,
      bookingDate: '2026-10-16',
    });
    const dorian = openInvoice({ id: 'd', direction: 'PURCHASE', name: 'FS-133/10/26/OS', grossAmount: PLN(522.75), issueDate: '2026-10-16' });
    const old = openInvoice({ id: 'o', direction: 'PURCHASE', name: 'X/1', grossAmount: PLN(522.75), issueDate: '2026-10-01' });
    expect(matchTransaction(card, [dorian, old])).toEqual({ invoiceId: 'd', note: expect.stringContaining('data faktury ±3 dni') });

    const twin = openInvoice({ id: 't', direction: 'PURCHASE', name: 'X/2', grossAmount: PLN(522.75), issueDate: '2026-10-14' });
    expect(matchTransaction(card, [dorian, twin])).toEqual({ invoiceId: null, note: expect.stringContaining('Kilka faktur z tą kwotą i datą') });
  });

  it('reguła karty nie działa, gdy rachunek odbiorcy należy do innego znanego dostawcy', () => {
    const other = openInvoice({ id: 'x', direction: 'PURCHASE', name: 'Z/1', grossAmount: PLN(10), bankAccount: 'PL27114020040000300201355387' });
    const sameAmount = openInvoice({ id: 'y', direction: 'PURCHASE', name: 'Z/2', grossAmount: PLN(1230), issueDate: '2026-10-15' });
    const result = matchTransaction(
      tx({ direction: 'DEBIT', counterpartyAccount: 'PL27114020040000300201355387', counterpartyName: 'Dostawca X' }),
      [other, sameAmount],
    );
    expect(result.invoiceId).toBeNull();
  });

  it('liczy pozostałą kwotę po wcześniejszej wpłacie częściowej', () => {
    const invoice = openInvoice({ id: 'a', paidAmount: PLN(1000), counterpartyName: 'Klient' });
    expect(matchTransaction(tx({ amount: PLN(230), counterpartyName: 'Klient' }), [invoice]).invoiceId).toBe('a');
  });
});

describe('normalizeAccount', () => {
  it('porównuje NRB i IBAN po cyfrach', () => {
    expect(normalizeAccount('PL 27 1140 2004 0000 3002 0135 5387')).toBe(normalizeAccount('27114020040000300201355387'));
    expect(normalizeAccount(null)).toBeNull();
  });
});

describe('computePayment', () => {
  const gross = PLN(1230);

  it('suma równa brutto to zapłacona, z datą ostatniej wpłaty', () => {
    expect(
      computePayment(gross, [
        { amount: PLN(1000), bookingDate: '2026-10-01' },
        { amount: PLN(230), bookingDate: '2026-10-05' },
      ]),
    ).toEqual({ paymentStatus: 'PAID', paidAmount: PLN(1230), paidAt: '2026-10-05' });
  });

  it('mniejsza suma to częściowo, brak wpłat to niezapłacona', () => {
    expect(computePayment(gross, [{ amount: PLN(100), bookingDate: '2026-10-01' }]).paymentStatus).toBe('PARTIAL');
    expect(computePayment(gross, [])).toEqual({ paymentStatus: 'UNPAID', paidAmount: null, paidAt: null });
  });
});
