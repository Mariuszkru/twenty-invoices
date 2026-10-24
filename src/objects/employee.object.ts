import { defineObject, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Pracownik, którego dotyczą przelewy wynagrodzeń (rodzaj wydatku "Wynagrodzenia"). Osobna lista, bo nie każdy
// pracownik ma konto w CRM. Nazwa musi odpowiadać odbiorcy przelewu, żeby wynagrodzenie przypisało się samo.
export default defineObject({
  universalIdentifier: ID.employeeObject,
  nameSingular: 'employee',
  namePlural: 'employees',
  labelSingular: 'Pracownik',
  labelPlural: 'Pracownicy',
  description: 'Pracownik, do którego przypisujemy przelewy wynagrodzeń.',
  icon: 'IconUsers',
  labelIdentifierFieldMetadataUniversalIdentifier: ID.empName,
  fields: [
    {
      universalIdentifier: ID.empName,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Imię i nazwisko',
      icon: 'IconUser',
    },
    {
      universalIdentifier: ID.empSalaryTransactions,
      name: 'salaryTransactions',
      type: FieldType.RELATION,
      label: 'Wynagrodzenia',
      description: 'Przelewy wynagrodzeń tego pracownika.',
      icon: 'IconBuildingBank',
      relationTargetObjectMetadataUniversalIdentifier: ID.bankTxObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.btxEmployee,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
    {
      universalIdentifier: ID.empRocketChatUsername,
      type: FieldType.TEXT,
      name: 'rocketChatUsername',
      label: 'Login Rocket.Chat',
      description: 'Nazwa użytkownika w Rocket.Chat (bez @); potrzebna, żeby dodać pracownika do kanałów projektów.',
      icon: 'IconAt',
    },
    {
      universalIdentifier: ID.empProject,
      name: 'project',
      type: FieldType.RELATION,
      label: 'Projekt',
      description: 'Projekt, do którego pracownik jest przypisany; pracownik należy do kanału tego projektu w Rocket.Chat.',
      icon: 'IconBriefcase',
      relationTargetObjectMetadataUniversalIdentifier: ID.projectObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.projEmployees,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'projectId',
      },
    },
  ],
});
