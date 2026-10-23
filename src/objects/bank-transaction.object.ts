import { defineObject, FieldType, OnDeleteAction, RelationType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import {
  BANK_DIRECTION_OPTIONS,
  MATCH_STATUS,
  MATCH_STATUS_OPTIONS,
  PAYMENT_PURPOSE_OPTIONS,
} from 'src/constants/options';

// Zaksięgowana transakcja z wyciągu bankowego pobrana przez Enable Banking. Pole `name` (dodawane automatycznie)
// to kontrahent i tytuł przelewu. Rozliczenia z fakturami (automatyczne albo ręczne) wyliczają status płatności faktur.
export default defineObject({
  universalIdentifier: ID.bankTxObject,
  nameSingular: 'bankTransaction',
  namePlural: 'bankTransactions',
  labelSingular: 'Transakcja bankowa',
  labelPlural: 'Transakcje bankowe',
  description: 'Transakcja z wyciągu bankowego (Enable Banking) do weryfikacji płatności faktur.',
  icon: 'IconBuildingBank',
  fields: [
    {
      universalIdentifier: ID.btxExternalId,
      name: 'externalId',
      type: FieldType.TEXT,
      label: 'Identyfikator w banku',
      description: 'Rachunek i entry_reference z banku (albo skrót treści) – klucz deduplikacji kolejnych pobrań.',
      icon: 'IconHash',
    },
    {
      universalIdentifier: ID.btxBookingDate,
      name: 'bookingDate',
      type: FieldType.DATE,
      label: 'Data księgowania',
      icon: 'IconCalendar',
    },
    {
      universalIdentifier: ID.btxValueDate,
      name: 'valueDate',
      type: FieldType.DATE,
      label: 'Data waluty',
      icon: 'IconCalendarEvent',
    },
    {
      universalIdentifier: ID.btxDirection,
      name: 'direction',
      type: FieldType.SELECT,
      label: 'Kierunek',
      icon: 'IconArrowsExchange',
      options: [...BANK_DIRECTION_OPTIONS],
    },
    {
      universalIdentifier: ID.btxAmount,
      name: 'amount',
      type: FieldType.CURRENCY,
      label: 'Kwota',
      icon: 'IconCash',
    },
    {
      universalIdentifier: ID.btxCounterpartyName,
      name: 'counterpartyName',
      type: FieldType.TEXT,
      label: 'Kontrahent',
      icon: 'IconUser',
      isSearchable: true,
    },
    {
      universalIdentifier: ID.btxCounterpartyAccount,
      name: 'counterpartyAccount',
      type: FieldType.TEXT,
      label: 'Rachunek kontrahenta',
      icon: 'IconBuildingBank',
      isSearchable: true,
    },
    {
      universalIdentifier: ID.btxRemittance,
      name: 'remittanceInformation',
      type: FieldType.TEXT,
      label: 'Tytuł',
      icon: 'IconTextCaption',
      isSearchable: true,
    },
    {
      universalIdentifier: ID.btxAccountIban,
      name: 'accountIban',
      type: FieldType.TEXT,
      label: 'Nasz rachunek',
      icon: 'IconWallet',
    },
    {
      universalIdentifier: ID.btxMatchStatus,
      name: 'matchStatus',
      type: FieldType.SELECT,
      label: 'Dopasowanie',
      description:
        'Jak transakcja została rozliczona: automatycznie przy pobraniu wyciągu albo ręcznie w panelu "Rozlicz przelew".',
      icon: 'IconLink',
      options: [...MATCH_STATUS_OPTIONS],
      defaultValue: `'${MATCH_STATUS.UNMATCHED}'`,
    },
    {
      universalIdentifier: ID.btxPaymentPurpose,
      name: 'paymentPurpose',
      type: FieldType.SELECT,
      label: 'Cel płatności',
      description:
        'Na co poszła transakcja: faktura albo wydatek bez faktury (wynagrodzenia, ZUS, urząd skarbowy). ' +
        'Pusty, gdy transakcja jest nieprzypisana.',
      icon: 'IconTarget',
      options: [...PAYMENT_PURPOSE_OPTIONS],
    },
    {
      universalIdentifier: ID.btxEmployee,
      name: 'employee',
      type: FieldType.RELATION,
      label: 'Pracownik',
      description: 'Pracownik, którego dotyczy wynagrodzenie (cel płatności "Wynagrodzenia").',
      icon: 'IconUserDollar',
      relationTargetObjectMetadataUniversalIdentifier: ID.employeeObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.empSalaryTransactions,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'employeeId',
      },
    },
    {
      universalIdentifier: ID.btxMatchNote,
      name: 'matchNote',
      type: FieldType.TEXT,
      label: 'Uwagi do dopasowania',
      icon: 'IconInfoCircle',
    },
    {
      universalIdentifier: ID.btxAllocations,
      name: 'allocations',
      type: FieldType.RELATION,
      label: 'Rozliczenia',
      description: 'Faktury opłacone tą transakcją wraz z kwotami; przelew zbiorczy ma kilka rozliczeń.',
      icon: 'IconFileInvoice',
      relationTargetObjectMetadataUniversalIdentifier: ID.allocObject,
      relationTargetFieldMetadataUniversalIdentifier: ID.allocTransaction,
      universalSettings: { relationType: RelationType.ONE_TO_MANY },
    },
  ],
});
