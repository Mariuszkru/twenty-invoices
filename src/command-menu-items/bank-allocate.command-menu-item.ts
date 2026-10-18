import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineCommandMenuItem({
  universalIdentifier: ID.cmdBankAllocate,
  label: 'Rozlicz przelew z fakturami',
  shortLabel: 'Rozlicz',
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: ID.bankTxObject,
  frontComponentUniversalIdentifier: ID.fcBankAllocate,
});
