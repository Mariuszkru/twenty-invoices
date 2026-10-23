import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Strona ONE_TO_MANY relacji project.company.
export default defineField({
  universalIdentifier: ID.companyProjects,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'projects',
  label: 'Projekty',
  icon: 'IconBriefcase',
  relationTargetObjectMetadataUniversalIdentifier: ID.projectObject,
  relationTargetFieldMetadataUniversalIdentifier: ID.projCompany,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
