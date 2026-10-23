# Faktury KSeF

A Twenty app that imports every sales and purchase invoice from the Polish National e-Invoicing System (KSeF API 2.0) into the CRM. Each invoice line is its own record, so lines can later be assigned to delivered services to compute real margin.

## Features

- Incremental sync of sales (Subject1) and purchase (Subject2) invoices. It runs every 15 minutes and on demand from the command menu ("Synchronizuj faktury z KSeF").
- `ksefInvoice` object: header data from KSeF metadata. It links to the matching Company by NIP and to the invoice it corrects, and stores the original FA(3) XML in a file field.
- `ksefInvoiceLine` object: one record per `FaWiersz` with quantity, prices, VAT rate and codes. It also stores `marginEffectPln`, a signed net amount in PLN: sales count as positive and purchases as negative. A "before correction" line flips its sign. Foreign currencies use the rate printed on the invoice, or the NBP rate from the previous business day.
- Fields ready for margin work: `costCategory` and `allocationStatus`, plus the "Koszty do przypisania" (costs to assign) view.
- Projects with margin. See [Projects](#projects).
- The app settings page shows a health banner with the result of the last sync.
- Daily bank statement through Enable Banking (PSD2): incoming payments are matched to sales invoices and outgoing payments to purchase invoices. A confident match marks the invoice paid. See [Bank statement](#bank-statement).

## How the sync works

KSeF allows only about 64 XML downloads per hour in production, so each run has two phases:

1. **Metadata**: `POST /invoices/query/metadata` by `PermanentStorage` date, ascending, up to the High Water Mark. New invoices appear right away with status `PENDING`.
2. **Details**: download the XML of up to 14 `PENDING` invoices per run, within a 60/h budget kept in the app KV store. The run creates the lines, attaches the XML and sets status `COMPLETE`. A KSeF or parse error sets status `ERROR` with a message. To retry the invoice, set its status back to `PENDING`.

The first run looks back 90 days. Sync cursors, rate counters, a lock and the last run summary live in the app key-value store.

## Bank statement

The `bank-sync` function fetches the statement at the times set in `BANK_SYNC_TIMES` (Polish time, at most 3 a day, default `12:00,15:40,18:00`, 30 minutes after the PKO BP incoming Elixir sessions). Its cron wakes every 10 minutes and calls the bank only when a configured time has passed. "Pobierz teraz" in the bank panel adds one manual fetch per day, so the total stays within the PSD2 limit of 4 unattended requests per day.

1. It fetches booked transactions (`BOOK`) of every account in the consent. The window starts 5 days before the previous run, because banks book late. The first run looks back 30 days.
2. Each transaction becomes a `bankTransaction` record, deduplicated by account and `entry_reference`. Matches are stored as `paymentAllocation` records (transaction, invoice, amount), so one transfer can pay several invoices.
3. A transaction is matched to an open invoice (`UNPAID` or `PARTIAL`) of the same currency and direction. Credits match sales, debits match purchases. The rules, in order:
   - The invoice number, KSeF number or KSeF payment id in the title is enough. Several numbers whose remaining amounts add up to the transfer make a collective payment split across those invoices.
   - The number without its letter prefix ("FRA 31/09/2026" for "FV 31/09/2026") matches when the amount equals the remaining amount.
   - Without a number, the amount must equal the remaining amount, and the counterparty must also match: the bank account for purchases, the name for sales.
   - Card and gateway expenses match a purchase invoice by exact amount and an issue date within 3 days of the booking.
   - With several candidates the transaction stays unassigned, with a note saying why.

   When no open invoice fits, the same rules run against invoices already marked paid in the last 120 days. A match only links the transaction as a payment trail and does not change the invoice.
4. The payment status, paid amount and payment date of the invoice come from the sum of its allocations.
5. Unassigned transactions from the last 60 days are matched again, in case the invoice arrived after the payment.

The "Rozlicz przelew z fakturami" command on a transaction opens a panel to split it across one or more invoices by hand. Saving or editing allocations directly recalculates the payment status of the affected invoices. "Dopasowanie" says how a transaction was settled (automatically, by hand, or not yet), and "Cel płatności" says what it paid for: an invoice, salaries, ZUS or the tax office. The "Nieprzypisane transakcje" view lists what is left to review.

The bank consent lasts at most 180 days. Rocket.Chat gets a warning 14 days and 3 days before it expires, and a message when a run has no consent.

## Projects

A `project` has a client (a company or a person, exactly one), a status and the computed revenue, cost, margin and margin %. Invoice lines are pinned to it through `projectEntry` records, as revenue or cost:

- An empty type follows the invoice direction (sale → revenue, purchase → cost); the pin panel always uses that type. An empty amount takes the part of the line not yet pinned anywhere, so a line can be split across several projects.
- Amounts are net, in the invoice currency, and signed: the "before correction" row of a credit note is negative. They are converted to PLN with the rate the sync used for the line (invoice or NBP). An entry without a rate or in another currency is left out of the margin and gets a note.
- Revenue and cost are the sums of PLN amounts by type, margin = revenue − cost, margin % = margin / revenue (empty at zero revenue). The `project-entry-changed` trigger recomputes them from scratch on every change, together with the line's "Przypisanie do usługi" status and the over-allocation check.
- The "Przypnij pozycje faktur" panel (on the project entry list and on a project) pins several lines at once. It searches by invoice number, KSeF number, counterparty or line name and rejects amounts above a line's unallocated rest.
- Twenty cannot reject a save synchronously, so `project-changed` reverts a client set to both a company and a person right after saving and explains it in "Uwagi". A project without a client gets the note "Brak klienta".

## Configuration

Set these app variables in Twenty:

| Variable | Meaning |
| - | - |
| `KSEF_TOKEN` | KSeF token with the `InvoiceRead` permission (secret) |
| `KSEF_NIP` | Taxpayer NIP whose invoices are fetched |
| `KSEF_ENV` | `test` (default), `demo` or `prod` |
| `ENABLEBANKING_APP_ID` | Enable Banking application ID. Empty turns the bank statement off |
| `ENABLEBANKING_PRIVATE_KEY` | Private RSA key (PEM) of the Enable Banking application (secret) |
| `ENABLEBANKING_ASPSP` | Bank name exactly as Enable Banking lists it |
| `ENABLEBANKING_COUNTRY` | Bank country, default `PL` |
| `BANK_SYNC_TIMES` | Statement fetch times, Polish time, comma-separated, at most 3 (default `12:00,15:40,18:00`) |
| `ENABLEBANKING_SESSION` | Written by the app after the bank authorization (secret). Do not edit |

Company matching uses the `company.nip` field from the `regon-nip` app. When that field is missing, invoices keep the counterparty NIP and name as text only.

## Getting started

See [SETUP.md](SETUP.md). Commands: `yarn lint`, `yarn typecheck`, `yarn test:unit`.

## Changelog

Notable changes are documented in [CHANGELOG.md](CHANGELOG.md).
