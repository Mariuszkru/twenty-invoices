import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineCommandMenuItem({
  universalIdentifier: ID.cmdImportXml,
  label: 'Importuj faktury spoza KSeF (Symfonia, enova)',
  shortLabel: 'Import faktur',
  availabilityType: 'GLOBAL',
  frontComponentUniversalIdentifier: ID.fcImportXml,
});
