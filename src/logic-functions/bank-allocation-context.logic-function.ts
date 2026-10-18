import { defineLogicFunction } from 'twenty-sdk/define';
import type { RoutePayload } from 'twenty-sdk/logic-function';

import { ID } from 'src/constants/ids';
import { AllocationError, allocationContext } from 'src/lib/bank/allocate';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';
import { errorMessage } from 'src/lib/sync/import-details';

// Dane panelu "Rozlicz przelew": transakcja i faktury, które można nią opłacić.
export default defineLogicFunction({
  universalIdentifier: ID.fnBankAllocContext,
  name: 'bank-allocation-context',
  description: 'Zwraca transakcję bankową i faktury do rozliczenia w panelu "Rozlicz przelew".',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/bank/allocation',
    httpMethod: 'GET',
    isAuthRequired: true,
  },
  handler: async (event: RoutePayload) => {
    const transactionId = event.queryStringParameters?.transactionId;
    if (!transactionId) return { ok: false, message: 'Brak identyfikatora transakcji.' };
    try {
      return { ok: true, ...(await allocationContext(createTwentyBankStore(), transactionId)) };
    } catch (e) {
      if (!(e instanceof AllocationError)) console.error(`[bank-allocation-context] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    }
  },
});
