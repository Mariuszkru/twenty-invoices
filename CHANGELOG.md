# Changelog

All notable changes to this application are documented in this file.

## 0.3.1

- Disable link previews in Rocket.Chat messages (`parseUrls: false`)

## 0.3.0

- Rocket.Chat notifications through an incoming webhook (`ROCKETCHAT_WEBHOOK_URL`, links built from `CRM_URL`)
- New purchase invoices: one message per sync run for invoices stored in KSeF within the last 3 days, sent once per invoice (`newInvoiceNotifiedAt`); a failed send is retried on the next run
- `payment-reminders` daily cron (06:00 UTC): unpaid purchase and sales invoices due in `PAYMENT_REMINDER_DAYS` days (default 3 and 1), at most one message per day; overdue invoices are left out until bank statement matching exists

## 0.2.0

- Import payment terms from FA(3) `Platnosc`: due date (explicit date, or computed from the relative term description), payment status at issue time (paid / partially paid), payment date and amount, payment method, bank account and KSeF payment id (IPKSeF)
- A payment status set manually or by later bank matching is never downgraded by a re-import
- "Do zapłaty" view: unpaid purchase invoices sorted by due date
- `ksef-reprocess-xml` function re-parses the XML stored in the CRM without calling KSeF; invoices without a stored XML go back to `PENDING` to be downloaded again

## 0.1.3

- Keep the KSeF refresh token in the secret `KSEF_SESSION` app variable and refresh the access token instead of a full authentication on every run (5 auth requests down to 1); the app role gains the `APPLICATIONS` permission to write it

## 0.1.2

- Derive line net amount from gross for invoices calculated from gross (only `P_9B`/`P_11A`), reconciled with the header `P_13_x` totals; such lines were imported with net 0

## 0.1.1

- Grant the app role the `UPLOAD_FILE` permission so the invoice XML can be stored

## 0.1.0

- Initial application scaffolded with `twenty app init` (twenty-sdk 2.48.0)
- `ksefInvoice` and `ksefInvoiceLine` objects with Company relations, a unique KSeF number index and views for sales, purchases, revenue lines and unassigned costs
- Two-phase incremental KSeF API 2.0 sync (metadata to HWM, then rate-limited XML download) on a 15-minute cron and from the command menu
- FA(3) line parser with correction (`StanPrzed`) handling, signed PLN margin effect and NBP fallback exchange rate
- Relinking of imported invoices when a company gets a matching NIP
- Health check that reports the last sync result
