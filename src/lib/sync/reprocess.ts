import { SYNC_STATUS } from 'src/constants/options';
import { errorMessage, importInvoiceDetails, type ImportDetailsDeps } from 'src/lib/sync/import-details';

// Ponowne przetworzenie XML zapisanego w CRM (pole xmlFile) – bez pobierania z KSeF i bez zużywania limitów.
// Uzupełnia pola dodane w nowszych wersjach parsera i poprawia pozycje. Faktury bez zapisanego XML
// wracają do statusu PENDING, więc synchronizacja pobierze je z KSeF ponownie.

export type ReprocessDeps = ImportDetailsDeps & {
  readXml: (url: string) => Promise<string>;
};

export type ReprocessResult = {
  processed: number;
  failed: number;
  queuedForDownload: number;
  nextCursor: string | null;
};

export const reprocessStoredXml = async (
  deps: ReprocessDeps,
  { after, limit }: { after: string | null; limit: number },
): Promise<ReprocessResult> => {
  const { invoices, nextCursor } = await deps.store.listInvoicesWithXml(after, limit);
  const result: ReprocessResult = { processed: 0, failed: 0, queuedForDownload: 0, nextCursor };

  for (const invoice of invoices) {
    if (!invoice.xmlUrl) {
      await deps.store.updateInvoice(invoice.id, { syncStatus: SYNC_STATUS.PENDING });
      result.queuedForDownload++;
      continue;
    }
    try {
      const xml = await deps.readXml(invoice.xmlUrl);
      await importInvoiceDetails(deps, invoice, xml, { uploadXml: false });
      result.processed++;
    } catch (e) {
      await deps.store.updateInvoice(invoice.id, {
        syncError: `Ponowne przetworzenie XML nieudane: ${errorMessage(e)}`,
      });
      result.failed++;
    }
  }
  return result;
};
