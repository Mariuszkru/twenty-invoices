import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { normalizeNip } from 'src/lib/sync/sync-from-env';
import { createTwentyStore } from 'src/lib/sync/twenty-store';

type CompanyEvent = DatabaseEventPayload<
  ObjectRecordEvent<{ nip?: string | null }> & { properties: { after?: { nip?: string | null } } }
>;

// Nowa firma albo zmieniony NIP (pole z dodatku regon-nip): dopina wcześniej zaimportowane faktury i pozycje
// tego kontrahenta, które nie mają jeszcze firmy.
const handler = async (event: CompanyEvent) => {
  const nip = normalizeNip(event.properties?.after?.nip ?? undefined);
  if (nip.length !== 10 || !event.recordId) return { linked: false };

  const result = await createTwentyStore().linkCompanyByNip(nip, event.recordId);
  return { linked: true, ...result };
};

export default defineLogicFunction({
  universalIdentifier: ID.fnRelinkCompany,
  name: 'relink-company-ksef-invoices',
  description: 'Dopina faktury KSeF do firmy po jej NIP-ie.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'company.*',
    updatedFields: ['nip'],
  },
  handler,
});
