import type { EntryType } from 'src/constants/options';
import { defaultEntryType, formatMoney, lineAllocation, lineSignedNet, remainingLineAmount } from 'src/lib/projects/margin';
import { completeEntry, refreshLine, refreshProject } from 'src/lib/projects/recompute';
import type { ProjectOption, ProjectStore } from 'src/lib/projects/store';

// Panel "Przypnij pozycje faktur": wybór projektu i wielu pozycji faktur naraz, z wyszukiwaniem po numerze
// faktury, kontrahencie albo nazwie pozycji. Zapis aplikacji nie uruchamia triggera przypisań, więc przeliczamy tutaj.

export class PinError extends Error {}

export type PinCandidate = {
  id: string;
  name: string | null;
  invoiceName: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
  direction: string | null;
  currencyCode: string;
  netMicros: number;
  remainingMicros: number;
  defaultType: EntryType | null;
  // projekty, do których pozycja jest już przypięta
  projectNames: string[];
};

export type PinContext = { projects: ProjectOption[]; candidates: PinCandidate[] };

export const pinContext = async (store: ProjectStore, query: string | null): Promise<PinContext> => {
  const [projects, lines] = await Promise.all([store.listProjects(), store.searchLines(query?.trim() || null)]);
  const entries = await store.listEntriesForLines(lines.map((l) => l.id));
  const projectName = new Map(projects.map((p) => [p.id, p.name ?? 'bez nazwy']));

  const candidates = lines.flatMap((line): PinCandidate[] => {
    const net = lineSignedNet(line);
    if (!net) return [];
    const lineEntries = entries.filter((e) => e.invoiceLineId === line.id);
    return [
      {
        id: line.id,
        name: line.name,
        invoiceName: line.invoiceName,
        counterpartyName: line.counterpartyName,
        issueDate: line.issueDate,
        direction: line.direction,
        currencyCode: net.currencyCode,
        netMicros: net.amountMicros,
        remainingMicros: remainingLineAmount(line, lineEntries)?.amountMicros ?? 0,
        defaultType: defaultEntryType(line.direction),
        projectNames: [...new Set(lineEntries.flatMap((e) => (e.projectId ? [projectName.get(e.projectId) ?? '?'] : [])))],
      },
    ];
  });
  candidates.sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
  return { projects, candidates };
};

export type PinItem = { lineId: string; amountMicros?: number | null };

// Tworzy przypisania wybranych pozycji do projektu. Najpierw sprawdza wszystkie, więc błąd nie zostawia połowy zapisu.
export const pinLines = async (
  store: ProjectStore,
  projectId: string,
  items: PinItem[],
  note: string | null = null,
): Promise<{ created: number }> => {
  if (!(await store.getProject(projectId))) throw new PinError('Nie znaleziono projektu.');
  if (!items.length) throw new PinError('Zaznacz co najmniej jedną pozycję.');
  if (new Set(items.map((i) => i.lineId)).size !== items.length) throw new PinError('Pozycja zaznaczona dwa razy.');

  const planned = [];
  for (const item of items) {
    const line = await store.getLine(item.lineId);
    const net = line && lineSignedNet(line);
    if (!line || !net) throw new PinError('Nie znaleziono pozycji faktury albo nie ma ona kwoty netto.');
    const label = `${line.name ?? 'Pozycja'} (${line.invoiceName ?? 'faktura'})`;
    const existing = await store.listLineEntries(line.id);
    const amountMicros =
      item.amountMicros ?? remainingLineAmount(line, existing)?.amountMicros ?? 0;
    if (!Number.isFinite(amountMicros)) throw new PinError(`${label}: niepoprawna kwota.`);
    if (amountMicros === 0) throw new PinError(`${label}: kwota 0 – pozycja jest już w pełni przypisana.`);
    const amount = { amountMicros, currencyCode: net.currencyCode };
    const { overIssue } = lineAllocation(line, [...existing, { amount }]);
    if (overIssue) throw new PinError(`${label}: ${overIssue} Zostało ${formatMoney(remainingLineAmount(line, existing)!)}.`);
    // typ wynika z kierunku faktury i nie da się go zmienić w panelu
    const type = defaultEntryType(line.direction);
    if (!type) throw new PinError(`${label}: nieznany kierunek faktury, nie da się ustalić przychodu ani kosztu.`);
    planned.push({ projectId, invoiceLineId: line.id, type, amount, note });
  }

  const ids = [];
  for (const entry of planned) ids.push(await store.createEntry(entry));
  for (const id of ids) await completeEntry(store, id);
  for (const lineId of new Set(planned.map((p) => p.invoiceLineId))) await refreshLine(store, lineId);
  await refreshProject(store, projectId);
  return { created: ids.length };
};
