import { describe, expect, it } from 'vitest';

import { parseFa3 } from 'src/lib/ksef/fa3-parser';
import { resolveDueDate, resolveRelativeTerm, type ParsedPayment } from 'src/lib/ksef/fa3-payment';

const invoiceWith = (platnosc: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-10-14</P_1>
    <P_2>FV/1</P_2>
    <Platnosc>${platnosc}</Platnosc>
  </Fa>
</Faktura>`;

const payment = (platnosc: string) => parseFa3(invoiceWith(platnosc)).payment;

const ctx = { issueDate: '2026-10-14', saleDate: '2026-10-10', receivedDate: '2026-10-15' };

describe('parsePayment', () => {
  it('termin z datą, przelew, rachunek bez spacji', () => {
    expect(
      payment(`
        <TerminPlatnosci><Termin>2026-10-28</Termin></TerminPlatnosci>
        <FormaPlatnosci>6</FormaPlatnosci>
        <RachunekBankowy><NrRB>PL85 1050 1360 1000 0090 8225 4047</NrRB><NazwaBanku>ING</NazwaBanku></RachunekBankowy>
        <IPKSeF>123ABCDEFGHIJ</IPKSeF>`),
    ).toEqual({
      dueDates: ['2026-10-28'],
      relativeTerms: [],
      paidInFull: false,
      paidAt: null,
      partialPaidMicros: null,
      method: 'TRANSFER',
      bankAccount: 'PL85105013601000009082254047',
      ksefPaymentId: '123ABCDEFGHIJ',
    });
  });

  it('zapłacono przy wystawieniu, inna forma płatności', () => {
    expect(
      payment(`
        <Zaplacono>1</Zaplacono><DataZaplaty>2026-07-31</DataZaplaty>
        <TerminPlatnosci><Termin>2026-08-01</Termin></TerminPlatnosci>
        <PlatnoscInna>1</PlatnoscInna><OpisPlatnosci>płatność online</OpisPlatnosci>`),
    ).toMatchObject({ paidInFull: true, paidAt: '2026-07-31', method: 'OTHER', dueDates: ['2026-08-01'] });
  });

  it('zapłaty częściowe: suma kwot i data ostatniej', () => {
    expect(
      payment(`
        <ZnacznikZaplatyCzesciowej>1</ZnacznikZaplatyCzesciowej>
        <ZaplataCzesciowa><KwotaZaplatyCzesciowej>100.00</KwotaZaplatyCzesciowej><DataZaplatyCzesciowej>2026-10-01</DataZaplatyCzesciowej></ZaplataCzesciowa>
        <ZaplataCzesciowa><KwotaZaplatyCzesciowej>50.50</KwotaZaplatyCzesciowej><DataZaplatyCzesciowej>2026-10-05</DataZaplatyCzesciowej><FormaPlatnosci>2</FormaPlatnosci></ZaplataCzesciowa>`),
    ).toMatchObject({ paidInFull: false, partialPaidMicros: 150_500_000, paidAt: '2026-10-05', method: 'CARD' });
  });

  it('kilka rat i termin opisowy', () => {
    expect(
      payment(`
        <TerminPlatnosci><Termin>2026-11-30</Termin></TerminPlatnosci>
        <TerminPlatnosci><Termin>2026-10-31</Termin></TerminPlatnosci>
        <TerminPlatnosci><TerminOpis><Ilosc>14</Ilosc><Jednostka>dni</Jednostka><ZdarzeniePoczatkowe>od daty doręczenia faktury</ZdarzeniePoczatkowe></TerminOpis></TerminPlatnosci>`),
    ).toMatchObject({
      dueDates: ['2026-11-30', '2026-10-31'],
      relativeTerms: [{ count: 14, unit: 'dni', event: 'od daty doręczenia faktury' }],
    });
  });

  it('faktura bez sekcji Platnosc', () => {
    const parsed = parseFa3(invoiceWith('').replace('<Platnosc></Platnosc>', ''));
    expect(parsed.payment).toMatchObject({ dueDates: [], paidInFull: false, method: null });
  });
});

describe('resolveRelativeTerm', () => {
  it.each([
    [14, 'dni', 'od daty wystawienia faktury', '2026-10-28'],
    [7, 'dni', 'od dnia dostawy', '2026-10-17'],
    [30, 'dni', 'od otrzymania faktury', '2026-11-14'],
    [2, 'tygodnie', 'od wystawienia', '2026-10-28'],
    [1, 'miesiąc', 'od wystawienia', '2026-11-14'],
    [14, 'dni', 'od podpisania protokołu', null],
    [3, 'kwartały', 'od wystawienia', null],
  ])('%d %s %s -> %s', (count, unit, event, expected) => {
    expect(resolveRelativeTerm({ count, unit, event }, ctx)).toBe(expected);
  });
});

describe('resolveDueDate', () => {
  const base: ParsedPayment = {
    dueDates: [],
    relativeTerms: [],
    paidInFull: false,
    paidAt: null,
    partialPaidMicros: null,
    method: null,
    bankAccount: null,
    ksefPaymentId: null,
  };

  it('najwcześniejsza data z faktury ma pierwszeństwo', () => {
    expect(
      resolveDueDate(
        { ...base, dueDates: ['2026-11-30', '2026-10-31'], relativeTerms: [{ count: 1, unit: 'dni', event: 'od wystawienia' }] },
        ctx,
      ),
    ).toEqual({ dueDate: '2026-10-31', source: 'INVOICE' });
  });

  it('bez daty – wyliczony z opisu', () => {
    expect(
      resolveDueDate({ ...base, relativeTerms: [{ count: 14, unit: 'dni', event: 'od wystawienia' }] }, ctx),
    ).toEqual({ dueDate: '2026-10-28', source: 'DESCRIPTION' });
  });

  it('brak informacji -> null (bez przypomnień)', () => {
    expect(resolveDueDate(base, ctx)).toBeNull();
    expect(
      resolveDueDate({ ...base, relativeTerms: [{ count: 14, unit: 'dni', event: 'od odbioru prac' }] }, { ...ctx, receivedDate: null }),
    ).toBeNull();
  });
});
