import { useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  closeSidePanel,
  enqueueSnackbar,
  useSelectedObjectMetadata,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';
import { Button } from 'twenty-ui/primitives/input';
import { useTheme } from 'twenty-ui/theme';

import { ID } from 'src/constants/ids';
import { ENTRY_TYPE_OPTIONS, PROJECT_STATUS_OPTIONS } from 'src/constants/options';
import { toMicros } from 'src/lib/decimal';

type Candidate = {
  id: string;
  name: string | null;
  invoiceName: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
  direction: string | null;
  currencyCode: string;
  netMicros: number;
  remainingMicros: number;
  defaultType: string | null;
  projectNames: string[];
};

type Project = { id: string; name: string | null; clientName: string | null; status: string | null };

type Context = { ok: boolean; message?: string; projects?: Project[]; candidates?: Candidate[] };

// zaznaczona pozycja: kwota (tekst, z przecinkiem) i dane do wyświetlenia także po zmianie wyszukiwania;
// typ (przychód/koszt) wynika z kierunku faktury i nie jest edytowalny
type Selection = { amount: string; candidate: Candidate };

const typeLabel = (type: string | null) => ENTRY_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type ?? '';

const SEARCH_DELAY_MS = 400;

const money = (micros: number, currency: string) =>
  `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(micros / 1_000_000)} ${currency}`;

const toInput = (micros: number) => (micros / 1_000_000).toFixed(2).replace('.', ',');

const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');

const statusLabel = (status: string | null) => PROJECT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? '';

// Panel boczny: wybór projektu i wielu pozycji faktur naraz. Wyszukiwanie po numerze faktury, kontrahencie albo nazwie pozycji;
// bez frazy lista pokazuje ostatnie pozycje jeszcze nie w pełni przypisane.
const ProjectPin = () => {
  const theme = useTheme();
  const selectedIds = useSelectedRecordIds();
  const selectedObject = useSelectedObjectMetadata();
  // otwarty z karty projektu: projekt już wybrany
  const contextProjectId = selectedObject?.nameSingular === 'project' && selectedIds.length === 1 ? selectedIds[0] : '';
  const [projectId, setProjectId] = useState(contextProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setProjectId((current) => current || contextProjectId), [contextProjectId]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      new RestApiClient()
        .get<Context>('/s/projects/pin-context', { query: query.trim() ? { query: query.trim() } : {} })
        .then((result) => {
          if (!result.ok) {
            setError(result.message ?? 'Nie udało się wczytać pozycji.');
            return;
          }
          setError(null);
          setProjects(result.projects ?? []);
          setCandidates(result.candidates ?? []);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, query.trim() ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [query]);

  // zaznaczone zostają na górze listy także wtedy, gdy nie pasują do nowego wyszukiwania
  const visible = useMemo(() => {
    const pinned = Object.values(selected).map((s) => s.candidate);
    return [...pinned, ...candidates.filter((c) => !selected[c.id])];
  }, [candidates, selected]);

  const toggle = (candidate: Candidate) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[candidate.id]) {
        delete next[candidate.id];
      } else {
        next[candidate.id] = { amount: toInput(candidate.remainingMicros), candidate };
      }
      return next;
    });
  };

  const update = (id: string, patch: Partial<Selection>) =>
    setSelected((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const count = Object.keys(selected).length;
  const totals = useMemo(() => {
    const sums = new Map<string, number>();
    for (const s of Object.values(selected)) {
      const key = `${s.candidate.defaultType}|${s.candidate.currencyCode}`;
      sums.set(key, (sums.get(key) ?? 0) + (toMicros(s.amount) ?? 0));
    }
    return [...sums].map(([key, micros]) => {
      const [type, currency] = key.split('|');
      return `${typeLabel(type)}: ${money(micros, currency)}`;
    });
  }, [selected]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(selected).map(([lineId, s]) => ({
        lineId,
        amountMicros: toMicros(s.amount) ?? Number.NaN,
      }));
      const result = await new RestApiClient().post<{ ok: boolean; message?: string; created?: number }>(
        '/s/projects/pin',
        { projectId, items, note },
      );
      if (!result.ok) {
        setError(result.message ?? 'Nie udało się przypiąć pozycji.');
        return;
      }
      const project = projects.find((p) => p.id === projectId);
      await enqueueSnackbar({
        message: `Przypięto ${result.created} poz. do projektu ${project?.name ?? ''}.`.trim(),
        variant: 'success',
      });
      await closeSidePanel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const box = {
    padding: theme.spacing[2],
    border: `1px solid ${theme.border.color.medium}`,
    borderRadius: theme.border.radius.md,
    background: theme.background.secondary,
  };
  const muted = { color: theme.font.color.tertiary, fontSize: theme.font.size.sm };
  const input = {
    padding: `${theme.spacing[1]} ${theme.spacing[2]}`,
    border: `1px solid ${theme.border.color.medium}`,
    borderRadius: theme.border.radius.sm,
    background: theme.background.primary,
    color: theme.font.color.primary,
    fontFamily: theme.font.family,
    fontSize: theme.font.size.md,
  };
  const full = { ...input, width: '100%', boxSizing: 'border-box' as const };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing[3],
        padding: theme.spacing[4],
        fontFamily: theme.font.family,
        fontSize: theme.font.size.md,
        color: theme.font.color.primary,
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[1] }}>
        <span style={muted}>Projekt</span>
        <select value={projectId} disabled={busy} onChange={(e) => setProjectId(e.target.value)} style={full}>
          <option value="">Wybierz projekt</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {[p.name ?? 'bez nazwy', p.clientName, statusLabel(p.status)].filter(Boolean).join(' · ')}
            </option>
          ))}
        </select>
      </label>

      <input
        value={query}
        placeholder="Szukaj po numerze faktury, kontrahencie albo pozycji (np. FV 34, WAMAR, kabel)"
        onChange={(e) => setQuery(e.target.value)}
        style={full}
      />
      <div style={muted}>
        {query.trim()
          ? loading
            ? 'Szukam…'
            : `Pozycje pasujące do „${query.trim()}” (faktura, kontrahent albo nazwa pozycji).`
          : 'Ostatnie pozycje jeszcze nie w pełni przypisane do projektów.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
        {!loading && visible.length === 0 && <div style={muted}>Brak pozycji.</div>}
        {visible.map((c) => {
          const s = selected[c.id];
          // bez kierunku faktury nie wiadomo, czy to przychód czy koszt
          const done = c.remainingMicros === 0 || !c.defaultType;
          return (
            <div
              key={c.id}
              style={{
                ...box,
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing[1],
                borderColor: s ? theme.color.blue : theme.border.color.medium,
                opacity: done && !s ? 0.6 : 1,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing[2], cursor: 'pointer' }}>
                <input type="checkbox" checked={!!s} disabled={busy || (done && !s)} onChange={() => toggle(c)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: theme.font.weight.medium, wordBreak: 'break-word' }}>{c.name ?? 'Pozycja'}</div>
                  <div style={{ ...muted, wordBreak: 'break-word' }}>
                    {c.invoiceName ?? '—'} · {c.counterpartyName ?? '—'} · {formatDate(c.issueDate)}
                  </div>
                  <div style={muted}>
                    {typeLabel(c.defaultType) || 'nieznany kierunek'} · netto {money(c.netMicros, c.currencyCode)} · zostało {money(c.remainingMicros, c.currencyCode)}
                    {c.projectNames.length > 0 && ` · w projektach: ${c.projectNames.join(', ')}`}
                  </div>
                </div>
              </label>
              {s && (
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], paddingLeft: theme.spacing[6] }}>
                  <span style={{ ...muted, flex: 1 }}>Kwota do przypięcia ({c.currencyCode})</span>
                  <input
                    value={s.amount}
                    inputMode="decimal"
                    disabled={busy}
                    onChange={(e) => update(c.id, { amount: e.target.value })}
                    style={{ ...input, width: 110, textAlign: 'right' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {count > 0 && (
        <input
          value={note}
          placeholder="Notatka do przypisań (opcjonalnie)"
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          style={full}
        />
      )}

      {count > 0 && (
        <div style={muted}>
          Zaznaczono {count} poz. · {totals.join(' · ')}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: theme.spacing[2],
            borderRadius: theme.border.radius.sm,
            background: theme.background.transparent.danger,
            color: theme.font.color.danger,
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[2] }}>
        <Button variant="solid" color="accent" loading={busy} disabled={busy || !projectId || count === 0} onClick={save}>
          Przypnij do projektu
        </Button>
        <Button variant="ghost" color="neutral" disabled={busy || count === 0} onClick={() => setSelected({})}>
          Wyczyść
        </Button>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ID.fcProjectPin,
  name: 'project-pin',
  description: 'Przypięcie wielu pozycji faktur do projektu jako przychód albo koszt.',
  component: ProjectPin,
});
