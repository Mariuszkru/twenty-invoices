import {
  defineObject,
  FieldType,
  MetadataWritability,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import { ENTRY_TYPE_OPTIONS } from 'src/constants/options';

// Pozycja faktury (albo jej część) przypięta do projektu jako przychód lub koszt. Jedną pozycję można podzielić
// między kilka projektów. Puste typ i kwota uzupełnia aplikacja: typ z kierunku faktury, kwota = niepodzielona reszta.
export default defineObject({
  universalIdentifier: ID.entryObject,
  nameSingular: 'projectEntry',
  namePlural: 'projectEntries',
  labelSingular: 'Pozycja projektu',
  labelPlural: 'Pozycje projektów',
  description: 'Część pozycji faktury przypisana do projektu jako przychód albo koszt.',
  icon: 'IconListDetails',
  fields: [
    {
      universalIdentifier: ID.entryProject,
      name: 'project',
      type: FieldType.RELATION,
      label: 'Projekt',
      icon: 'IconBriefcase',
      relationTargetObjectMetadataUniversalIdentifier: ID.projectObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.projEntries,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.CASCADE,
        joinColumnName: 'projectId',
      },
    },
    {
      universalIdentifier: ID.entryLine,
      name: 'invoiceLine',
      type: FieldType.RELATION,
      label: 'Pozycja faktury',
      icon: 'IconListDetails',
      relationTargetObjectMetadataUniversalIdentifier: ID.lineObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.lineProjectEntries,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'invoiceLineId',
      },
    },
    {
      universalIdentifier: ID.entryType,
      name: 'entryType',
      type: FieldType.SELECT,
      label: 'Typ',
      description: 'Puste = z kierunku faktury: sprzedaż → przychód, zakup → koszt.',
      icon: 'IconArrowsExchange',
      options: [...ENTRY_TYPE_OPTIONS],
    },
    {
      universalIdentifier: ID.entryAmount,
      name: 'amount',
      type: FieldType.CURRENCY,
      label: 'Kwota netto',
      description: 'Netto w walucie dokumentu; korekta in minus jest ujemna. Puste = niepodzielona reszta pozycji.',
      icon: 'IconCoins',
    },
    {
      universalIdentifier: ID.entryAmountPln,
      name: 'amountPln',
      type: FieldType.CURRENCY,
      label: 'Kwota netto (PLN)',
      description: 'Kwota przeliczona kursem z faktury; z niej liczona jest marża projektu.',
      icon: 'IconCurrencyZloty',
      writability: MetadataWritability.APPLICATION,
      isAuditLogged: false,
    },
    {
      universalIdentifier: ID.entryInvoice,
      name: 'invoice',
      type: FieldType.RELATION,
      label: 'Faktura',
      description: 'Faktura pozycji; uzupełniana automatycznie.',
      icon: 'IconFileInvoice',
      writability: MetadataWritability.APPLICATION,
      relationTargetObjectMetadataUniversalIdentifier: ID.invoiceObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.invProjectEntries,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'invoiceId',
      },
    },
    {
      universalIdentifier: ID.entryNote,
      name: 'note',
      type: FieldType.TEXT,
      label: 'Notatka',
      icon: 'IconNotes',
    },
    {
      universalIdentifier: ID.entryIssue,
      name: 'issue',
      type: FieldType.TEXT,
      label: 'Uwaga',
      description: 'Brak kursu, inna waluta albo przekroczona wartość pozycji faktury.',
      icon: 'IconAlertTriangle',
      writability: MetadataWritability.APPLICATION,
      isAuditLogged: false,
    },
  ],
});
