import { useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar, useSelectedRecordIds } from 'twenty-sdk/front-component';
import { Button } from 'twenty-ui/primitives/input';
import { useTheme } from 'twenty-ui/theme';

import { ID } from 'src/constants/ids';
import { toMicros } from 'src/lib/decimal';

type Candidate = {
  id: string;
  name: string | null;
  counterpartyName: string | null;
  issueDate: string | null;
  grossMicros: number;
  remainingMicros: number;
  allocatedMicros: number;
  sameCounterparty: boolean;
  alreadyPaid: boolean;
  sameAmount: boolean;
};

type Context = {
  ok: boolean;
  message?: string;
  transaction?: {
    id: string;
    name: string | null;
    bookingDate: string | null;
    direction: string;
    amount: { amountMicros: number; currencyCode: string };
    counterpartyName: string | null;
    remittanceInformation: string | null;
  };
  candidates?: Candidate[];
};

const money = (micros: number, currency: string) =>
  `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(micros / 1_000_000)} ${currency}`;

const toInput = (micros: number) => (micros / 1_000_000).toFixed(2).replace('.', ',');

const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');

// Panel boczny rozliczenia transakcji: wybór jednej albo kilku faktur (przelew zbiorczy) z kwotami.
const BankAllocate = () => {
  const theme = useTheme();
  const selectedIds = useSelectedRecordIds();
  // rozliczamy jedną transakcję naraz
  const transactionId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const [context, setContext] = useState<Context | null>(null);
  // kwota wpisana dla zaznaczonych faktur (tekst, z przecinkiem)
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    new RestApiClient()
      .get<Context>('/s/bank/allocation', { query: { transactionId } })
      .then((result) => {
        if (!result.ok) {
          setError(result.message ?? 'Nie udało się wczytać transakcji.');
          return;
        }
        setContext(result);
        setSelected(
          Object.fromEntries(
            (result.candidates ?? []).filter((c) => c.allocatedMicros > 0).map((c) => [c.id, toInput(c.allocatedMicros)]),
          ),
        );
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [transactionId]);

  const transaction = context?.transaction;
  const currency = transaction?.amount.currencyCode ?? 'PLN';
  const allocatedMicros = Object.values(selected).reduce((sum, value) => sum + (toMicros(value) ?? 0), 0);
  const leftMicros = (transaction?.amount.amountMicros ?? 0) - allocatedMicros;

  // faktury już rozliczone (status Zapłacona albo nic do zapłaty) chowamy, dopóki ich nie szukasz albo nie włączysz;
  // zapłaconą z kwotą równą transakcji pokazujemy zawsze – to zwykle faktura opłacona z góry tym przelewem
  const isSettled = (c: Candidate) => !c.sameAmount && (c.alreadyPaid || c.remainingMicros <= 0);
  const settledCount = (context?.candidates ?? []).filter((c) => isSettled(c) && selected[c.id] === undefined).length;

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (context?.candidates ?? []).filter((c) => {
      if (selected[c.id] !== undefined) return true;
      const matches = !query || `${c.name ?? ''} ${c.counterpartyName ?? ''}`.toLowerCase().includes(query);
      return matches && (showSettled || !!query || !isSettled(c));
    });
  }, [context, filter, selected, showSettled]);

  const toggle = (candidate: Candidate) =>
    setSelected((current) => {
      const next = { ...current };
      if (next[candidate.id] !== undefined) {
        delete next[candidate.id];
      } else {
        // podpowiedź: pozostała kwota faktury, ale nie więcej niż zostało z przelewu
        next[candidate.id] = toInput(Math.max(0, Math.min(candidate.remainingMicros, leftMicros)));
      }
      return next;
    });

  const save = async () => {
    if (!transactionId) return;
    setBusy(true);
    setError(null);
    try {
      const allocations = Object.entries(selected).map(([invoiceId, value]) => ({
        invoiceId,
        amountMicros: toMicros(value) ?? Number.NaN,
      }));
      const result = await new RestApiClient().post<{ ok: boolean; message?: string; allocations?: number }>(
        '/s/bank/allocate',
        { transactionId, allocations },
      );
      if (!result.ok) {
        setError(result.message ?? 'Nie udało się zapisać rozliczenia.');
        return;
      }
      await enqueueSnackbar({
        message: result.allocations ? `Zapisano rozliczenie: ${result.allocations} fakt.` : 'Usunięto rozliczenie transakcji.',
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
    padding: theme.spacing[3],
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing[4],
        padding: theme.spacing[4],
        fontFamily: theme.font.family,
        fontSize: theme.font.size.md,
        color: theme.font.color.primary,
      }}
    >
      {!transactionId && <div style={box}>Otwórz panel z karty transakcji bankowej albo zaznacz jedną transakcję.</div>}

      {transaction && (
        <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: theme.spacing[1] }}>
          <div style={{ fontWeight: theme.font.weight.medium, wordBreak: 'break-word' }}>
            {transaction.counterpartyName || (transaction.direction === 'CREDIT' ? 'Wpływ' : 'Wydatek')}
          </div>
          <div style={{ color: theme.font.color.secondary, wordBreak: 'break-word' }}>{transaction.remittanceInformation}</div>
          <div style={muted}>
            {formatDate(transaction.bookingDate)} · {transaction.direction === 'CREDIT' ? 'wpływ' : 'wydatek'} ·{' '}
            <span style={{ color: theme.font.color.primary, fontWeight: theme.font.weight.medium }}>
              {money(transaction.amount.amountMicros, currency)}
            </span>
          </div>
        </div>
      )}

      {transaction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[4] }}>
          <div>
            <div style={muted}>Rozliczono</div>
            {money(allocatedMicros, currency)}
          </div>
          <div>
            <div style={muted}>Pozostało</div>
            <span style={{ color: leftMicros < -10_000 ? theme.font.color.danger : theme.font.color.primary }}>
              {money(leftMicros, currency)}
            </span>
          </div>
        </div>
      )}

      {transaction && (
        <input
          value={filter}
          placeholder="Szukaj faktury po numerze albo kontrahencie"
          onChange={(e) => setFilter(e.target.value)}
          style={{ ...input, width: '100%', boxSizing: 'border-box' }}
        />
      )}

      {transaction && settledCount > 0 && (
        <label style={{ ...muted, display: 'flex', alignItems: 'center', gap: theme.spacing[2], cursor: 'pointer' }}>
          <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
          Pokaż faktury już zapłacone ({settledCount})
        </label>
      )}

      {transaction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {visible.length === 0 && (
            <div style={muted}>
              Brak otwartych faktur pasujących do transakcji.
              {settledCount > 0 && !showSettled ? ' Zaznacz „Pokaż faktury już zapłacone” albo wyszukaj numer.' : ''}
            </div>
          )}
          {visible.map((c) => {
            const checked = selected[c.id] !== undefined;
            return (
              <div
                key={c.id}
                style={{
                  ...box,
                  padding: theme.spacing[2],
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing[2],
                  borderColor: checked ? theme.color.blue : theme.border.color.medium,
                }}
              >
                <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(c)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: theme.font.weight.medium, wordBreak: 'break-word' }}>
                    {c.name ?? 'bez numeru'}
                    {c.sameAmount && <span style={{ ...muted, color: theme.color.blue }}> · ta sama kwota</span>}
                    {c.sameCounterparty && <span style={{ ...muted, color: theme.color.green }}> · ten kontrahent</span>}
                    {c.alreadyPaid && <span style={muted}> · zapłacona</span>}
                  </div>
                  <div style={{ ...muted, wordBreak: 'break-word' }}>
                    {c.counterpartyName ?? '—'} · {formatDate(c.issueDate)} ·{' '}
                    {c.alreadyPaid ? 'nierozliczone z wyciągu' : 'pozostało'} {money(c.remainingMicros, currency)}
                  </div>
                </div>
                {checked && (
                  <input
                    value={selected[c.id]}
                    inputMode="decimal"
                    disabled={busy}
                    onChange={(e) => setSelected((current) => ({ ...current, [c.id]: e.target.value }))}
                    style={{ ...input, width: 96, textAlign: 'right' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: theme.spacing[2],
            borderRadius: theme.border.radius.sm,
            background: theme.background.transparent.danger,
            color: theme.font.color.danger,
          }}
        >
          {error}
        </div>
      )}

      {transaction && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[2] }}>
          <Button variant="solid" color="accent" loading={busy} disabled={busy || leftMicros < -10_000} onClick={save}>
            Zapisz rozliczenie
          </Button>
          <Button variant="ghost" color="neutral" disabled={busy || Object.keys(selected).length === 0} onClick={() => setSelected({})}>
            Wyczyść
          </Button>
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ID.fcBankAllocate,
  name: 'bank-allocate',
  description: 'Rozliczenie transakcji bankowej z jedną albo kilkoma fakturami.',
  component: BankAllocate,
});
