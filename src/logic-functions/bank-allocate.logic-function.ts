import { defineLogicFunction } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { AllocationError, saveManualAllocation, type ManualAllocation } from 'src/lib/bank/allocate';
import { createTwentyBankStore } from 'src/lib/bank/twenty-bank-store';
import { errorMessage } from 'src/lib/sync/import-details';

type AllocateBody = {
  transactionId?: string;
  allocations?: ManualAllocation[];
  expenseCategory?: string | null;
  employeeId?: string | null;
};

// Zapis z panelu "Rozlicz przelew": zastępuje rozliczenia transakcji i przelicza płatność faktur
// albo oznacza wydatek bez faktury (ZUS, podatki, wynagrodzenia).
export default defineLogicFunction({
  universalIdentifier: ID.fnBankAllocate,
  name: 'bank-allocate',
  description: 'Zapisuje ręczne rozliczenie transakcji bankowej z jedną albo kilkoma fakturami.',
  timeoutSeconds: 30,
  httpRouteTriggerSettings: {
    path: '/bank/allocate',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
  handler: async (event: { body: object | null }) => {
    const { transactionId, allocations, expenseCategory, employeeId } = (event.body ?? {}) as AllocateBody;
    const expense = expenseCategory ? { category: expenseCategory, employeeId: employeeId ?? null } : null;
    if (!transactionId || !Array.isArray(allocations)) return { ok: false, message: 'Niepełne dane rozliczenia.' };
    try {
      return { ok: true, ...(await saveManualAllocation(createTwentyBankStore(), transactionId, allocations, expense)) };
    } catch (e) {
      if (!(e instanceof AllocationError)) console.error(`[bank-allocate] ${errorMessage(e)}`);
      return { ok: false, message: errorMessage(e) };
    }
  },
});
