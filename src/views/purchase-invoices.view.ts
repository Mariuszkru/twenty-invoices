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
  universalIdentifier: ID.viewPurchases,
  name: 'Faktury zakupu',
  objectUniversalIdentifier: ID.invoiceObject,
  icon: 'IconFileDownload',
  position: 1,
  fields: [
    {
      universalIdentifier: '3e0e56c4-578f-488e-833c-5a9b1f737efb',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.invoiceObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 180,
    },
    { universalIdentifier: '31b7592f-3936-44ec-9a2f-da9882a0a37f', fieldMetadataUniversalIdentifier: ID.invIssueDate, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: 'd4504a09-6fbc-4688-b716-40768b4adfda', fieldMetadataUniversalIdentifier: ID.invCounterpartyName, position: 2, isVisible: true, size: 220 },
    { universalIdentifier: '2a02a587-8e6c-4494-96c2-abf7787ff573', fieldMetadataUniversalIdentifier: ID.invCompany, position: 3, isVisible: true, size: 180 },
    { universalIdentifier: 'cf97fc56-58a7-4058-a482-090fcf8a22dd', fieldMetadataUniversalIdentifier: ID.invNet, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: '38554cb8-7a03-4897-a19b-db5c23dc2d3b', fieldMetadataUniversalIdentifier: ID.invGross, position: 5, isVisible: true, size: 140 },
    { universalIdentifier: 'b72cbb50-d366-47d7-a1e6-0bf99409c941', fieldMetadataUniversalIdentifier: ID.invType, position: 6, isVisible: true, size: 140 },
    { universalIdentifier: '3a2c26dd-5662-47d0-a322-b3057be52d62', fieldMetadataUniversalIdentifier: ID.invSyncStatus, position: 7, isVisible: true, size: 140 },
  ],
  filters: [
    {
      universalIdentifier: '6f6fcb23-f108-4a03-ae39-f93f19fe79b5',
      fieldMetadataUniversalIdentifier: ID.invDirection,
      operand: ViewFilterOperand.IS,
      value: [DIRECTION.PURCHASE],
    },
  ],
  sorts: [
    {
      universalIdentifier: '5f730ea2-e2ca-48d9-a978-78368c088a62',
      fieldMetadataUniversalIdentifier: ID.invIssueDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
