import {
  defineView,
  getFieldUniversalIdentifier,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { DIRECTION } from 'src/constants/options';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: ID.viewSales,
  name: 'Faktury sprzedaży',
  objectUniversalIdentifier: ID.invoiceObject,
  icon: 'IconFileUpload',
  position: 0,
  fields: [
    {
      universalIdentifier: 'df255ba7-4130-49a3-ac5c-79bb7c3b7df8',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.invoiceObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 180,
    },
    { universalIdentifier: '44a0dcb2-939c-4807-867e-58bffb0613ba', fieldMetadataUniversalIdentifier: ID.invIssueDate, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: 'be1fcb84-cb3e-4a6d-bad7-511aba51dc0d', fieldMetadataUniversalIdentifier: ID.invCounterpartyName, position: 2, isVisible: true, size: 220 },
    { universalIdentifier: '85f06717-8c6a-4a04-a9c5-9df3029e5a8a', fieldMetadataUniversalIdentifier: ID.invCompany, position: 3, isVisible: true, size: 180 },
    { universalIdentifier: 'a87a3515-3112-4867-97c4-a744a3dfc66a', fieldMetadataUniversalIdentifier: ID.invNet, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: '599fefeb-986b-4623-bf59-889af0c020b3', fieldMetadataUniversalIdentifier: ID.invGross, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: 'c893bfa3-43ed-4b9f-8786-71cdee015373', fieldMetadataUniversalIdentifier: ID.invType, position: 6, isVisible: true, size: 140 },
    { universalIdentifier: '879c518f-eac0-40fa-a8dc-02e8e762ef23', fieldMetadataUniversalIdentifier: ID.invSyncStatus, position: 7, isVisible: true, size: 140 },
  ],
  filters: [
    {
      universalIdentifier: '0a393159-f07a-41e2-bc64-f97ce642bc24',
      fieldMetadataUniversalIdentifier: ID.invDirection,
      operand: ViewFilterOperand.IS,
      value: [DIRECTION.SALE],
    },
  ],
  sorts: [
    {
      universalIdentifier: '37975b11-0e7c-4898-aafe-700de81c6340',
      fieldMetadataUniversalIdentifier: ID.invIssueDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
