import { useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar } from 'twenty-sdk/front-component';
import { IconFileText, IconUpload, IconX } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { useTheme } from 'twenty-ui/theme';

import { ID } from 'src/constants/ids';

const ACCEPTED_EXTENSIONS = ['.txt', '.xml'];

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type ImportResponse = {
  ok: boolean;
  message?: string;
  created?: string[];
  updated?: string[];
  failed?: { number: string; error: string }[];
  linkedToPerson?: number;
};

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const summary = (r: ImportResponse) =>
  [
    `Zaimportowano: ${r.created?.length ?? 0}`,
    `powiązano z osobą: ${r.linkedToPerson ?? 0}`,
    r.updated?.length ? `zaktualizowano (już były w CRM): ${r.updated.length}` : null,
    r.failed?.length ? `błędy: ${r.failed.map((f) => `${f.number} – ${f.error}`).join('; ')}` : null,
  ]
    .filter(Boolean)
    .join(', ');

// Panel boczny z wyborem pliku z programu księgowego (paczka faktur B2C spoza KSeF).
const ImportXml = () => {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const theme = useTheme();

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await new RestApiClient().post<ImportResponse>('/s/ksef/import-xml', {
        fileName: file.name,
        contentBase64: toBase64(await file.arrayBuffer()),
      });
      if (!result.ok) {
        setError(result.message ?? 'Import nieudany.');
        return;
      }
      await enqueueSnackbar({
        message: summary(result),
        variant: result.failed?.length ? 'warning' : 'success',
      });
      await closeSidePanel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Sandbox nie przekazuje dataTransfer w zdarzeniach drag, więc strefę zrzutu tworzy niewidoczny,
  // natywny <input type="file"> rozciągnięty na całą ramkę: przeglądarka sama przyjmuje upuszczony plik
  // i zgłasza go przez onChange. Zdarzenia dragenter/dragleave służą tylko do podświetlenia ramki.
  const pick = (picked: File | null) => {
    setDragging(false);
    setError(null);
    if (picked && !ACCEPTED_EXTENSIONS.some((ext) => picked.name.toLowerCase().endsWith(ext))) {
      setFile(null);
      setError('Nieobsługiwany typ pliku. Wybierz plik .txt (Symfonia) albo .xml (enova).');
      return;
    }
    setFile(picked);
  };

  const zoneBorder = error
    ? theme.border.color.danger
    : dragging
      ? theme.color.blue
      : theme.border.color.strong;

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
      <div
        style={{
          padding: theme.spacing[3],
          border: `1px solid ${theme.border.color.medium}`,
          borderRadius: theme.border.radius.md,
          background: theme.background.secondary,
          color: theme.font.color.secondary,
          lineHeight: 1.5,
        }}
      >
        Plik z fakturami sprzedaży B2C wystawionymi poza KSeF: eksport tekstowy Symfonii (.txt, z nazwami pozycji)
        albo XML z enova. Plik może zawierać wiele faktur; faktury już zaimportowane zostaną zaktualizowane.
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[2],
          minHeight: 140,
          padding: theme.spacing[4],
          border: `1px dashed ${zoneBorder}`,
          borderRadius: theme.border.radius.md,
          background: dragging ? theme.background.transparent.blue : theme.background.secondary,
          textAlign: 'center',
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        {file ? (
          <>
            <IconFileText size={28} color={theme.font.color.secondary} />
            <div style={{ fontWeight: theme.font.weight.medium, wordBreak: 'break-all' }}>{file.name}</div>
            <div style={{ color: theme.font.color.tertiary, fontSize: theme.font.size.sm }}>
              {formatSize(file.size)} · kliknij lub upuść inny plik, aby zmienić
            </div>
          </>
        ) : (
          <>
            <IconUpload size={28} color={dragging ? theme.color.blue : theme.font.color.tertiary} />
            <div style={{ fontWeight: theme.font.weight.medium }}>
              {dragging ? 'Upuść plik tutaj' : 'Przeciągnij plik tutaj'}
            </div>
            <div style={{ color: theme.font.color.tertiary, fontSize: theme.font.size.sm }}>
              albo kliknij, aby wybrać · .txt, .xml
            </div>
          </>
        )}
        <input
          type="file"
          accept=".txt,.xml,text/plain,text/xml,application/xml"
          disabled={busy}
          title=""
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: busy ? 'default' : 'pointer',
          }}
        />
      </div>

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

      <div style={{ display: 'flex', gap: theme.spacing[2] }}>
        <Button variant="solid" color="accent" disabled={!file || busy} loading={busy} onClick={submit}>
          {busy ? 'Importuję…' : 'Importuj'}
        </Button>
        {file && !busy && (
          <Button variant="ghost" color="neutral" startIcon={<IconX size={14} />} onClick={() => pick(null)}>
            Usuń plik
          </Button>
        )}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ID.fcImportXml,
  name: 'import-xml',
  description: 'Import faktur B2C spoza KSeF z pliku programu księgowego (Symfonia, enova).',
  component: ImportXml,
});
