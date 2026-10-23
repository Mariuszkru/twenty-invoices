import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Przypięty przycisk na liście pozycji projektów: projekt wybiera się w panelu.
export default defineCommandMenuItem({
  universalIdentifier: ID.cmdProjectPinEntries,
  label: 'Przypnij pozycje faktur do projektu',
  shortLabel: 'Przypnij pozycje',
  isPinned: true,
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: ID.entryObject,
  frontComponentUniversalIdentifier: ID.fcProjectPin,
});
