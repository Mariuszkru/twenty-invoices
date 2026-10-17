import { defineApplication, FieldType } from 'twenty-sdk/define';

import { ID } from 'src/constants/ids';
import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    KSEF_TOKEN: {
      universalIdentifier: ID.varKsefToken,
      label: 'Token KSeF',
      description:
        'Token wygenerowany w Aplikacji Podatnika KSeF z uprawnieniem do odczytu faktur (InvoiceRead).',
      isSecret: true,
      isRequired: true,
    },
    KSEF_NIP: {
      universalIdentifier: ID.varKsefNip,
      label: 'NIP firmy',
      description: 'NIP podatnika (10 cyfr), w którego kontekście pobierane są faktury.',
      isRequired: true,
    },
    KSEF_ENV: {
      universalIdentifier: ID.varKsefEnv,
      label: 'Środowisko KSeF',
      description: 'Testowe (domyślnie), przedprodukcyjne (demo) albo produkcyjne.',
      type: FieldType.SELECT,
      options: [
        { label: 'Testowe', value: 'test' },
        { label: 'Demo', value: 'demo' },
        { label: 'Produkcyjne', value: 'prod' },
      ],
      value: 'test',
    },
    KSEF_SESSION: {
      universalIdentifier: ID.varKsefSession,
      label: 'Sesja KSeF (automatyczna)',
      description:
        'Refresh token KSeF zapisywany przez synchronizację, żeby nie logować się przy każdym przebiegu. Nie edytuj; wyczyszczenie wymusza ponowne logowanie.',
      isSecret: true,
    },
  },
});
