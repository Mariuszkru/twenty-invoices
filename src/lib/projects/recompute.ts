import {
  clientIssue,
  clientName,
  CLIENT_REJECTED_NOTE,
  computeMargin,
  defaultEntryType,
  entryAmountPln,
  lineAllocation,
  rejectedClientChange,
  remainingLineAmount,
} from 'src/lib/projects/margin';
import type { EntryUpdate, ProjectStore, StoredEntry } from 'src/lib/projects/store';

// Przeliczenia po zmianach w CRM. Każdy krok czyta stan od nowa, więc powtórzone albo przestawione zdarzenia
// dają ten sam wynik (idempotencja).

type EntryRef = { projectId?: string | null; invoiceLineId?: string | null };
type ProjectRef = { id?: string; companyId?: string | null; personId?: string | null };

const joinIssues = (issues: (string | null)[]) => issues.filter(Boolean).join(' ') || null;

// Uzupełnia puste pola przypisania (typ, kwota, nazwa, faktura) i przelicza kwotę na PLN.
export const completeEntry = async (store: ProjectStore, entryId: string): Promise<void> => {
  const entry = await store.getEntry(entryId);
  if (!entry) return;
  const line = entry.invoiceLineId ? await store.getLine(entry.invoiceLineId) : null;
  const data: EntryUpdate = {};

  if (line) {
    if (!entry.type) data.type = defaultEntryType(line.direction);
    if (!entry.amount) {
      const others = (await store.listLineEntries(line.id)).filter((e) => e.id !== entry.id);
      data.amount = remainingLineAmount(line, others);
    }
    if (entry.invoiceId !== line.invoiceId) data.invoiceId = line.invoiceId;
    if (!entry.name) data.name = [line.name, line.invoiceName].filter(Boolean).join(' · ') || null;
  } else if (entry.invoiceId) {
    data.invoiceId = null;
  }

  const conversion = entryAmountPln(data.amount ?? entry.amount, line);
  data.amountPln = conversion.amountPln;
  // uwagi pozycji przypiętej do faktury ustala refreshLine (zna też sumę przypisań pozycji)
  if (!line) data.issue = conversion.issue;
  await store.updateEntry(entryId, data);
};

// Status przypisania pozycji faktury i uwagi wszystkich jej przypisań (kurs, przekroczenie wartości).
export const refreshLine = async (store: ProjectStore, lineId: string): Promise<void> => {
  const line = await store.getLine(lineId);
  if (!line) return;
  const entries = await store.listLineEntries(lineId);
  const { status, overIssue } = lineAllocation(line, entries);
  await store.updateLineAllocationStatus(lineId, status);
  for (const entry of entries) {
    const issue = joinIssues([entryAmountPln(entry.amount, line).issue, overIssue]);
    if (issue !== entry.issue) await store.updateEntry(entry.id, { issue });
  }
};

const entryIssueSummary = (entries: StoredEntry[]) => {
  const withIssues = entries.filter((e) => e.issue).length;
  return withIssues ? `Pozycje z uwagami: ${withIssues} – sprawdź kolumnę "Uwaga".` : null;
};

// Klient, przychód, koszt i marża projektu liczone od zera z jego pozycji.
export const refreshProject = async (store: ProjectStore, projectId: string, notes: string[] = []): Promise<void> => {
  const project = await store.getProject(projectId);
  if (!project) return;
  const entries = await store.listProjectEntries(projectId);
  const { revenuePln, costPln, marginPln, marginPercent } = computeMargin(entries);
  await store.updateProject(projectId, {
    clientName: clientName(project),
    revenuePln,
    costPln,
    marginPln,
    marginPercent,
    issues: joinIssues([...notes, clientIssue(project), entryIssueSummary(entries)]),
  });
};

// Przypisanie dodane, zmienione albo usunięte: przelicza jego pozycję faktury i projekty sprzed i po zmianie.
export const onEntryChanged = async (
  store: ProjectStore,
  entryId: string,
  before: EntryRef | null,
  after: EntryRef | null,
): Promise<void> => {
  if (after) await completeEntry(store, entryId);
  const ids = (key: keyof EntryRef) => [...new Set([before?.[key], after?.[key]].filter((id): id is string => !!id))];
  for (const lineId of ids('invoiceLineId')) await refreshLine(store, lineId);
  for (const projectId of ids('projectId')) await refreshProject(store, projectId);
};

// Projekt utworzony albo zmieniony: odrzuca klienta "firma i osoba naraz" i odświeża pola wyliczane.
export const onProjectChanged = async (
  store: ProjectStore,
  projectId: string,
  before: ProjectRef | null,
  after: ProjectRef,
): Promise<{ rejected: boolean }> => {
  const revert = rejectedClientChange(
    before ? { companyId: before.companyId ?? null, personId: before.personId ?? null } : null,
    { companyId: after.companyId ?? null, personId: after.personId ?? null },
  );
  if (revert) await store.updateProject(projectId, revert);
  await refreshProject(store, projectId, revert ? [CLIENT_REJECTED_NOTE] : []);
  return { rejected: !!revert };
};
