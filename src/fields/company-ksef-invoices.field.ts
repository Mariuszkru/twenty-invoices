import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Strona ONE_TO_MANY relacji ksefInvoice.company – wymagana, bo relacje w Twenty są dwustronne.
export default defineField({
  universalIdentifier: ID.companyKsefInvoices,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'ksefInvoices',
  label: 'Faktury KSeF',
  icon: 'IconFileInvoice',
  relationTargetObjectMetadataUniversalIdentifier: ID.invoiceObject,
  relationTargetFieldMetadataUniversalIdentifier: ID.invCompany,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
