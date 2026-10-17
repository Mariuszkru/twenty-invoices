import {
  defineView,
  getFieldUniversalIdentifier,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { ALLOCATION_STATUS, DIRECTION } from 'src/constants/options';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Kolejka pracy pod liczenie marży: koszty, których jeszcze nie przypisano do usługi.
export default defineView({
  universalIdentifier: ID.viewCostLines,
  name: 'Koszty do przypisania',
  objectUniversalIdentifier: ID.lineObject,
  icon: 'IconReceipt2',
  position: 0,
  fields: [
    {
      universalIdentifier: '1a83946b-b9ae-4bdb-9b2e-7014a3487d01',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.lineObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 260,
    },
    { universalIdentifier: 'b58bf4f6-2d64-43eb-a3f4-aa11f9036f5e', fieldMetadataUniversalIdentifier: ID.lineInvoice, position: 1, isVisible: true, size: 160 },
    { universalIdentifier: '47e07f72-4161-4676-980a-86416c3decbe', fieldMetadataUniversalIdentifier: ID.lineCompany, position: 2, isVisible: true, size: 180 },
    { universalIdentifier: '00c46cba-7b27-466b-9bc5-26d44aed5f87', fieldMetadataUniversalIdentifier: ID.lineIssueDate, position: 3, isVisible: true, size: 130 },
    { universalIdentifier: '2cfa7942-7a75-497e-b4ae-a51e04df1b5e', fieldMetadataUniversalIdentifier: ID.lineNet, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: 'd6ae6894-d180-4473-a9b8-352e722bc2cf', fieldMetadataUniversalIdentifier: ID.lineMarginEffectPln, position: 5, isVisible: true, size: 160 },
    { universalIdentifier: 'c0847f9b-3df2-47da-9f98-1b394a8ddb4f', fieldMetadataUniversalIdentifier: ID.lineCostCategory, position: 6, isVisible: true, size: 160 },
    { universalIdentifier: 'd106b792-5069-4e4b-aad1-49cb710b4d2b', fieldMetadataUniversalIdentifier: ID.lineAllocationStatus, position: 7, isVisible: true, size: 160 },
  ],
  filters: [
    {
      universalIdentifier: '5afbfed9-2984-4d7b-805f-dc4c2ccc3d10',
      fieldMetadataUniversalIdentifier: ID.lineDirection,
      operand: ViewFilterOperand.IS,
      value: [DIRECTION.PURCHASE],
    },
    {
      universalIdentifier: '7f75da93-e636-4897-abac-6afdf79e5f97',
      fieldMetadataUniversalIdentifier: ID.lineAllocationStatus,
      operand: ViewFilterOperand.IS,
      value: [ALLOCATION_STATUS.UNASSIGNED, ALLOCATION_STATUS.PARTIAL],
    },
  ],
  sorts: [
    {
      universalIdentifier: '25107680-7779-4d08-87c0-6b1a6ac95d0c',
      fieldMetadataUniversalIdentifier: ID.lineIssueDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
