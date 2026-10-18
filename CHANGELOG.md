# Changelog

All notable changes to this application are documented in this file.

## 0.7.5

- A long invoice number starting with a letter (8+ characters, e.g. "SM26-2206292078") also matches when the bank glues letters in front of it ("FVSM26-…"), so such collective refunds split correctly
- A transfer larger than the only recognised invoice allocates just the invoice amount and notes the rest as unallocated, instead of recording an overpayment on the invoice
- "Pobierz teraz" runs the statement fetch immediately and shows the result; queued jobs could use a stale GraphQL schema right after a deploy

## 0.7.4

- Invoices already marked paid stay visible in the "Rozlicz przelew" panel when their amount not yet allocated from the bank equals the transaction amount

## 0.7.3

- The "Rozlicz przelew" panel proposes first the invoices whose remaining amount equals the transaction amount, tagged "ta sama kwota"

## 0.7.2

- The "Rozlicz przelew" panel hides invoices that are already settled (marked paid or with nothing left to pay). They show up when you search by number or tick "Pokaż faktury już zapłacone"; invoices already allocated to the transaction are always shown

## 0.7.1

- The remaining amount used for matching and in the "Rozlicz przelew" panel comes from bank allocations, not from the invoice's "Zapłacono" field. Invoices paid in advance (the field filled from FA(3)) or marked paid by hand can now take the transfer
- The panel also lists invoices already marked paid from the last 180 days, after the open ones, tagged "zapłacona". Allocating the full amount sets the payment date from the bank

## 0.7.0

- New `paymentAllocation` object ("Rozliczenia płatności"): the part of a bank transaction that pays an invoice. One transaction can pay several invoices (collective transfer) and an invoice can still have several payments. It replaces the `invoice` relation on `bankTransaction` and `bankTransactions` on `ksefInvoice` (now `allocations` and `paymentAllocations`). Invoice payment status is the sum of its allocations, skipping ignored transactions
- Collective transfers are recognised automatically when the title contains several invoice numbers and their remaining amounts add up to the transfer amount
- "Rozlicz przelew z fakturami" command on a transaction: a side panel listing open invoices of the same direction and currency, the counterparty's first. Tick invoices, adjust amounts (prefilled with the remaining amount) and save; saving replaces the transaction's allocations and recalculates the affected invoices
- An invoice number starting with a digit now also matches when the bank glues letters in front of it ("NR26/FAAELE/009722")
- Allocations added, changed or removed directly in the CRM recalculate the invoices (`payment-allocation-changed`); marking a transaction "Pominięta" or undoing it recalculates the invoices of its allocations

## 0.6.1

- Transactions are also linked to invoices that were already marked paid (issued in the last 120 days), as a payment trail. Their payment status, amount and date stay unchanged, and an invoice accepts transactions only up to its gross amount. The run summary reports them separately (`linkedToPaid`)
- The invoice number in the title also matches without its letter prefix ("FRA 31/09/2026" for "FV 31/09/2026"), but only when the amount equals the remaining amount
- Card and payment gateway expenses (PayU, Przelewy24, Paynow), where the bank gives no supplier: an exact amount and an invoice issue date within 3 days of the booking match a purchase invoice when exactly one fits. The rule is skipped when the recipient account belongs to a known supplier

## 0.6.0

- Daily bank statement through Enable Banking (`bank-sync` cron, 05:00 UTC). Booked transactions are stored in the new `bankTransaction` object ("Transakcje bankowe"), deduplicated by account and `entry_reference`
- Automatic payment matching: credits to sales invoices, debits to purchase invoices, same currency. An invoice number, KSeF number or KSeF payment id in the title, or an exact remaining amount confirmed by the counterparty account (purchases) or name (sales), sets `paymentStatus`, `paidAmount` and `paidAt` from the sum of assigned transactions. Ambiguous transactions stay unassigned with a `matchNote`; unassigned transactions from the last 60 days are retried on each run
- Assigning a transaction to an invoice by hand, removing it or marking it "Pominięta" recalculates the payment of the affected invoices (`bank-transaction-updated`)
- "Połącz konto bankowe (Enable Banking)" command: a side panel with the consent status, the bank authorization link and a manual fetch. The bank returns to the public `GET /s/bank/callback` route, protected by a one-time `state`
- Rocket.Chat: a daily statement summary, a warning 14 and 3 days before the consent expires, and a message when there is no consent or a run fails
- New app variables `ENABLEBANKING_APP_ID`, `ENABLEBANKING_PRIVATE_KEY`, `ENABLEBANKING_ASPSP`, `ENABLEBANKING_COUNTRY` and the automatic `ENABLEBANKING_SESSION`
- "Transakcje bankowe" and "Nieprzypisane transakcje" views in the Faktury KSeF folder; `bankTransactions` relation on `ksefInvoice`

## 0.5.2

- The "Importuj faktury spoza KSeF (Symfonia)" command is shown in the Faktury KSeF object context instead of the Workspace section
- The import side panel uses Twenty UI styles (buttons, icons, theme tokens for light and dark mode), shows the description in a framed box, and accepts a file by drag and drop or by clicking the drop zone. The selected file name and size are shown, and files other than `.txt` and `.xml` are rejected

## 0.5.1

- `source` has only two values: `KSEF` (KSeF) and `MANUAL` (Import manualny). The import format (enova or Symfonia) is no longer stored on the invoice; it is still returned by `ksef-import-xml` and written to its log. Existing `ENOVA`/`SYMFONIA` invoices were moved to `MANUAL` before the old options were removed

## 0.5.0

- Manual import also reads the Symfonia text exchange format (exported e.g. by Systim, windows-1250). Sales documents carry real line items: name, quantity, unit, unit net price and VAT rate. Cancelled and non-sales documents are skipped. The parser follows the Symfonia "Import specjalny (format 3.0)" spec:
  - a sales correction is recognised by `ObsługujJak` = `FKS`, and the corrected invoice number comes from `NazwaKor`, then the `Rejestr` field `numerKor`
  - the pseudo-rates -1 and -2 are imported as `zw` and `np`
- The file format and encoding are detected from the content, so one command handles both formats; it is renamed "Importuj faktury spoza KSeF (Symfonia, enova)" and accepts `.txt` and `.xml`
- Re-importing an invoice that is already in the CRM, from either format, now refreshes its header and lines from the file instead of skipping it. The payment status is kept, and the person and corrected invoice links are only filled in, never cleared
- New `SYMFONIA` value of `source`

## 0.4.0

- Import no longer sets the payment status from the FA(3) XML (`Zaplacono`, `ZnacznikZaplatyCzesciowej`); every imported invoice stays `UNPAID` until a bank statement or a manual change marks it paid
- Manual import of B2C sales invoices issued outside KSeF: the "Importuj faktury z XML (enova)" command opens a side panel to upload an enova export (Optima offline format, windows-1250); a file may contain many invoices
- `ksef-import-xml` HTTP function (`POST /s/ksef/import-xml`) reads the sales VAT register (`REJESTRY_SPRZEDAZY_VAT`). It stores each invoice as a `COMPLETE` sale without a KSeF number, with one line per VAT rate, the due date and the payment method. A correction is linked to the corrected invoice by number. Invoices already imported are skipped
- `person` relation on `ksefInvoice`: the B2C buyer is matched to a CRM person by email, then by first and last name in either order, and only when exactly one person matches
- `source` field on `ksefInvoice` (`KSEF` / `ENOVA`, default `KSEF`); `ksef-reprocess-xml` skips enova invoices so they are never sent back to `PENDING`

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
