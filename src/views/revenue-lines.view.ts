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
  universalIdentifier: ID.viewRevenueLines,
  name: 'Pozycje sprzedaży',
  objectUniversalIdentifier: ID.lineObject,
  icon: 'IconTrendingUp',
  position: 1,
  fields: [
    {
      universalIdentifier: '5720d862-7b7c-4111-8a3b-98424933e82d',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.lineObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 260,
    },
    { universalIdentifier: 'e24c93cf-54b6-402e-bbfe-531177dab687', fieldMetadataUniversalIdentifier: ID.lineInvoice, position: 1, isVisible: true, size: 160 },
    { universalIdentifier: 'b00a7bd2-01ef-4f23-94af-61b12289adbc', fieldMetadataUniversalIdentifier: ID.lineCompany, position: 2, isVisible: true, size: 180 },
    { universalIdentifier: '5e86fd65-491b-4226-bd38-d93b9580566d', fieldMetadataUniversalIdentifier: ID.lineIssueDate, position: 3, isVisible: true, size: 130 },
    { universalIdentifier: 'cc5299a5-9cf5-4649-b74f-f4a974a0a53e', fieldMetadataUniversalIdentifier: ID.lineNet, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: 'a4012745-a141-4056-9643-fe4e07740515', fieldMetadataUniversalIdentifier: ID.lineMarginEffectPln, position: 5, isVisible: true, size: 160 },
    { universalIdentifier: '902e9969-a96a-49c2-8d1d-60450a8fa07a', fieldMetadataUniversalIdentifier: ID.lineAllocationStatus, position: 6, isVisible: true, size: 160 },
  ],
  filters: [
    {
      universalIdentifier: 'd1fae339-578d-47a8-807c-f6bdeb0bc0db',
      fieldMetadataUniversalIdentifier: ID.lineDirection,
      operand: ViewFilterOperand.IS,
      value: [DIRECTION.SALE],
    },
  ],
  sorts: [
    {
      universalIdentifier: '9cfb4e29-766f-485c-9033-c1559f93f3a1',
      fieldMetadataUniversalIdentifier: ID.lineIssueDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
