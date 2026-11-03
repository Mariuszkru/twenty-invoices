import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Przypięty przycisk na liście transakcji bankowych: dopasowanie na danych z CRM, bez zapytania do banku.
export default defineCommandMenuItem({
  universalIdentifier: ID.cmdBankRematch,
  label: 'Dopasuj przelewy automatycznie',
  shortLabel: 'Dopasuj automatycznie',
  isPinned: true,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: ID.bankTxObject,
  frontComponentUniversalIdentifier: ID.fcBankRematch,
});
