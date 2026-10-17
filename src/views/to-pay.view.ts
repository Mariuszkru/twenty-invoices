import {
  defineView,
  getFieldUniversalIdentifier,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { DIRECTION, PAYMENT_STATUS } from 'src/constants/options';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Niezapłacone faktury zakupowe od najbliższego terminu – żeby żaden dostawca nie czekał na przelew.
export default defineView({
  universalIdentifier: ID.viewToPay,
  name: 'Do zapłaty',
  objectUniversalIdentifier: ID.invoiceObject,
  icon: 'IconCalendarDue',
  position: 2,
  fields: [
    {
      universalIdentifier: '779decd7-a01c-461c-a15c-644bf1969012',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.invoiceObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 180,
    },
    { universalIdentifier: '1e99fa8a-0185-4c5d-88fe-4259bc60bb20', fieldMetadataUniversalIdentifier: ID.invDueDate, position: 1, isVisible: true, size: 140 },
    { universalIdentifier: '8866134a-ddca-4990-aece-f5f415e9b587', fieldMetadataUniversalIdentifier: ID.invCounterpartyName, position: 2, isVisible: true, size: 220 },
    { universalIdentifier: '2df62f90-8877-4081-847b-14d6d99ba11c', fieldMetadataUniversalIdentifier: ID.invGross, position: 3, isVisible: true, size: 140 },
    { universalIdentifier: 'e349745e-5da1-473d-bfe7-7cc883840b31', fieldMetadataUniversalIdentifier: ID.invPaymentStatus, position: 4, isVisible: true, size: 140 },
    { universalIdentifier: 'fd2cad73-e03c-4d67-9834-f2c14d66c995', fieldMetadataUniversalIdentifier: ID.invBankAccount, position: 5, isVisible: true, size: 260 },
    { universalIdentifier: 'f446d91d-275c-4dec-899e-8e84e36a18a7', fieldMetadataUniversalIdentifier: ID.invIssueDate, position: 6, isVisible: true, size: 130 },
  ],
  filters: [
    {
      universalIdentifier: '4b14024a-0b49-49d4-a368-39c60cf8bc64',
      fieldMetadataUniversalIdentifier: ID.invDirection,
      operand: ViewFilterOperand.IS,
      value: [DIRECTION.PURCHASE],
    },
    {
      universalIdentifier: 'dc456def-eedc-4f1b-acc2-d8928cd3567f',
      fieldMetadataUniversalIdentifier: ID.invPaymentStatus,
      operand: ViewFilterOperand.IS,
      value: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL],
    },
  ],
  sorts: [
    {
      universalIdentifier: 'db778eda-f889-42e4-ab24-b9fcc744d9d6',
      fieldMetadataUniversalIdentifier: ID.invDueDate,
      direction: ViewSortDirection.ASC,
    },
  ],
});
