import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Strona ONE_TO_MANY relacji ksefInvoiceLine.company.
export default defineField({
  universalIdentifier: ID.companyKsefInvoiceLines,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'ksefInvoiceLines',
  label: 'Pozycje faktur KSeF',
  icon: 'IconListDetails',
  relationTargetObjectMetadataUniversalIdentifier: ID.lineObject,
  relationTargetFieldMetadataUniversalIdentifier: ID.lineCompany,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
