import { defineCommandMenuItem, isSelectAll, numberOfSelectedRecords } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Ten sam panel z karty projektu (albo przy jednym zaznaczonym projekcie) – projekt jest już wybrany.
export default defineCommandMenuItem({
  universalIdentifier: ID.cmdProjectPinProject,
  label: 'Przypnij pozycje faktur',
  shortLabel: 'Przypnij pozycje',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: ID.projectObject,
  conditionalAvailabilityExpression: numberOfSelectedRecords === 1 && !isSelectAll,
  frontComponentUniversalIdentifier: ID.fcProjectPin,
});
