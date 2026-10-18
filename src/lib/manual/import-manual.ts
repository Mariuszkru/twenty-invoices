import { DIRECTION, DUE_DATE_SOURCE, PAYMENT_STATUS, SOURCE, SYNC_STATUS } from 'src/constants/options';
import { sumMicros } from 'src/lib/decimal';
import type { ParsedLine } from 'src/lib/ksef/fa3-parser';
import { findBuyerPersonId } from 'src/lib/manual/match-person';
import type { ManualInvoice, ManualLine } from 'src/lib/manual/types';
import { errorMessage } from 'src/lib/sync/import-details';
import { lineRecord } from 'src/lib/sync/mapping';
import type { InvoiceStore } from 'src/lib/sync/store';

// Import faktur B2C spoza KSeF z plików programów księgowych. Faktura trafia od razu jako COMPLETE (nie ma czego
// pobierać z KSeF); numer KSeF zostaje pusty. Fakturę już zaimportowaną (z dowolnego pliku) rozpoznajemy po numerze
// i odświeżamy jej dane oraz pozycje – plik z programu księgowego jest źródłem prawdy, jak XML przy KSeF.
// Statusu płatności nie ruszamy, a osobę i fakturę korygowaną tylko uzupełniamy, nigdy nie czyścimy.

const money = (micros: number, currencyCode: string) => ({ amountMicros: micros, currencyCode });

const PAYMENT_METHOD_BY_LABEL: [RegExp, string][] = [
  [/^got/i, 'CASH'],
  [/^przelew/i, 'TRANSFER'],
  [/^karta/i, 'CARD'],
];

export const paymentMethodOf = (label: string | null): string | null =>
  label === null ? null : (PAYMENT_METHOD_BY_LABEL.find(([re]) => re.test(label))?.[1] ?? 'OTHER');

// Formaty bez nazw pozycji (rejestr VAT): opis faktury albo „Sprzedaż” ze stawką.
const fallbackLineName = (invoice: ManualInvoice, line: ManualLine) => {
  const rate = line.vatRate && /^\d+(\.\d+)?$/.test(line.vatRate) ? `${line.vatRate}%` : line.vatRate;
  return `${invoice.description ?? 'Sprzedaż'}${rate ? ` (VAT ${rate})` : ''}`;
};

// Pozycja w kształcie FA(3), żeby marża i kwoty w PLN liczyły się jak dla KSeF.
const toParsedLine = (invoice: ManualInvoice, line: ManualLine, index: number): ParsedLine => ({
  lineNo: index + 1,
  name: line.name ?? fallbackLineName(invoice, line),
  unit: line.unit,
  quantity: line.quantity,
  unitNetPriceMicros: line.unitNetPriceMicros,
  netMicros: line.netMicros,
  grossMicros: line.netMicros + line.vatMicros,
  vatRate: line.vatRate,
  gtin: null,
  pkwiu: null,
  productCode: null,
  uuid: null,
  isBeforeCorrection: false,
  exchangeRate: invoice.currency === 'PLN' || line.netMicros === 0 ? null : line.netPlnMicros / line.netMicros,
});

// Pola nagłówka wynikające z pliku – wspólne dla nowej i odświeżanej faktury.
const headerFromFile = (invoice: ManualInvoice) => {
  const net = sumMicros(invoice.lines.map((l) => l.netMicros));
  const vat = sumMicros(invoice.lines.map((l) => l.vatMicros));
  const netPln = sumMicros(invoice.lines.map((l) => l.netPlnMicros));
  return {
    name: invoice.number,
    source: SOURCE.MANUAL as string,
    direction: DIRECTION.SALE,
    invoiceType: invoice.isCorrection ? 'KOR' : 'VAT',
    issueDate: invoice.issueDate,
    saleDate: invoice.saleDate,
    netAmount: money(net, invoice.currency),
    vatAmount: money(sumMicros(invoice.lines.map((l) => l.vatPlnMicros)), 'PLN'),
    grossAmount: money(net + vat, invoice.currency),
    exchangeRate: invoice.currency === 'PLN' || net === 0 ? null : netPln / net,
    netAmountPln: money(netPln, 'PLN'),
    counterpartyTaxId: invoice.buyerTaxId,
    counterpartyName: invoice.buyerName,
    dueDate: invoice.dueDate,
    dueDateSource: invoice.dueDate ? (DUE_DATE_SOURCE.INVOICE as string) : null,
    syncStatus: SYNC_STATUS.COMPLETE as string,
    syncError: null,
  };
};

export const manualInvoiceRecord = (
  invoice: ManualInvoice,
  links: { personId: string | null; correctedInvoiceId: string | null },
) => ({
  ...headerFromFile(invoice),
  ksefNumber: null,
  personId: links.personId,
  companyId: null,
  correctedKsefNumber: null,
  correctedInvoiceId: links.correctedInvoiceId,
  paymentMethod: paymentMethodOf(invoice.paymentMethod),
  paymentStatus: PAYMENT_STATUS.UNPAID as string,
});

export type ManualInvoiceRecord = ReturnType<typeof manualInvoiceRecord>;
export type ManualInvoiceUpdate = Partial<ManualInvoiceRecord>;

export type ManualImportResult = {
  created: string[];
  // już były w CRM – dane i pozycje odświeżone z pliku
  updated: string[];
  failed: { number: string; error: string }[];
  linkedToPerson: number;
};

export const importManualInvoices = async (
  store: InvoiceStore,
  invoices: ManualInvoice[],
): Promise<ManualImportResult> => {
  const result: ManualImportResult = { created: [], updated: [], failed: [], linkedToPerson: 0 };
  const numbers = invoices.flatMap((i) => (i.correctedNumber ? [i.number, i.correctedNumber] : [i.number]));
  const known = await store.findManualInvoiceIds([...new Set(numbers)]);
  const seen = new Set<string>();

  // faktury przed korektami, żeby korekta z tej samej paczki znalazła fakturę korygowaną
  const ordered = [...invoices].sort((a, b) => Number(a.isCorrection) - Number(b.isCorrection));
  for (const invoice of ordered) {
    // numer powtórzony w jednym pliku – liczy się pierwsze wystąpienie
    if (seen.has(invoice.number)) continue;
    seen.add(invoice.number);

    let invoiceId = known.get(invoice.number) ?? null;
    const isNew = invoiceId === null;
    try {
      const personId = await findBuyerPersonId(store, { email: null, name: invoice.buyerName });
      const correctedInvoiceId = invoice.correctedNumber ? (known.get(invoice.correctedNumber) ?? null) : null;
      if (invoiceId === null) {
        invoiceId = await store.createManualInvoice(
          manualInvoiceRecord(invoice, { personId, correctedInvoiceId }),
        );
        known.set(invoice.number, invoiceId);
      } else {
        const paymentMethod = paymentMethodOf(invoice.paymentMethod);
        await store.updateManualInvoice(invoiceId, {
          ...headerFromFile(invoice),
          ...(personId ? { personId } : {}),
          ...(correctedInvoiceId ? { correctedInvoiceId } : {}),
          ...(paymentMethod ? { paymentMethod } : {}),
        });
      }

      const ctx = {
        invoiceId,
        direction: DIRECTION.SALE,
        currency: invoice.currency,
        invoiceRate: null,
        issueDate: invoice.issueDate,
        companyId: null,
      };
      await store.replaceLines(
        invoiceId,
        invoice.lines.map((line, i) => lineRecord(toParsedLine(invoice, line, i), ctx)),
      );
      (isNew ? result.created : result.updated).push(invoice.number);
      if (personId) result.linkedToPerson++;
    } catch (e) {
      const error = errorMessage(e);
      result.failed.push({ number: invoice.number, error });
      // nagłówek bez (aktualnych) pozycji oznaczamy błędem, żeby nie udawał kompletnej faktury
      if (invoiceId) {
        await store
          .updateInvoice(invoiceId, { syncStatus: SYNC_STATUS.ERROR, syncError: `Import pozycji nieudany: ${error}` })
          .catch(() => undefined);
      }
    }
  }
  return result;
};
