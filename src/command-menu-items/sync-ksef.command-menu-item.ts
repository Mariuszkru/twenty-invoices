import { defineCommandMenuItem } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

export default defineCommandMenuItem({
  universalIdentifier: ID.cmdSync,
  label: 'Synchronizuj faktury z KSeF',
  shortLabel: 'Sync KSeF',
  availabilityType: 'GLOBAL',
  frontComponentUniversalIdentifier: ID.fcSyncCommand,
});
