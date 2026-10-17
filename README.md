# Faktury KSeF

A Twenty app that imports every sales and purchase invoice from the Polish National e-Invoicing System (KSeF API 2.0) into the CRM. Each invoice line is its own record, so lines can later be assigned to delivered services to compute real margin.

## Features

- Incremental sync of sales (Subject1) and purchase (Subject2) invoices. It runs every 15 minutes and on demand from the command menu ("Synchronizuj faktury z KSeF").
- `ksefInvoice` object: header data from KSeF metadata. It links to the matching Company by NIP and to the invoice it corrects, and stores the original FA(3) XML in a file field.
- `ksefInvoiceLine` object: one record per `FaWiersz` with quantity, prices, VAT rate and codes. It also stores `marginEffectPln`, a signed net amount in PLN: sales count as positive and purchases as negative. A "before correction" line flips its sign. Foreign currencies use the rate printed on the invoice, or the NBP rate from the previous business day.
- Fields ready for margin work: `costCategory` and `allocationStatus`, plus the "Koszty do przypisania" (costs to assign) view.
- The app settings page shows a health banner with the result of the last sync.

## How the sync works

KSeF allows only about 64 XML downloads per hour in production, so each run has two phases:

1. **Metadata**: `POST /invoices/query/metadata` by `PermanentStorage` date, ascending, up to the High Water Mark. New invoices appear right away with status `PENDING`.
2. **Details**: download the XML of up to 14 `PENDING` invoices per run, within a 60/h budget kept in the app KV store. The run creates the lines, attaches the XML and sets status `COMPLETE`. A KSeF or parse error sets status `ERROR` with a message. To retry the invoice, set its status back to `PENDING`.

The first run looks back 90 days. Sync cursors, rate counters, a lock and the last run summary live in the app key-value store.

## Configuration

Set these app variables in Twenty:

| Variable | Meaning |
| - | - |
| `KSEF_TOKEN` | KSeF token with the `InvoiceRead` permission (secret) |
| `KSEF_NIP` | Taxpayer NIP whose invoices are fetched |
| `KSEF_ENV` | `test` (default), `demo` or `prod` |

Company matching uses the `company.nip` field from the `regon-nip` app. When that field is missing, invoices keep the counterparty NIP and name as text only.

## Getting started

See [SETUP.md](SETUP.md). Commands: `yarn lint`, `yarn typecheck`, `yarn test:unit`.

## Changelog

Notable changes are documented in [CHANGELOG.md](CHANGELOG.md).
