import { defineIndex } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Okna pobierania wyciągu nachodzą na siebie – ta sama transakcja nie może trafić do CRM dwa razy.
export default defineIndex({
  universalIdentifier: ID.idxBtxExternalId,
  objectUniversalIdentifier: ID.bankTxObject,
  isUnique: true,
  fields: [
    {
      universalIdentifier: ID.idxBtxExternalIdField,
      fieldUniversalIdentifier: ID.btxExternalId,
    },
  ],
});
