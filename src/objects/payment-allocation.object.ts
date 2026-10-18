import { defineObject, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { ALLOCATION_ORIGIN_OPTIONS } from 'src/constants/options';

// Rozliczenie transakcji bankowej z fakturą: jaka część przelewu opłaca którą fakturę. Przelew zbiorczy ma kilka
// rozliczeń, faktura płacona w ratach też. Pole `name` (dodawane automatycznie) to numer faktury i kwota.
export default defineObject({
  universalIdentifier: ID.allocObject,
  nameSingular: 'paymentAllocation',
  namePlural: 'paymentAllocations',
  labelSingular: 'Rozliczenie płatności',
  labelPlural: 'Rozliczenia płatności',
  description: 'Część transakcji bankowej przypisana do faktury.',
  icon: 'IconArrowsSplit',
  fields: [
    {
      universalIdentifier: ID.allocTransaction,
      name: 'transaction',
      type: FieldType.RELATION,
      label: 'Transakcja',
      icon: 'IconBuildingBank',
      relationTargetObjectMetadataUniversalIdentifier: ID.bankTxObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.btxAllocations,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'transactionId',
      },
    },
    {
      universalIdentifier: ID.allocInvoice,
      name: 'invoice',
      type: FieldType.RELATION,
      label: 'Faktura',
      icon: 'IconFileInvoice',
      relationTargetObjectMetadataUniversalIdentifier: ID.invoiceObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.invPaymentAllocations,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'invoiceId',
      },
    },
    {
      universalIdentifier: ID.allocAmount,
      name: 'amount',
      type: FieldType.CURRENCY,
      label: 'Kwota',
      icon: 'IconCash',
    },
    {
      universalIdentifier: ID.allocOrigin,
      name: 'origin',
      type: FieldType.SELECT,
      label: 'Pochodzenie',
      icon: 'IconRobot',
      options: [...ALLOCATION_ORIGIN_OPTIONS],
    },
  ],
});
