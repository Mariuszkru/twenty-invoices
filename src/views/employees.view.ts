import { defineView } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';

// Lista pracowników do przypisywania wynagrodzeń w panelu "Rozlicz przelew".
export default defineView({
  universalIdentifier: ID.viewEmployees,
  name: 'Pracownicy',
  objectUniversalIdentifier: ID.employeeObject,
  icon: 'IconUsers',
  position: 0,
  fields: [
    { universalIdentifier: '4372ec7a-e281-4d85-9cbf-690f03f4b1c5', fieldMetadataUniversalIdentifier: ID.empName, position: 0, isVisible: true, size: 240 },
    { universalIdentifier: '0a5d2b07-b45f-4927-a6f6-c5ed7edbc5a0', fieldMetadataUniversalIdentifier: ID.empSalaryTransactions, position: 1, isVisible: true, size: 260 },
  ],
});
