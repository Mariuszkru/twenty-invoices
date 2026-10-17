# CLAUDE.md

## What this is

`ksef-invoices` ("Faktury KSeF") is a Twenty app (twenty-sdk 2.48.0, scaffolded with `twenty app init`). It imports sales and purchase invoices from KSeF API 2.0, with one record per invoice line, so lines can later be allocated to delivered services for real margin. User-facing strings and code comments are in Polish; keep that convention.

## Commands

- `yarn lint`, `yarn typecheck`, `yarn test:unit` (vitest, `src/**/*.test.ts`). Single test: `yarn vitest run --config vitest.unit.config.ts <path> -t "<name>"`
- Offline build check: `npx twenty@2.48.0 app build -r local` (uploads nothing)
- **The CLI's default remote is `recoop-me` (production, https://crm.recoop.pl).** Always pass `-r local` for development. Never run `twenty app dev`/`apply` against production without explicit approval.

## Architecture

- `src/lib/ksef/`: KSeF client. `http.ts` (429/`Retry-After`, 5xx retries), `auth.ts` (token auth: challenge, RSA-OAEP SHA-256 `token|timestampMs`, poll, redeem), `invoices.ts` (incremental metadata by `PermanentStorage` up to HWM, max 99-day windows, handles `isTruncated`), `fa3-parser.ts` (FA(3) lines).
- `src/lib/ksef/session.ts`: the refresh token lives in the secret app variable `KSEF_SESSION` (JSON bound to NIP + KSeF token fingerprint), written via `updateOneApplicationVariable` (needs the `APPLICATIONS` role flag). Missing, expired or rejected session falls back to full token auth.
- `src/lib/sync/run-sync.ts`: two-phase sync. Metadata creates `PENDING` headers. XML download is budgeted (`rate-budget.ts`: 60/h, 14/min, kept in KV) and creates lines, then sets `COMPLETE`/`ERROR`. Cursors, lock and last-run summary live in the app KV store (`KV_KEYS`).
- `src/lib/sync/store.ts`: `InvoiceStore` interface. `twenty-store.ts` implements it with `CoreApiClient({ runAs: 'application' })` (loosely typed until the client is generated). Tests use an in-memory store and the fake KSeF in `src/lib/__tests__/fake-ksef.ts`, so tests never hit real APIs.
- `marginEffectPln` sign convention: sale +, purchase −, `StanPrzed` line flipped.
- Company matching relies on the `company.nip` field from the separate `regon-nip` app. `findCompanyIdsByNip` returns `null` when that field does not exist.
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

It's highly recommended to create new app entities using `yarn twenty dev:add`. These are the options:

| Entity type          | Command                                  | Generated file                        |
| -------------------- | ---------------------------------------- | ------------------------------------- |
| Object               | `yarn twenty dev:add object`             | `src/objects/<name>.ts`               |
| Field                | `yarn twenty dev:add field`              | `src/fields/<name>.ts`                |
| Logic function       | `yarn twenty dev:add logicFunction`      | `src/logic-functions/<name>.ts`       |
| Front component      | `yarn twenty dev:add frontComponent`     | `src/front-components/<name>.tsx`     |
| Role                 | `yarn twenty dev:add role`               | `src/roles/<name>.ts`                 |
| Skill                | `yarn twenty dev:add skill`              | `src/skills/<name>.ts`                |
| Agent                | `yarn twenty dev:add agent`              | `src/agents/<name>.ts`                |
| View                 | `yarn twenty dev:add view`               | `src/views/<name>.ts`                 |
| Navigation menu item | `yarn twenty dev:add navigationMenuItem` | `src/navigation-menu-items/<name>.ts` |
| Page layout          | `yarn twenty dev:add pageLayout`         | `src/page-layouts/<name>.ts`          |
| Page layout tab      | `yarn twenty dev:add pageLayoutTab`      | `src/page-layout-tabs/<name>.ts`      |
| Command menu item    | `yarn twenty dev:add commandMenuItem`    | `src/command-menu-items/<name>.ts`    |
| View field           | `yarn twenty dev:add viewField`          | `src/view-fields/<name>.ts`           |
| Connection provider  | `yarn twenty dev:add connectionProvider` | `src/connection-providers/<name>.ts`  |

This helps automatically generate required IDs etc.
