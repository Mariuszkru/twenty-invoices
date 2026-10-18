# Setup

Follow these steps to get your app running locally.

## Prerequisites

- Node.js (version specified in `.nvmrc`)
- Yarn 4
- Docker (to run the local Twenty server)

## Steps

1. Install dependencies:

   ```bash
   yarn install
   ```

   The committed `yarn.lock` pins exact, integrity-checked versions, so this
   resolves nothing from the registry.

2. Start the local Twenty server:

   ```bash
   yarn twenty docker:start
   ```

   Check the server status at any time with `yarn twenty docker:status`.

3. Start the development server and sync your app:

   ```bash
   yarn twenty dev
   ```

4. Open [http://localhost:2020](http://localhost:2020) and log in with the default development credentials: `tim@apple.dev` / `tim@apple.dev`.

## Bank statement (Enable Banking)

1. In the [Enable Banking Control Panel](https://enablebanking.com/cp/applications), register a production application. Restricted mode, which covers only accounts you link yourself, needs no contract.
   - Generate the key outside the browser and upload only the certificate:

     ```bash
     openssl req -new -newkey rsa:4096 -nodes -keyout private.pem -x509 -days 3650 -out certificate.pem -subj "/CN=Faktury KSeF"
     ```

   - Allowed redirect URL: `<CRM_URL>/s/bank/callback`, for example `https://crm.recoop.pl/s/bank/callback`.
   - Activate the application by linking your company account.
2. In the app settings in Twenty, set `CRM_URL`, `ENABLEBANKING_APP_ID`, `ENABLEBANKING_PRIVATE_KEY` (the content of `private.pem`) and `ENABLEBANKING_ASPSP`.
3. Open the Transakcje bankowe view and run the "Połącz konto bankowe (Enable Banking)" command. Click "Połącz z bankiem", log in to the bank and approve access. The bank returns to a page that confirms the connection.
4. Optionally change `BANK_SYNC_TIMES` (default `12:00,15:40,18:00`, Polish time, at most 3).
5. Click "Pobierz teraz" in the same panel to fetch the first statement, or wait for the next scheduled time. The manual fetch works once per day.

Keep `private.pem` out of the repository. Anyone with this key and an active session can read the account history.

## Verifying your setup

- `yarn lint` - Lint the project with oxlint
- `yarn typecheck` - Type-check the project
- `yarn test:unit` - Run unit tests
- `yarn test` - Run integration tests

## Troubleshooting

See the [troubleshooting guide](https://docs.twenty.com/developers/extend/apps/getting-started/troubleshooting) or ask on [Discord](https://discord.gg/cx5n4Jzs57).
