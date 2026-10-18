import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineCommandMenuItem({
  universalIdentifier: ID.cmdBankConnect,
  label: 'Połącz konto bankowe (Enable Banking)',
  shortLabel: 'Bank',
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: ID.bankTxObject,
  frontComponentUniversalIdentifier: ID.fcBankConnect,
});
