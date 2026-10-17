import { defineLogicFunction } from 'twenty-sdk/define';
import { enqueueJobs } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { fetchNbpRateBefore } from 'src/lib/nbp';
import { reprocessStoredXml } from 'src/lib/sync/reprocess';
import { createTwentyStore } from 'src/lib/sync/twenty-store';

const PAGE_SIZE = 20;

const readXml = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pobranie zapisanego XML nieudane: HTTP ${response.status}`);
  return response.text();
};

// Ponowne przetworzenie XML faktur zapisanego w CRM, strona po stronie (każda strona to osobne zadanie).
// Uruchamiane ręcznie po zmianie parsera: `twenty app exec -r <remote> --name ksef-reprocess-xml`.
const handler = async (params: { cursor?: string | null } | null) => {
  const after = params?.cursor ?? null;
  const result = await reprocessStoredXml(
    {
      store: createTwentyStore(),
      nbpRate: (currency, date) => fetchNbpRateBefore(currency, date),
      readXml,
    },
    { after, limit: PAGE_SIZE },
  );
  if (result.nextCursor) {
    await enqueueJobs({
      logicFunctionUniversalIdentifier: ID.fnReprocessXml,
      jobs: [{ payload: { cursor: result.nextCursor } }],
    });
  }
  console.log(`[ksef-reprocess-xml] ${JSON.stringify({ after, ...result })}`);
  return result;
};

export default defineLogicFunction({
  universalIdentifier: ID.fnReprocessXml,
  name: 'ksef-reprocess-xml',
  description: 'Ponownie przetwarza XML faktur zapisany w CRM (bez pobierania z KSeF).',
  timeoutSeconds: 120,
  handler,
});
