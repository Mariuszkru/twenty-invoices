import { defineIndex } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Numer KSeF jednoznacznie identyfikuje fakturę – klucz deduplikacji importu.
export default defineIndex({
  universalIdentifier: ID.idxKsefNumber,
  objectUniversalIdentifier: ID.invoiceObject,
  isUnique: true,
  fields: [
    {
      universalIdentifier: ID.idxKsefNumberField,
      fieldUniversalIdentifier: ID.invKsefNumber,
    },
  ],
});
