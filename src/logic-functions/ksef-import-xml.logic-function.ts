import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { importManualInvoices } from 'src/lib/manual/import-manual';
import { decodeImportFile, parseImportFile } from 'src/lib/manual/parse-file';
import { ManualImportError } from 'src/lib/manual/types';
import { errorMessage } from 'src/lib/sync/import-details';
import { createTwentyStore } from 'src/lib/sync/twenty-store';

type ImportBody = { fileName?: string; contentBase64?: string };

// Ręczny import faktur B2C spoza KSeF z pliku programu księgowego (XML z enova albo eksport tekstowy Symfonii).
// Plik przychodzi z front componentu jako base64; kodowanie i format rozpoznajemy po treści.
const handler = async (event: { body: object | null }) => {
  const { fileName, contentBase64 } = (event.body ?? {}) as ImportBody;
  if (!contentBase64) return { ok: false, message: 'Brak pliku.' };
  try {
    const { format, invoices } = parseImportFile(decodeImportFile(Buffer.from(contentBase64, 'base64')));
    const result = await importManualInvoices(createTwentyStore(), invoices);
    console.log(`[ksef-import-xml] ${JSON.stringify({ fileName, format, ...result })}`);
    return { ok: true, format, ...result };
  } catch (e) {
    if (e instanceof ManualImportError) return { ok: false, message: e.message };
    console.error(`[ksef-import-xml] ${fileName}: ${errorMessage(e)}`);
    return { ok: false, message: `Import nieudany: ${errorMessage(e)}` };
  }
};

export default defineLogicFunction({
  universalIdentifier: ID.fnImportXml,
  name: 'ksef-import-xml',
  description: 'Importuje faktury sprzedaży B2C spoza KSeF z pliku programu księgowego (enova XML, Symfonia).',
  timeoutSeconds: 120,
  httpRouteTriggerSettings: {
    path: '/ksef/import-xml',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler,
});
