import { defineView, getFieldUniversalIdentifier, ViewSortDirection } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Wszystkie transakcje z wyciągu, od najnowszych.
export default defineView({
  universalIdentifier: ID.viewBankTx,
  name: 'Transakcje bankowe',
  objectUniversalIdentifier: ID.bankTxObject,
  icon: 'IconBuildingBank',
  position: 0,
  fields: [
    {
      universalIdentifier: 'ad9cdd4c-c5ec-48c3-bf0c-b7a36d6b9765',
      fieldMetadataUniversalIdentifier: getFieldUniversalIdentifier({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier: ID.bankTxObject,
        name: 'name',
      }),
      position: 0,
      isVisible: true,
      size: 260,
    },
    { universalIdentifier: '8b70bbc1-f8d7-4b31-8fa2-5d725e7ad8f7', fieldMetadataUniversalIdentifier: ID.btxBookingDate, position: 1, isVisible: true, size: 130 },
    { universalIdentifier: '99c9137e-319b-46bb-b540-094e52e2f8d0', fieldMetadataUniversalIdentifier: ID.btxDirection, position: 2, isVisible: true, size: 110 },
    { universalIdentifier: 'fe4df5ca-ebbd-4ea9-b0ff-af3b7e024f6d', fieldMetadataUniversalIdentifier: ID.btxAmount, position: 3, isVisible: true, size: 140 },
    { universalIdentifier: '113cebdd-8e8d-4cb0-ad57-379113356124', fieldMetadataUniversalIdentifier: ID.btxMatchStatus, position: 4, isVisible: true, size: 190 },
    { universalIdentifier: 'b95e6994-f09f-4378-8791-4b0ee4b5854b', fieldMetadataUniversalIdentifier: ID.btxAllocations, position: 5, isVisible: true, size: 220 },
    { universalIdentifier: 'a3afcd84-d82f-4981-8e1c-8f05cff6a6b7', fieldMetadataUniversalIdentifier: ID.btxCounterpartyName, position: 6, isVisible: true, size: 200 },
    { universalIdentifier: '34975616-500c-4580-9bc5-8aa5f9c3bc4d', fieldMetadataUniversalIdentifier: ID.btxRemittance, position: 7, isVisible: true, size: 260 },
    { universalIdentifier: '4fe34237-315d-48f2-b313-4b8abba7aea5', fieldMetadataUniversalIdentifier: ID.btxMatchNote, position: 8, isVisible: true, size: 260 },
    { universalIdentifier: '07305663-f897-468a-add1-1d62cd578a25', fieldMetadataUniversalIdentifier: ID.btxPaymentPurpose, position: 9, isVisible: true, size: 160 },
    { universalIdentifier: '8a39f79e-059f-4b59-ae7d-c7c27eea9a12', fieldMetadataUniversalIdentifier: ID.btxEmployee, position: 10, isVisible: true, size: 180 },
  ],
  sorts: [
    {
      universalIdentifier: 'b0450875-d895-4774-bc7f-b39c37f19ee0',
      fieldMetadataUniversalIdentifier: ID.btxBookingDate,
      direction: ViewSortDirection.DESC,
    },
  ],
});
