import { DIRECTION, PAYMENT_STATUS, SYNC_STATUS, type Direction } from 'src/constants/options';
import { convertMicros, toMicros } from 'src/lib/decimal';
import type { ParsedLine } from 'src/lib/ksef/fa3-parser';
import type { KsefInvoiceMetadata } from 'src/lib/ksef/invoices';

export type Currency = { amountMicros: number; currencyCode: string };

const money = (micros: number | null, currencyCode: string): Currency | null =>
  micros === null ? null : { amountMicros: micros, currencyCode };

// "KorZal" -> "KOR_ZAL", "VatPefSp" -> "VAT_PEF_SP"
export const toInvoiceTypeValue = (ksefType: string): string =>
  ksefType.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

export const counterpartyOf = (meta: KsefInvoiceMetadata, direction: Direction) => {
  if (direction === DIRECTION.SALE) {
    const { identifier, name } = meta.buyer;
    return {
      taxId: identifier.value ?? null,
      nip: identifier.type === 'Nip' ? (identifier.value ?? null) : null,
      name: name ?? null,
    };
  }
  return { taxId: meta.seller.nip, nip: meta.seller.nip, name: meta.seller.name ?? null };
};

// Nagłówek zapisywany od razu z metadanych; pozycje dochodzą po pobraniu XML (status PENDING -> COMPLETE).
export const invoiceFromMetadata = (
  meta: KsefInvoiceMetadata,
  direction: Direction,
  companyId: string | null,
) => {
  const counterparty = counterpartyOf(meta, direction);
  const net = toMicros(meta.netAmount);
  return {
    name: meta.invoiceNumber,
    ksefNumber: meta.ksefNumber,
    direction,
    invoiceType: toInvoiceTypeValue(meta.invoiceType),
    issueDate: meta.issueDate,
    permanentStorageDate: meta.permanentStorageDate,
    netAmount: money(net, meta.currency),
    vatAmount: money(toMicros(meta.vatAmount), 'PLN'),
    grossAmount: money(toMicros(meta.grossAmount), meta.currency),
    netAmountPln: meta.currency === 'PLN' ? money(net, 'PLN') : null,
    counterpartyTaxId: counterparty.taxId,
    counterpartyName: counterparty.name,
    companyId,
    syncStatus: SYNC_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.UNPAID as string,
  };
};

export type LineContext = {
  invoiceId: string;
  direction: Direction;
  currency: string;
  // kurs z nagłówka faktury albo NBP; kurs z wiersza ma pierwszeństwo
  invoiceRate: number | null;
  issueDate: string | null;
  companyId: string | null;
};

// Netto pozycji w PLN ze znakiem korekty (bez znaku kierunku). null = brak kursu dla waluty obcej.
export const lineNetPln = (line: ParsedLine, ctx: LineContext): number | null => {
  const correctionSign = line.isBeforeCorrection ? -1 : 1;
  if (ctx.currency === 'PLN') return line.netMicros * correctionSign;
  const rate = line.exchangeRate ?? ctx.invoiceRate;
  return rate === null ? null : convertMicros(line.netMicros, rate) * correctionSign;
};

export const lineRecord = (line: ParsedLine, ctx: LineContext) => {
  const netPln = lineNetPln(line, ctx);
  const directionSign = ctx.direction === DIRECTION.SALE ? 1 : -1;
  return {
    name: line.name ?? `Pozycja ${line.lineNo ?? ''}`.trim(),
    invoiceId: ctx.invoiceId,
    direction: ctx.direction,
    lineNo: line.lineNo,
    unit: line.unit,
    quantity: line.quantity,
    unitNetPrice: money(line.unitNetPriceMicros, ctx.currency),
    netAmount: money(line.netMicros, ctx.currency),
    grossAmount: money(line.grossMicros, ctx.currency),
    vatRate: line.vatRate,
    gtin: line.gtin,
    pkwiu: line.pkwiu,
    productCode: line.productCode,
    lineUuid: line.uuid,
    isBeforeCorrection: line.isBeforeCorrection,
    // 0 * -1 daje -0, które GraphQL serializuje jako "-0"
    marginEffectPln: money(netPln === null ? null : netPln * directionSign || 0, 'PLN'),
    issueDate: ctx.issueDate,
    companyId: ctx.companyId,
  };
};

export type LineRecord = ReturnType<typeof lineRecord>;
export type InvoiceRecord = ReturnType<typeof invoiceFromMetadata>;
