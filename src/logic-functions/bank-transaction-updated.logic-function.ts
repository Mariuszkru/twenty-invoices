import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordUpdateEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { MATCH_STATUS } from 'src/constants/options';
import { recomputeInvoicePayment } from 'src/lib/bank/payment';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';

type BankTransactionRow = { invoiceId?: string | null; matchStatus?: string | null };

// Ręczne przypisanie transakcji do faktury (albo jej odpięcie / pominięcie) przelicza płatność obu faktur.
// Zmiany zapisane przez bank-sync (uprawnienia aplikacji, bez osoby) pomijamy – tam przeliczenie robi sam przebieg.
const handler = async (event: DatabaseEventPayload<ObjectRecordUpdateEvent<BankTransactionRow>>) => {
  if (!event.workspaceMemberId) return { skipped: 'NOT_A_USER_CHANGE' };
  const { before, after, updatedFields } = event.properties;
  const invoiceChanged = (before.invoiceId ?? null) !== (after.invoiceId ?? null);
  const statusChanged = (before.matchStatus ?? null) !== (after.matchStatus ?? null);
  if (!invoiceChanged && !statusChanged) return { skipped: 'NO_RELEVANT_CHANGE', updatedFields };

  const store = createTwentyBankStore();
  if (invoiceChanged) {
    const matchStatus = after.invoiceId ? MATCH_STATUS.MANUAL : MATCH_STATUS.UNMATCHED;
    // osoba sama ustawiła "Pominięta" – nie nadpisujemy
    if (after.matchStatus !== MATCH_STATUS.IGNORED && after.matchStatus !== matchStatus) {
      await store.updateTransaction(event.recordId, { matchStatus, matchNote: 'Przypisanie zmienione ręcznie' });
    }
  }

  const invoiceIds = [...new Set([before.invoiceId, after.invoiceId].filter((id): id is string => !!id))];
  for (const invoiceId of invoiceIds) await recomputeInvoicePayment(store, invoiceId);
  return { recomputed: invoiceIds };
};

export default defineLogicFunction({
  universalIdentifier: ID.fnBankTxUpdated,
  name: 'bank-transaction-updated',
  description: 'Przelicza status płatności faktury po ręcznej zmianie przypisania transakcji bankowej.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'bankTransaction.updated',
    updatedFields: ['invoice', 'invoiceId', 'matchStatus'],
  },
  handler,
});
