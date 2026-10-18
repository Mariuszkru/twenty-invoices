import { parseEnovaXml } from 'src/lib/manual/enova-parser';
import { parseSymfoniaText } from 'src/lib/manual/symfonia-parser';
import { ManualImportError, type ManualInvoice } from 'src/lib/manual/types';

export type ImportFormat = 'ENOVA' | 'SYMFONIA';

// Kodowanie: deklaracja z nagłówka XML; bez niej UTF-8, a gdy plik nim nie jest – windows-1250 (Symfonia, Systim).
export const decodeImportFile = (bytes: Uint8Array): string => {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  try {
    if (declared) return new TextDecoder(declared.toLowerCase()).decode(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (declared) throw new ManualImportError(`Nieobsługiwane kodowanie pliku: ${declared}.`);
    return new TextDecoder('windows-1250').decode(bytes);
  }
};

// Format rozpoznajemy po treści, nie po rozszerzeniu: XML z enova albo tekstowy format Symfonii.
export const parseImportFile = (text: string): { format: ImportFormat; invoices: ManualInvoice[] } => {
  const start = text.replace(/^﻿/, '').trimStart();
  if (start.startsWith('<')) return { format: 'ENOVA', invoices: parseEnovaXml(start) };
  if (/^INFO\s*\{/.test(start)) return { format: 'SYMFONIA', invoices: parseSymfoniaText(start) };
  throw new ManualImportError('Nieznany format pliku. Obsługiwane: XML z enova i eksport tekstowy Symfonii.');
};
