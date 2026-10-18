import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineCommandMenuItem({
  universalIdentifier: ID.cmdImportXml,
  label: 'Importuj faktury spoza KSeF (Symfonia)',
  shortLabel: 'Import faktur',
  availabilityType: 'GLOBAL_OBJECT_CONTEXT',
  availabilityObjectUniversalIdentifier: ID.invoiceObject,
  frontComponentUniversalIdentifier: ID.fcImportXml,
});
