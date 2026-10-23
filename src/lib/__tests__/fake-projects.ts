import { onEntryChanged } from 'src/lib/projects/recompute';
import type { CandidateLine, ProjectStore, StoredEntry, StoredProject } from 'src/lib/projects/store';

// Pamięciowy magazyn projektów dla testów: projekty, pozycje faktur i przypisania.

export const money = (amount: number, currencyCode = 'PLN') => ({ amountMicros: Math.round(amount * 1_000_000), currencyCode });

export const createMemoryProjectStore = (lines: CandidateLine[], projects: StoredProject[]) => {
  const entries: StoredEntry[] = [];
  const lineStatus = new Map<string, string>();
  const projectState = new Map<string, Record<string, unknown>>(projects.map((p) => [p.id, { ...p }]));
  let nextId = 0;

  const store: ProjectStore = {
    listProjects: async () =>
      [...projectState.values()].map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? null,
        clientName: (p.clientName as string) ?? null,
        status: (p.status as string) ?? null,
      })),
    searchLines: async (query) =>
      lines.filter((l) =>
        query
          ? `${l.invoiceName ?? ''} ${l.counterpartyName ?? ''}`.toLowerCase().includes(query.toLowerCase())
          : lineStatus.get(l.id) !== 'ASSIGNED',
      ),
    listEntriesForLines: async (lineIds) => entries.filter((e) => e.invoiceLineId && lineIds.includes(e.invoiceLineId)),
    createEntry: async (data) => {
      const id = `e${++nextId}`;
      entries.push({ id, name: null, invoiceId: null, amountPln: null, issue: null, ...data });
      return id;
    },
    getEntry: async (id) => entries.find((e) => e.id === id) ?? null,
    listProjectEntries: async (projectId) => entries.filter((e) => e.projectId === projectId),
    listLineEntries: async (lineId) => entries.filter((e) => e.invoiceLineId === lineId),
    updateEntry: async (id, data) => {
      Object.assign(entries.find((e) => e.id === id)!, data);
    },
    getLine: async (id) => lines.find((l) => l.id === id) ?? null,
    updateLineAllocationStatus: async (id, status) => {
      lineStatus.set(id, status);
    },
    getProject: async (id) => {
      const p = projectState.get(id);
      return p ? ({ ...p } as StoredProject) : null;
    },
    updateProject: async (id, data) => {
      Object.assign(projectState.get(id)!, data);
    },
  };

  // przypisanie zapisane przez osobę w CRM i zdarzenie, które po nim przychodzi
  const addEntry = async (data: Partial<StoredEntry>) => {
    const entry: StoredEntry = {
      id: `e${++nextId}`,
      name: null,
      projectId: null,
      invoiceLineId: null,
      invoiceId: null,
      type: null,
      amount: null,
      amountPln: null,
      issue: null,
      ...data,
    };
    entries.push(entry);
    await onEntryChanged(store, entry.id, null, entry);
    return entry;
  };
  const updateEntry = async (id: string, data: Partial<StoredEntry>) => {
    const entry = entries.find((e) => e.id === id)!;
    const before = { ...entry };
    Object.assign(entry, data);
    await onEntryChanged(store, id, before, entry);
  };
  const removeEntry = async (id: string) => {
    const index = entries.findIndex((e) => e.id === id);
    const [before] = entries.splice(index, 1);
    await onEntryChanged(store, id, before, null);
  };

  return { store, entries, lineStatus, project: (id: string) => projectState.get(id)!, addEntry, updateEntry, removeEntry };
};

export const line = (data: Partial<CandidateLine> & { id: string }): CandidateLine => ({
  name: 'Usługa',
  invoiceId: `inv-${data.id}`,
  invoiceName: `FV/${data.id}`,
  direction: 'SALE',
  netAmount: money(1000),
  isBeforeCorrection: false,
  marginEffectPln: money(1000),
  counterpartyName: 'Klient',
  issueDate: '2026-10-01',
  ...data,
});

export const project: StoredProject = { id: 'p1', companyId: 'c1', personId: null, companyName: 'ACME', personName: null };

