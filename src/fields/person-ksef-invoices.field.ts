import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Strona ONE_TO_MANY relacji ksefInvoice.person – faktury B2C wystawione konsumentowi.
export default defineField({
  universalIdentifier: ID.personKsefInvoices,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'ksefInvoices',
  label: 'Faktury',
  icon: 'IconFileInvoice',
  relationTargetObjectMetadataUniversalIdentifier: ID.invoiceObject,
  relationTargetFieldMetadataUniversalIdentifier: ID.invPerson,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
