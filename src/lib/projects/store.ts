import type { EntryType } from 'src/constants/options';
import type { Currency } from 'src/lib/sync/mapping';

// Dostęp do projektów i pozycji projektów. Implementacja Twenty w twenty-project-store.ts, w testach – pamięciowa.

export type StoredEntry = {
  id: string;
  name: string | null;
  projectId: string | null;
  invoiceLineId: string | null;
  invoiceId: string | null;
  type: EntryType | null;
  amount: Currency | null;
  amountPln: Currency | null;
  issue: string | null;
};

export type EntryUpdate = Partial<Pick<StoredEntry, 'name' | 'invoiceId' | 'type' | 'amount' | 'amountPln' | 'issue'>>;

export type StoredLine = {
  id: string;
  name: string | null;
  invoiceId: string | null;
  invoiceName: string | null;
  direction: string | null;
  netAmount: Currency | null;
  isBeforeCorrection: boolean;
  marginEffectPln: Currency | null;
};

export type StoredProject = {
  id: string;
  companyId: string | null;
  personId: string | null;
  companyName: string | null;
  personName: string | null;
};

export type ProjectUpdate = {
  companyId?: string | null;
  personId?: string | null;
  clientName?: string | null;
  revenuePln?: Currency | null;
  costPln?: Currency | null;
  marginPln?: Currency | null;
  marginPercent?: number | null;
  issues?: string | null;
};

export type ProjectOption = { id: string; name: string | null; clientName: string | null; status: string | null };

// Pozycja faktury do wyboru w panelu "Przypnij pozycje faktur".
export type CandidateLine = StoredLine & { counterpartyName: string | null; issueDate: string | null };

export type NewEntry = {
  projectId: string;
  invoiceLineId: string;
  type: EntryType;
  amount: Currency;
  note: string | null;
};

export type ProjectStore = {
  listProjects: () => Promise<ProjectOption[]>;
  // query = numer faktury albo nazwa kontrahenta; null = ostatnie pozycje jeszcze nie w pełni przypisane
  searchLines: (query: string | null) => Promise<CandidateLine[]>;
  // przypisania wielu pozycji naraz (sumy w panelu)
  listEntriesForLines: (lineIds: string[]) => Promise<StoredEntry[]>;
  createEntry: (data: NewEntry) => Promise<string>;
  getEntry: (id: string) => Promise<StoredEntry | null>;
  listProjectEntries: (projectId: string) => Promise<StoredEntry[]>;
  listLineEntries: (lineId: string) => Promise<StoredEntry[]>;
  updateEntry: (id: string, data: EntryUpdate) => Promise<void>;
  getLine: (id: string) => Promise<StoredLine | null>;
  updateLineAllocationStatus: (id: string, status: string) => Promise<void>;
  getProject: (id: string) => Promise<StoredProject | null>;
  updateProject: (id: string, data: ProjectUpdate) => Promise<void>;
};
