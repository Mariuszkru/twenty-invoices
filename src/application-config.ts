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
    ROCKETCHAT_WEBHOOK_URL: {
      universalIdentifier: ID.varRocketChatWebhook,
      label: 'Webhook Rocket.Chat',
      description:
        'Adres webhooka przychodzącego (Administracja → Integracje). Puste = bez powiadomień o nowych fakturach i terminach płatności.',
      isSecret: true,
    },
    ROCKETCHAT_USER_ID: {
      universalIdentifier: ID.varRocketChatUserId,
      label: 'Rocket.Chat: identyfikator użytkownika',
      description:
        'User ID z Personal Access Token (Mój profil → Personal Access Tokens). Razem z tokenem i webhookiem włącza tworzenie kanału dla każdego nowego projektu.',
    },
    ROCKETCHAT_AUTH_TOKEN: {
      universalIdentifier: ID.varRocketChatAuthToken,
      label: 'Rocket.Chat: token API',
      description:
        'Personal Access Token użytkownika z uprawnieniem do tworzenia kanałów publicznych. Puste = projekty bez kanałów.',
      isSecret: true,
    },
    CRM_URL: {
      universalIdentifier: ID.varCrmUrl,
      label: 'Adres CRM',
      description: 'Adres tego CRM (np. https://crm.firma.pl) do linków w powiadomieniach.',
    },
    PAYMENT_REMINDER_DAYS: {
      universalIdentifier: ID.varReminderDays,
      label: 'Przypomnienia o płatności (dni przed terminem)',
      description: 'Lista dni przed terminem, oddzielona przecinkami.',
      value: '3,1',
    },
    ENABLEBANKING_APP_ID: {
      universalIdentifier: ID.varEbAppId,
      label: 'Enable Banking: identyfikator aplikacji',
      description:
        'Application ID z Control Panel Enable Banking. Puste = bez pobierania wyciągów bankowych.',
    },
    ENABLEBANKING_PRIVATE_KEY: {
      universalIdentifier: ID.varEbPrivateKey,
      label: 'Enable Banking: klucz prywatny',
      description: 'Klucz RSA (PEM) aplikacji Enable Banking, którym podpisywane są zapytania (JWT RS256).',
      isSecret: true,
    },
    ENABLEBANKING_ASPSP: {
      universalIdentifier: ID.varEbAspsp,
      label: 'Enable Banking: bank',
      description: 'Nazwa banku dokładnie tak, jak na liście Enable Banking (np. mBank, PKO BP).',
    },
    ENABLEBANKING_COUNTRY: {
      universalIdentifier: ID.varEbCountry,
      label: 'Enable Banking: kraj banku',
      description: 'Dwuliterowy kod kraju banku.',
      value: 'PL',
    },
    BANK_SYNC_TIMES: {
      universalIdentifier: ID.varBankSyncTimes,
      label: 'Enable Banking: godziny pobierania wyciągu',
      description:
        'Godziny automatycznego pobierania w czasie polskim, oddzielone przecinkami, najwyżej 3 (np. 30 min po sesjach Elixir). Razem z ręcznym pobraniem raz dziennie mieści się w limicie 4 zapytań PSD2.',
      value: '12:00,15:40,18:00',
    },
    ENABLEBANKING_SESSION: {
      universalIdentifier: ID.varEbSession,
      label: 'Enable Banking: sesja (automatyczna)',
      description:
        'Zgoda na odczyt rachunku zapisywana po autoryzacji w banku. Nie edytuj; wyczyszczenie wymaga ponownego połączenia z bankiem.',
      isSecret: true,
    },
  },
});
