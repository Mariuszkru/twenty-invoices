import { useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar } from 'twenty-sdk/front-component';

import { ID } from 'src/constants/ids';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, fontSize: 13 }}>
      <div>
        Plik z fakturami sprzedaży B2C wystawionymi poza KSeF: eksport tekstowy Symfonii (.txt, z nazwami pozycji)
        albo XML z enova. Plik może zawierać wiele faktur; faktury już zaimportowane zostaną zaktualizowane.
      </div>
      <input
        type="file"
        accept=".txt,.xml,text/plain,text/xml,application/xml"
        disabled={busy}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button type="button" disabled={!file || busy} onClick={submit} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Importuję…' : 'Importuj'}
      </button>
      {error && <div style={{ color: '#d6334a' }}>{error}</div>}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: ID.fcImportXml,
  name: 'import-xml',
  description: 'Import faktur B2C spoza KSeF z pliku programu księgowego (Symfonia, enova).',
  component: ImportXml,
});
