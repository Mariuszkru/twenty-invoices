import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Strona ONE_TO_MANY relacji project.person – projekty dla klientów indywidualnych.
export default defineField({
  universalIdentifier: ID.personProjects,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'projects',
  label: 'Projekty',
  icon: 'IconBriefcase',
  relationTargetObjectMetadataUniversalIdentifier: ID.projectObject,
  relationTargetFieldMetadataUniversalIdentifier: ID.projPerson,
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
