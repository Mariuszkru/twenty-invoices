import { defineIndex } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Każdy przebieg synchronizacji szuka faktur czekających na XML.
export default defineIndex({
  universalIdentifier: ID.idxSyncStatus,
  objectUniversalIdentifier: ID.invoiceObject,
  fields: [
    {
      universalIdentifier: ID.idxSyncStatusField,
      fieldUniversalIdentifier: ID.invSyncStatus,
    },
  ],
});
