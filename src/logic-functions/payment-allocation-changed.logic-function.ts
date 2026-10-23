import { defineLogicFunction } from 'twenty-sdk/define';
import type { DatabaseEventPayload, ObjectRecordEvent } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { isExpenseCategory, MATCH_STATUS, PAYMENT_PURPOSE } from 'src/constants/options';
import { recomputeInvoicePayment } from 'src/lib/bank/payment';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';

type AllocationRow = { invoiceId?: string | null; transactionId?: string | null };

// Rozliczenie dodane, zmienione albo usunięte przez osobę bezpośrednio w CRM (poza panelem "Rozlicz przelew")
// przelicza płatność faktur i status transakcji. Zapisy aplikacji (sync, panel) przeliczają się same.
const handler = async (event: DatabaseEventPayload<ObjectRecordEvent<AllocationRow>>) => {
  if (!event.workspaceMemberId) return { skipped: 'NOT_A_USER_CHANGE' };
  const { before, after } = event.properties as { before?: AllocationRow; after?: AllocationRow };
  const store = createTwentyBankStore();

  const invoiceIds = [...new Set([before?.invoiceId, after?.invoiceId].filter((id): id is string => !!id))];
  for (const invoiceId of invoiceIds) await recomputeInvoicePayment(store, invoiceId);

  const transactionIds = [...new Set([before?.transactionId, after?.transactionId].filter((id): id is string => !!id))];
  for (const transactionId of transactionIds) {
    const transaction = await store.getTransaction(transactionId);
    if (!transaction) continue;
    const allocations = await store.listTransactionAllocations(transactionId);
    // wydatek bez faktury zostaje nim, dopóki ktoś nie przypnie faktury; wtedy cel płatności to faktura
    if (!allocations.length && isExpenseCategory(transaction.paymentPurpose)) continue;
    await store.updateTransaction(transactionId, {
      paymentPurpose: allocations.length ? PAYMENT_PURPOSE.INVOICE : null,
      employeeId: null,
      matchStatus: allocations.length ? MATCH_STATUS.MANUAL : MATCH_STATUS.UNMATCHED,
      matchNote: 'Rozliczenie zmienione ręcznie',
    });
  }
  return { recomputed: invoiceIds };
};

export default defineLogicFunction({
  universalIdentifier: ID.fnAllocChanged,
  name: 'payment-allocation-changed',
  description: 'Przelicza płatność faktury po ręcznej zmianie rozliczenia transakcji bankowej.',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'paymentAllocation.*' },
  handler,
});
