import { useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';
import { IconCreditCard, IconExternalLink, IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { useTheme } from 'twenty-ui/theme';

import { ID } from 'src/constants/ids';

type LastRun = {
  ok: boolean;
  skipped?: string;
  finishedAt: string;
  created: number;
  matched: number;
  unmatched: number;
  message?: string;
};

type Status = {
  configured: boolean;
  message?: string;
  aspsp?: string;
  connected?: boolean;
  validUntil?: string | null;
  accounts?: string[];
  lastRun: LastRun | null;
};

type ConnectResponse = { ok: boolean; url?: string; validUntil?: string; message?: string };

const formatDate = (iso: string) => new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

const lastRunText = (run: LastRun) =>
  run.ok
    ? `${formatDate(run.finishedAt)}: nowe ${run.created}, dopasowane ${run.matched}, nieprzypisane ${run.unmatched}`
    : `${formatDate(run.finishedAt)}: ${run.message ?? 'błąd'}`;

// Panel boczny połączenia z bankiem: stan zgody PSD2, adres autoryzacji w banku i ręczne pobranie wyciągu.
const BankConnect = () => {
  const theme = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setStatus(await new RestApiClient().get<Status>('/s/bank/status'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const connect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const result = await new RestApiClient().post<ConnectResponse>('/s/bank/connect', {});
      if (!result.ok || !result.url) setError(result.message ?? 'Nie udało się rozpocząć autoryzacji.');
      else setAuthUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    setError(null);
    try {
      const result = await new RestApiClient().post<Partial<LastRun> & { ok: boolean; message?: string }>('/s/bank/sync', {});
      if (!result.ok) {
        setError(result.message ?? 'Nie udało się pobrać wyciągu.');
      } else {
        await enqueueSnackbar({
          message: `Wyciąg pobrany: nowe ${result.created ?? 0}, dopasowane ${result.matched ?? 0}, nieprzypisane ${result.unmatched ?? 0}.`,
          variant: 'success',
        });
      }
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const box = {
    padding: theme.spacing[3],
    border: `1px solid ${theme.border.color.medium}`,
    borderRadius: theme.border.radius.md,
    background: theme.background.secondary,
  };
  const label = { color: theme.font.color.tertiary, fontSize: theme.font.size.sm };

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
      <div style={{ ...box, color: theme.font.color.secondary, lineHeight: 1.5 }}>
        Wyciąg z rachunku firmowego jest pobierany przez Enable Banking codziennie rano. Wpływy są dopasowywane do faktur
        sprzedaży, wydatki do faktur zakupowych, a pewne dopasowania od razu oznaczają fakturę jako zapłaconą. Zgoda banku
        (PSD2) wygasa najpóźniej po 180 dniach i trzeba ją wtedy odnowić.
      </div>

      {status && (
        <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          {!status.configured ? (
            <div style={{ color: theme.font.color.danger }}>{status.message}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2] }}>
                <IconCreditCard size={18} color={theme.font.color.secondary} />
                <span style={{ fontWeight: theme.font.weight.medium }}>{status.aspsp}</span>
                <span style={{ color: status.connected ? theme.color.green : theme.font.color.danger }}>
                  {status.connected ? '· połączono' : '· brak zgody'}
                </span>
              </div>
              {status.validUntil && (
                <div>
                  <span style={label}>Zgoda ważna do </span>
                  {formatDate(status.validUntil)}
                </div>
              )}
              {!!status.accounts?.length && (
                <div style={{ wordBreak: 'break-all' }}>
                  <span style={label}>Rachunki: </span>
                  {status.accounts.join(', ')}
                </div>
              )}
              {status.lastRun && (
                <div>
                  <span style={label}>Ostatnie pobranie: </span>
                  {lastRunText(status.lastRun)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {authUrl && (
        <div style={{ ...box, borderColor: theme.color.blue, display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
          <div>Otwórz stronę banku, zaloguj się i zatwierdź dostęp do rachunku firmowego. Link jest ważny 15 minut.</div>
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: theme.spacing[1], color: theme.color.blue, fontWeight: theme.font.weight.medium }}
          >
            Przejdź do banku <IconExternalLink size={14} />
          </a>
          <div style={label}>Po powrocie z banku odśwież ten panel.</div>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[2] }}>
        <Button
          variant="solid"
          color="accent"
          disabled={!status?.configured || busy !== null}
          loading={busy === 'connect'}
          onClick={connect}
        >
          {status?.connected ? 'Odnów zgodę' : 'Połącz z bankiem'}
        </Button>
        <Button
          variant="outline"
          color="neutral"
          disabled={!status?.connected || busy !== null}
          loading={busy === 'sync'}
          onClick={syncNow}
        >
          Pobierz teraz
        </Button>
        <Button variant="ghost" color="neutral" startIcon={<IconRefresh size={14} />} disabled={busy !== null} onClick={loadStatus}>
          Odśwież
        </Button>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ID.fcBankConnect,
  name: 'bank-connect',
  description: 'Połączenie z bankiem przez Enable Banking i ręczne pobranie wyciągu.',
  component: BankConnect,
});
