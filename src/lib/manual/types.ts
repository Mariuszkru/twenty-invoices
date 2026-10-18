// Wspólny model faktury z ręcznego importu (pliki z programów księgowych). Kwoty w micros.

export class ManualImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualImportError';
  }
}

export type ManualLine = {
  // null, gdy format nie podaje nazwy pozycji (np. rejestr VAT z enova)
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unitNetPriceMicros: number | null;
  vatRate: string | null;
  netMicros: number;
  vatMicros: number;
  // kwoty w PLN; dla faktur w PLN równe kwotom dokumentu
  netPlnMicros: number;
  vatPlnMicros: number;
};

export type ManualInvoice = {
  number: string;
  issueDate: string | null;
  saleDate: string | null;
  dueDate: string | null;
  isCorrection: boolean;
  correctedNumber: string | null;
  currency: string;
  buyerName: string | null;
  buyerTaxId: string | null;
  paymentMethod: string | null;
  description: string | null;
  lines: ManualLine[];
};
