import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordUpdateEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { MATCH_STATUS } from 'src/constants/options';
import { recomputeInvoicePayment } from 'src/lib/bank/payment';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';

type BankTransactionRow = { matchStatus?: string | null };

// Oznaczenie transakcji jako "Pominięta" (albo cofnięcie tego) zmienia, czy jej rozliczenia liczą się do płatności.
// Zmiany zapisane przez aplikację (bez osoby) pomijamy – tam przeliczenie robi sam przebieg.
const handler = async (event: DatabaseEventPayload<ObjectRecordUpdateEvent<BankTransactionRow>>) => {
  if (!event.workspaceMemberId) return { skipped: 'NOT_A_USER_CHANGE' };
  const { before, after } = event.properties;
  const ignoredChanged =
    (before.matchStatus === MATCH_STATUS.IGNORED) !== (after.matchStatus === MATCH_STATUS.IGNORED);
  if (!ignoredChanged) return { skipped: 'NO_RELEVANT_CHANGE' };

  const store = createTwentyBankStore();
  const allocations = await store.listTransactionAllocations(event.recordId);
  const invoiceIds = [...new Set(allocations.map((a) => a.invoiceId))];
  for (const invoiceId of invoiceIds) await recomputeInvoicePayment(store, invoiceId);
  return { recomputed: invoiceIds };
};

export default defineLogicFunction({
  universalIdentifier: ID.fnBankTxUpdated,
  name: 'bank-transaction-updated',
  description: 'Przelicza płatność faktur po oznaczeniu transakcji bankowej jako pominiętej albo cofnięciu tego.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'bankTransaction.updated',
    updatedFields: ['matchStatus'],
  },
  handler,
});
