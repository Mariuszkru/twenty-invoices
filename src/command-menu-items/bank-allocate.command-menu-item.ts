import { defineCommandMenuItem, isSelectAll, numberOfSelectedRecords } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Przypięty przycisk na górnym pasku. Panel rozlicza dokładnie jeden przelew,
// więc przycisk pokazuje się tylko przy jednym zaznaczonym rekordzie.
export default defineCommandMenuItem({
  universalIdentifier: ID.cmdBankAllocate,
  label: 'Rozlicz przelew z fakturami',
  shortLabel: 'Rozlicz',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: ID.bankTxObject,
  conditionalAvailabilityExpression: numberOfSelectedRecords === 1 && !isSelectAll,
  frontComponentUniversalIdentifier: ID.fcBankAllocate,
});
