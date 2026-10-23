import { defineObject, FieldType, RelationType } from 'twenty-sdk/define';

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
  ],
});
