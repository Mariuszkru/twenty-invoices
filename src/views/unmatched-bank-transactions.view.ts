import {
  defineView,
  getFieldUniversalIdentifier,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { MATCH_STATUS } from 'src/constants/options';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Transakcje bez faktury: do rozliczenia w panelu "Rozlicz przelew" albo oznaczenia jako pominięte.
export default defineView({
  universalIdentifier: ID.viewBankUnmatched,
  name: 'Nieprzypisane transakcje',
  objectUniversalIdentifier: ID.bankTxObject,
  icon: 'IconLinkOff',
  position: 1,
  fields: [
    {
      universalIdentifier: '289eefd1-5870-4eb5-a023-38a31edd3f0f',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.bankTxObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 260,
    },
    { universalIdentifier: '878ee29c-5432-4c73-ae6c-9add3f860e11', fieldMetadataUniversalIdentifier: ID.btxBookingDate, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: '76287edb-12e8-4a6b-8be1-5d62722c7cf9', fieldMetadataUniversalIdentifier: ID.btxDirection, position: 2, isVisible: true, size: 110 },
    { universalIdentifier: 'f3cfc3e9-1af0-4214-aea3-853aa3469677', fieldMetadataUniversalIdentifier: ID.btxAmount, position: 3, isVisible: true, size: 140 },
    { universalIdentifier: 'd44c2dd0-eca2-46d1-be3d-444a3d2a2b5d', fieldMetadataUniversalIdentifier: ID.btxAllocations, position: 4, isVisible: true, size: 220 },
    { universalIdentifier: '171463e7-e19d-4385-8119-24defcd19419', fieldMetadataUniversalIdentifier: ID.btxCounterpartyName, position: 5, isVisible: true, size: 200 },
    { universalIdentifier: '37da1b54-2a3a-4f3e-ab2d-80dd5ffd152d', fieldMetadataUniversalIdentifier: ID.btxRemittance, position: 6, isVisible: true, size: 260 },
    { universalIdentifier: 'ec80986f-3116-4471-b828-8fd3dbb74807', fieldMetadataUniversalIdentifier: ID.btxMatchNote, position: 7, isVisible: true, size: 260 },
    { universalIdentifier: '8e8601fd-5c0d-48e3-861e-d61bfa8d0239', fieldMetadataUniversalIdentifier: ID.btxMatchStatus, position: 8, isVisible: true, size: 190 },
  ],
  filters: [
    {
      universalIdentifier: 'b26f5d06-6bcd-413f-b252-aa6f039a5bac',
      fieldMetadataUniversalIdentifier: ID.btxMatchStatus,
      operand: ViewFilterOperand.IS,
      value: [MATCH_STATUS.UNMATCHED],
    },
  ],
  sorts: [
    {
      universalIdentifier: '1559cc50-c68b-4009-988f-010fa78ada3f',
      fieldMetadataUniversalIdentifier: ID.btxBookingDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
