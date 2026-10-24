import { defineObject, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Pracownik przypisany do projektu (obiekt łączący wiele-do-wielu). Przypisanie dodaje go do prywatnego kanału
// projektu w Rocket.Chat, usunięcie przypisania – usuwa z kanału.
export default defineObject({
  universalIdentifier: ID.memberObject,
  nameSingular: 'projectMember',
  namePlural: 'projectMembers',
  labelSingular: 'Członek projektu',
  labelPlural: 'Członkowie projektów',
  description: 'Pracownik przypisany do projektu; należy do kanału projektu w Rocket.Chat.',
  icon: 'IconUsersGroup',
  fields: [
    {
      universalIdentifier: ID.memberProject,
      name: 'project',
      type: FieldType.RELATION,
      label: 'Projekt',
      icon: 'IconBriefcase',
      relationTargetObjectMetadataUniversalIdentifier: ID.projectObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.projMembers,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'projectId',
      },
    },
    {
      universalIdentifier: ID.memberEmployee,
      name: 'employee',
      type: FieldType.RELATION,
      label: 'Pracownik',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier: ID.employeeObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.empProjectMemberships,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'employeeId',
      },
    },
  ],
});
