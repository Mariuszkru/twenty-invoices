# CLAUDE.md

## What this is

`ksef-invoices` ("Faktury KSeF") is a Twenty app (twenty-sdk 2.51.1, scaffolded with `twenty app init`). It imports sales and purchase invoices from KSeF API 2.0, with one record per invoice line, so lines can later be allocated to delivered services for real margin. User-facing strings and code comments are in Polish; keep that convention.

## Commands

- `yarn lint`, `yarn typecheck`, `yarn test:unit` (vitest, `src/**/*.test.ts`). Single test: `yarn vitest run --config vitest.unit.config.ts <path> -t "<name>"`
- Twenty CLI: the global `twenty` command (2.51+). Do not use the deprecated `yarn twenty ...` bundled with twenty-sdk.
- Offline build check: `twenty app build` (uploads nothing). Preview changes: `twenty app plan -r <remote>`. Deploy: `twenty app apply -r <remote> --no-delete`
- **The CLI's default remote is `recoop-me` (production, https://crm.recoop.pl).** Always pass `-r local` for development. Never run `twenty app dev`/`apply` against production without explicit approval.

## Architecture

- `src/lib/ksef/`: KSeF client. `http.ts` (429/`Retry-After`, 5xx retries), `auth.ts` (token auth: challenge, RSA-OAEP SHA-256 `token|timestampMs`, poll, redeem), `invoices.ts` (incremental metadata by `PermanentStorage` up to HWM, max 99-day windows, handles `isTruncated`), `fa3-parser.ts` (FA(3) lines).
- `src/lib/ksef/session.ts`: the refresh token lives in the secret app variable `KSEF_SESSION` (JSON bound to NIP + KSeF token fingerprint), written via `updateOneApplicationVariable` (needs the `APPLICATIONS` role flag). Missing, expired or rejected session falls back to full token auth.
- `src/lib/sync/run-sync.ts`: two-phase sync. Metadata creates `PENDING` headers. XML download is budgeted (`rate-budget.ts`: 60/h, 14/min, kept in KV) and creates lines, then sets `COMPLETE`/`ERROR`. Cursors, lock and last-run summary live in the app KV store (`KV_KEYS`).
- `src/lib/sync/store.ts`: `InvoiceStore` interface. `twenty-store.ts` implements it with `CoreApiClient({ runAs: 'application' })` (loosely typed until the client is generated). Tests use an in-memory store and the fake KSeF in `src/lib/__tests__/fake-ksef.ts`, so tests never hit real APIs.
- `src/lib/bank/`: Enable Banking bank statement. `enablebanking-http.ts` (JWT RS256 with `kid` = app ID, 429/5xx retries), `consent.ts` (`POST /auth` + `POST /sessions`, session in the secret variable `ENABLEBANKING_SESSION`), `match.ts` (pure matching, never guesses between candidates), `payment.ts` (invoice payment = sum of `paymentAllocation` records), `allocate.ts` (manual split panel), `run-bank-sync.ts` (daily run, cursors and lock in KV `bank:*`). The callback route `/s/bank/callback` is public and protected by a one-time `state` in KV. Response headers are allow-listed, so it returns an HTML page instead of a redirect. Tests use `src/lib/__tests__/fake-enablebanking.ts`.
- `marginEffectPln` sign convention: sale +, purchase −, `StanPrzed` line flipped.
- Company matching relies on the `company.nip` field from the separate `regon-nip` app. `findCompanyIdsByNip` returns `null` when that field does not exist.
- Rocket.Chat: every message sent to Rocket.Chat must have link previews disabled (`parseUrls: false` in the webhook payload). Send them only through `createRocketChatSender` in `src/lib/notify/rocketchat.ts`, which sets this flag, and never post to the webhook directly.
- IDs: every `universalIdentifier` is in `src/constants/ids.ts` (view field/filter IDs are inline in `src/views/`). They are fixed once deployed.

## Base documentation

- Getting started:
  - https://docs.twenty.com/developers/extend/apps/getting-started/quick-start.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/concepts.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/project-structure.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/local-server.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/scaffolding.md
  - https://docs.twenty.com/developers/extend/apps/getting-started/troubleshooting.md
- Config:
  - https://docs.twenty.com/developers/extend/apps/config/overview.md
  - https://docs.twenty.com/developers/extend/apps/config/application.md
  - https://docs.twenty.com/developers/extend/apps/config/roles.md
  - https://docs.twenty.com/developers/extend/apps/config/install-hooks.md
  - https://docs.twenty.com/developers/extend/apps/config/public-assets.md
- Data:
  - https://docs.twenty.com/developers/extend/apps/data/overview.md
  - https://docs.twenty.com/developers/extend/apps/data/objects.md
  - https://docs.twenty.com/developers/extend/apps/data/extending-objects.md
  - https://docs.twenty.com/developers/extend/apps/data/relations.md
- Logic:
  - https://docs.twenty.com/developers/extend/apps/logic/overview.md
  - https://docs.twenty.com/developers/extend/apps/logic/logic-functions.md
  - https://docs.twenty.com/developers/extend/apps/logic/skills-and-agents.md
  - https://docs.twenty.com/developers/extend/apps/logic/connections.md
- Layout:
  - https://docs.twenty.com/developers/extend/apps/layout/overview.md
  - https://docs.twenty.com/developers/extend/apps/layout/views.md
  - https://docs.twenty.com/developers/extend/apps/layout/navigation-menu-items.md
  - https://docs.twenty.com/developers/extend/apps/layout/page-layouts.md
  - https://docs.twenty.com/developers/extend/apps/layout/front-components.md
  - https://docs.twenty.com/developers/extend/apps/layout/command-menu-items.md
- Operations:
  - https://docs.twenty.com/developers/extend/apps/operations/overview.md
  - https://docs.twenty.com/developers/extend/apps/operations/cli.md
  - https://docs.twenty.com/developers/extend/apps/operations/testing.md
  - https://docs.twenty.com/developers/extend/apps/operations/publishing.md
- Rich app example: https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/examples/postcard

## UUID requirement

- All generated UUIDs must be valid UUID v4.

## Common Pitfalls

- Creating a view without a navigationMenuItem associated. This will make the view available on the left sidebar.
- Creating a front-end component that has a scroll instead of being responsive to its fixed widget height and width, unless it is specifically meant to be used in a canvas tab.

## Best practice

Create new app entities with `twenty app add` where it is supported. It generates the required IDs:

| Entity type     | Command                                                | Generated file                    |
| --------------- | ------------------------------------------------------ | --------------------------------- |
| Object          | `twenty app add object --name <name>`                  | `src/objects/<name>.ts`           |
| Field           | `twenty app add field --name <name> --type <TYPE>`     | `src/fields/<name>.ts`            |
| Logic function  | `twenty app add logic-function --name <name>`          | `src/logic-functions/<name>.ts`   |
| Front component | `twenty app add front-component --name <name>`         | `src/front-components/<name>.tsx` |

Other entities (views, navigation menu items, roles, page layouts, command menu items and so on) are written by hand, following the existing files in `src/`. Put new IDs in `src/constants/ids.ts` as valid UUID v4.

This helps automatically generate required IDs etc.
