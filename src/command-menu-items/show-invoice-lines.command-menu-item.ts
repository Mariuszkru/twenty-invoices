import { defineCommandMenuItem, isSelectAll, numberOfSelectedRecords } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Przypięty przycisk na fakturze (lista i karta rekordu): przejście do jej pozycji.
// Przy kilku zaznaczonych fakturach filtr obejmuje wszystkie; "zaznacz wszystko" nie ma listy ID.
export default defineCommandMenuItem({
  universalIdentifier: ID.cmdShowInvoiceLines,
  label: 'Pokaż pozycje faktury',
  shortLabel: 'Pokaż pozycje',
  isPinned: true,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier: ID.invoiceObject,
  conditionalAvailabilityExpression: numberOfSelectedRecords >= 1 && !isSelectAll,
  frontComponentUniversalIdentifier: ID.fcShowInvoiceLines,
});
