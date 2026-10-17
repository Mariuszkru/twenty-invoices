import { PAYMENT_STATUS, SYNC_STATUS } from 'src/constants/options';
import { sumMicros } from 'src/lib/decimal';
import { parseFa3 } from 'src/lib/ksef/fa3-parser';
import { resolveDueDate } from 'src/lib/ksef/fa3-payment';
import { lineNetPln, lineRecord } from 'src/lib/sync/mapping';
import type { InvoiceStore, InvoiceUpdate, PendingInvoice } from 'src/lib/sync/store';

// Szczegóły faktury z XML FA(3): pozycje, kurs, korekta, płatność. Wspólne dla synchronizacji
// (XML świeżo pobrany z KSeF) i ponownego przetwarzania (XML zapisany w CRM).

export type ImportDetailsDeps = {
  store: InvoiceStore;
  nbpRate: (currency: string, date: string) => Promise<number | null>;
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

export const importInvoiceDetails = async (
  deps: ImportDetailsDeps,
  invoice: PendingInvoice,
  xml: string,
  options: { uploadXml: boolean },
): Promise<InvoiceUpdate> => {
  const parsed = parseFa3(xml);
  const currency = parsed.currency;

  // Kurs dla faktur w walucie obcej: nagłówek, a gdy go brak i pozycje też go nie mają – NBP z dnia poprzedzającego.
  let invoiceRate = parsed.headerExchangeRate;
  const needsRate =
    currency !== 'PLN' && invoiceRate === null && parsed.lines.some((l) => l.exchangeRate === null);
  if (needsRate) {
    const rateDate = parsed.saleDate ?? parsed.issueDate ?? invoice.issueDate;
    invoiceRate = rateDate ? await deps.nbpRate(currency, rateDate) : null;
  }

  const issueDate = parsed.issueDate ?? invoice.issueDate;
  const ctx = {
    invoiceId: invoice.id,
    direction: invoice.direction,
    currency,
    invoiceRate,
    issueDate,
    companyId: invoice.companyId,
  };
  await deps.store.replaceLines(invoice.id, parsed.lines.map((line) => lineRecord(line, ctx)));

  const linesPln = parsed.lines.map((line) => lineNetPln(line, ctx));
  const netPln = linesPln.every((v): v is number => v !== null) ? sumMicros(linesPln) : null;

  const correctedKsefNumber = parsed.correctedKsefNumbers[0] ?? null;
  const correctedInvoiceId = correctedKsefNumber
    ? await deps.store.findInvoiceIdByKsefNumber(correctedKsefNumber)
    : null;

  // XML w polu plikowym jest dodatkiem – jego błąd nie blokuje importu pozycji
  let xmlFile: { fileId: string; label: string }[] | undefined;
  let xmlError: string | null = null;
  if (options.uploadXml) {
    try {
      xmlFile = [await deps.store.uploadXml(xml, `${invoice.ksefNumber}.xml`)];
    } catch (e) {
      xmlError = `Nie zapisano pliku XML: ${errorMessage(e)}`;
    }
  }

  const { payment } = parsed;
  const due = resolveDueDate(payment, {
    issueDate,
    saleDate: parsed.saleDate,
    receivedDate: invoice.permanentStorageDate?.slice(0, 10) ?? null,
  });

  // Status płatności z XML tylko podnosimy (zapłacono przy wystawieniu); nigdy nie cofamy statusu
  // ustawionego ręcznie albo z wyciągu bankowego.
  const xmlStatus = payment.paidInFull
    ? PAYMENT_STATUS.PAID
    : payment.partialPaidMicros
      ? PAYMENT_STATUS.PARTIAL
      : null;
  const paymentUpdate: InvoiceUpdate =
    xmlStatus && invoice.paymentStatus !== PAYMENT_STATUS.PAID
      ? {
          paymentStatus: xmlStatus,
          paidAt: payment.paidAt,
          paidAmount:
            xmlStatus === PAYMENT_STATUS.PAID && invoice.grossAmount
              ? invoice.grossAmount
              : payment.partialPaidMicros !== null
                ? { amountMicros: payment.partialPaidMicros, currencyCode: currency }
                : null,
        }
      : {};

  const update: InvoiceUpdate = {
    saleDate: parsed.saleDate,
    exchangeRate: currency === 'PLN' ? null : invoiceRate,
    ...(parsed.lines.length > 0 && netPln !== null
      ? { netAmountPln: { amountMicros: netPln, currencyCode: 'PLN' } }
      : {}),
    correctedKsefNumber,
    correctedInvoiceId,
    ...(xmlFile ? { xmlFile } : {}),
    dueDate: due?.dueDate ?? null,
    dueDateSource: due?.source ?? null,
    paymentMethod: payment.method,
    bankAccount: payment.bankAccount,
    ksefPaymentId: payment.ksefPaymentId,
    ...paymentUpdate,
    syncStatus: SYNC_STATUS.COMPLETE,
    ...(options.uploadXml ? { syncError: xmlError } : {}),
  };
  await deps.store.updateInvoice(invoice.id, update);
  return update;
};
