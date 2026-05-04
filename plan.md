# Personal Finance Plan

## Purpose

Build a public, data-free personal finance app that helps users understand real spending better
than bank overviews. The app should handle cases where bank transactions do not directly equal
economic spending: credit-card repayments, reimbursements, joint-account splits, transfers, salary
allocation, and budget tracking.

The repository can be public, but real financial data must never be committed. Users should run the
app locally or self-host it so their data remains under their control.

## Product direction

This should be an interactive review workspace, not a CLI-first ledger.

Primary user flow:

1. Open the app.
2. Import Monzo, Amex, and joint-account exports.
3. Review transactions the app cannot classify confidently.
4. Confirm or correct transfers, credit-card repayments, reimbursements, and split spending.
5. See monthly views of cashflow, budget remaining, net personal spend, joint spend, and credit-card
   liability.
6. Reuse learned rules on future imports.

## Current stack decision

| Layer         | Choice                    | Reason                                                           |
| ------------- | ------------------------- | ---------------------------------------------------------------- |
| Frontend      | Vite + React + TypeScript | Interactive app without Next.js complexity.                      |
| UI foundation | Tailwind CSS + shadcn/ui  | Source-owned components with semantic design tokens.             |
| Routing       | TanStack Router           | Typed routing with a small framework surface.                    |
| Server state  | TanStack Query            | Clean loading/error/refetch behavior for API data.               |
| Tables        | TanStack Table            | Transaction review will need tables, filtering, and sorting.     |
| Backend       | Hono                      | Small local/self-hosted API for imports, rules, and persistence. |
| Shared logic  | `packages/core`           | Keeps finance rules testable and reusable outside the UI.        |
| Database      | SQLite later              | Local/self-hosted persistence with a simple operational model.   |
| Query layer   | Drizzle ORM + Drizzle Kit | Schema-first TypeScript model with generated SQLite migrations.  |
| SQLite driver | better-sqlite3            | Simple, mature local file driver for Node/self-hosted use.       |
| Validation    | Zod                       | Runtime validation for imported files and API boundaries.        |
| Tests         | Vitest                    | Fast unit tests for rules, importers, and UI behavior.           |
| Quality tools | Biome                     | One fast formatter/linter for agent and human iteration.         |
| Tool versions | mise                      | Pin Node/pnpm consistently without replacing package scripts.    |

SQLite should run behind the Hono API, not directly in the browser. The browser app talks to the
API, and the API owns the database file.

Use mise lightly to standardize local tooling. It should pin Node and pnpm versions, while
`package.json` scripts remain the source of truth for development commands.

## Repository shape

```text
apps/
  web/        React app and browser-only UI state
  server/     Hono API, persistence, imports, migrations
packages/
  core/       Pure domain model, rules, import normalization, report calculations
fixtures/     Fake committed data for tests, demos, and docs
storage/      Local private storage, ignored by git
```

### Target source layout

The folder structure should keep domain logic independent from persistence and UI concerns. Start
with a few explicit modules, then add feature folders only when behavior exists.

```text
apps/
  server/
    drizzle/                         Generated SQL migrations and Drizzle snapshots
    src/
      app.ts                         Hono app factory used by dev server and tests
      index.ts                       Local server entrypoint
      config/
        env.ts                       Server config and default database path
      db/
        client.ts                    Drizzle/better-sqlite3 connection factory
        migrate.ts                   Programmatic migration runner
        schema.ts                    Drizzle table definitions
      routes/
        health.ts                    Health route
        transactions.ts              Transaction/review read routes
      repositories/
        transactions-repository.ts   Database access for transactions and review items
      services/
        transactions-service.ts      Application orchestration over repositories/core rules
      test/
        database.ts                  Temp database helpers for Vitest

  web/
    components.json                  shadcn/ui configuration for the web app
    src/
      main.tsx                       Browser entrypoint
      app/
        App.tsx                      Top-level providers
        router.tsx                   TanStack Router setup
      api/
        client.ts                    Fetch helper and shared error handling
        transactions.ts              API calls and Zod response parsing
      features/
        dashboard/
          DashboardPage.tsx
          summary-cards.tsx
        review/
          ReviewInboxPage.tsx
          review-table.tsx
      shared/
        format/
          money.ts                   Browser formatting helpers
      components/
        ui/                          shadcn/ui source components
      lib/
        utils.ts                     `cn()` and shared UI utilities
      styles.css
      test/
        setup.ts

packages/
  core/
    src/
      index.ts                       Public exports only
      money/
        amount.ts                    Minor-unit money helpers
      transactions/
        kinds.ts                     Transaction kind constants/types
        ledger-entry.ts              Canonical ledger entry model
        review.ts                    Review status and derived review model
      imports/
        source.ts                    Import source types
        normalize.ts                 Raw-to-canonical normalization contracts
      rules/
        spending.ts                  Spend/reimbursement/transfer classification helpers
      reports/
        monthly-summary.ts           Pure report calculations
      fixtures/
        example-transactions.ts      Fake fixtures used by fixtures/tests only
```

Initial setup should create the structural files that are immediately useful, not every future
feature module. Empty directories should not be added unless they contain a real file. The first
persistence implementation should introduce `apps/server/src/db/*`, `apps/server/src/test/*`,
Drizzle migrations, and thin repository/service modules. The first UI cleanup should split the
current single `App.tsx` into `app/`, `api/`, and `features/` once the API shape is stable.

### Initial setup commit scope

The initial commit should contain the scaffold and decisions needed to build safely:

- pnpm workspace wiring for `apps/web`, `apps/server`, and `packages/core`.
- mise, Biome, TypeScript, Vitest, and root verification scripts.
- Tailwind CSS and shadcn/ui configuration for the web app.
- Agent instructions and installed skill lockfiles.
- Privacy guardrails: ignored `storage/`, fake fixtures only, and documentation that real financial
  data must stay local.
- The current placeholder Hono API, React review workspace, and pure core transaction rules.
- This plan with the chosen stack: Drizzle ORM, Drizzle Kit, `better-sqlite3`, Hono, TanStack tools,
  Tailwind CSS, shadcn/ui, Zod, Vitest, Biome, and mise.

Do not include generated SQLite databases, real exports, Docker files, browser E2E tests, or
full Drizzle migrations in the initial setup commit unless they are part of the first persistence
implementation.

## Scope

### V1

- Import CSV files from fake fixtures first, then Monzo and Amex.
- Normalize imported rows into a canonical transaction model.
- Store transactions locally.
- Maintain a review inbox for uncertain classification.
- Model credit-card payments as transfers/liability settlement rather than new spending.
- Model reimbursements as reductions to net personal cost.
- Model joint-account and shared spending with configurable split rules.
- Produce monthly summary views for cashflow, spend, budgets, and review status.

### Later

- Net worth snapshots.
- Investments, pensions, and asset valuation.
- Bank API integrations.
- Native desktop packaging.
- Private hosted deployment behind Tailscale or similar.
- Public fake-data demo.

### Out of scope for now

- Hosted multi-user SaaS.
- Storing bank credentials.
- PDF statement parsing.
- Real data committed to git.

## Domain model notes

The core concept is that a bank transaction is not always actual spending.

Important transaction kinds:

- `income`
- `spend`
- `transfer`
- `credit_card_payment`
- `reimbursement`
- `split_settlement`

Likely future entities:

- Account
- Imported file
- Raw transaction
- Ledger transaction
- Economic posting / allocation
- Review item
- Category
- Merchant rule
- Transfer match
- Reimbursement match
- Settlement match
- Counterparty
- Split rule
- Budget
- Budget period

The app should preserve raw imported rows and derive normalized ledger entries from them. That makes
imports auditable and lets rules improve over time without losing the original source data.

Research/evaluation note: established double-entry and plain-text accounting systems model credit
card purchases, card payments, reimbursements, and shared expenses as distinct postings across asset,
liability, expense, and receivable accounts. That confirms the app should not treat a bank row's
category as the final truth. The durable model should separate:

- **Cashflow:** what moved through Monzo, Amex, joint accounts, or cash.
- **Classification:** whether the movement is income, spend, transfer, card settlement,
  reimbursement, or split settlement.
- **Allocation:** who or what economically owns the cost: personal, partner, joint, friend,
  business, reimbursable, or excluded.
- **Settlement:** which later movement offsets which earlier allocation: Monzo paying Amex, a friend
  paying back dinner, a partner settling a joint balance, or a business reimbursement clearing a
  business expense.

This is essential because the real-world flow is often `income -> Amex payment`, with spending,
friends paying back, partner/joint spending, and business expenses in between. Reports must count
Amex purchases once, count only the user's owned share as personal spend, and treat the Monzo Amex
payment as liability settlement rather than new spending.

## Implementation plan

### Completed baseline

- pnpm workspace with `apps/web`, `apps/server`, and `packages/core`.
- mise-pinned Node/pnpm, Biome, TypeScript, Vitest, and root verification scripts.
- Tailwind CSS v4 and shadcn/ui initialized for the web app.
- Agent instructions and installed skill lockfiles.
- `fixtures/` for safe fake data and `storage/` for ignored private local files.
- Placeholder Hono API, React review workspace, and pure core transaction rules.

Validation rule for every stage: `pnpm verify` must pass, but that is only the baseline. Each stage
also needs behavior-specific tests or smoke checks that prove the app does the intended finance task
with fake data and does not touch real/private storage unexpectedly.

### Stage 1: Domain and persistence foundation

Goal: get durable local storage working without losing the auditability of imported rows.

- Split `packages/core` into focused modules for money amounts, transaction kinds, ledger entries,
  review models, import sources, and spending rules.
- Store money as integer minor units, for example pence, not floating-point decimals.
- Add Drizzle ORM, Drizzle Kit, `better-sqlite3`, and `@types/better-sqlite3` to the server.
- Define the first schema in `apps/server/src/db/schema.ts`:
  - `accounts`
  - `imported_files`
  - `raw_transactions`
  - `ledger_entries`
  - `review_items`
- Generate and commit the initial Drizzle migration under `apps/server/drizzle/`.
- Add server config for the default database path, `storage/personal-finance.sqlite`.
- Add a DB client factory, migration runner, and temp database helpers for Vitest.
- Add repository tests that prove migrations run and rows can be inserted/read from temp SQLite files.

Validation:

- Unit tests prove money is represented in integer minor units and transaction classification still
  handles spend, reimbursement, transfer, credit-card payment, income, and split settlement.
- Migration tests run against a temporary SQLite file, not `storage/personal-finance.sqlite`.
- Repository tests insert/read accounts, imported files, raw transactions, ledger entries, and review
  items.
- A smoke command or test runs migrations against a fresh temp database and verifies expected tables
  exist.
- `storage/` remains ignored and no generated local database is staged for commit.

Drizzle is the better fit for this greenfield app because the schema will evolve quickly and should
remain the source of truth for both TypeScript types and migrations. Kysely remains a strong query
builder, especially for existing databases or teams that want handwritten migrations, but it adds
more manual schema/type synchronization than this app needs right now.

Use `better-sqlite3` as the initial SQLite driver. It is mature, fast for local file-backed SQLite,
and simpler than libSQL for a local/self-hosted app. libSQL remains a good future option if the app
needs Turso/remote SQLite, native encryption-at-rest, or libSQL-specific ALTER/extension support.

### Stage 2: Import pipeline

Goal: import fake fixture CSVs into raw rows and derived ledger entries.

- Start with `fixtures/transactions.csv`.
- Add parser validation with Zod.
- Store every source row in `raw_transactions` before deriving ledger entries.
- Add a fake fixture adapter first, then Monzo and Amex adapters.
- Detect duplicate imports using file/source metadata and stable row fingerprints.
- Keep import logic in `packages/core` when pure; keep file reading and persistence in
  `apps/server`.

Validation:

- Parser unit tests cover valid fixture rows, malformed rows, missing required fields, invalid dates,
  and invalid amounts.
- Import integration tests load `fixtures/transactions.csv` into a temporary database and assert:
  - exactly one `imported_files` row is created;
  - all source rows are preserved in `raw_transactions`;
  - derived ledger entries use integer minor-unit amounts;
  - expected review items are created for uncertain transaction kinds.
- Duplicate import tests prove importing the same fixture twice does not duplicate raw or ledger rows.
- API smoke test confirms imported transactions can be read back from the server layer.

### Stage 3: Review workflow

Goal: make uncertain financial interpretation explicit and correctable.

- Surface review items for entries that are not confidently classified.
- Allow confirming detected kind, changing category, and marking transfers, credit-card payments,
  reimbursements, or split settlements.
- Store review decisions as append-only decisions/adjustments rather than mutating raw imports.
- Add a thin service layer so route handlers do not contain finance or persistence logic.
- Split the current web `App.tsx` into `app/`, `api/`, and `features/` once the review API shape is
  stable.

Validation:

- Service tests prove review decisions are append-only and raw transactions remain unchanged.
- API tests cover listing review items, confirming an item, changing kind/category, and invalid
  decision payloads.
- Web tests cover loading, error, empty, and populated review inbox states.
- Browser smoke test with `agent-browser` confirms the review table renders fake imported data and a
  decision can be submitted through the UI once the route exists.

### Stage 4: Rules and matching

Goal: reduce manual review over time while keeping uncertain matches visible.

- Add merchant/category rules.
- Add transfer matching rules.
- Add credit-card payment detection.
- Add reimbursement matching.
- Add joint split defaults.
- Apply rules during import while still surfacing uncertain matches for review.

Validation:

- Rule unit tests use small named fixtures for each tricky case: Amex repayment, internal transfer,
  reimbursement, split settlement, salary/income, and ordinary spend.
- Regression tests prove credit-card repayments do not count as new spending and reimbursements reduce
  net personal cost.
- Import tests show confident matches skip unnecessary review while uncertain matches still create
  review items.
- Rule changes include before/after examples in test names or fixtures so future failures explain the
  financial behavior that changed.

### Stage 5: Allocation and settlement model

Goal: model who actually owns each cost and which payments settle earlier obligations before any
monthly report is treated as accurate.

- Add economic allocation entities for ledger entries:
  - owner/purpose: personal, partner, joint, friend, business, reimbursable, excluded;
  - amount in minor units;
  - optional counterparty;
  - review/audit metadata.
- Add settlement links between ledger entries/allocations:
  - Monzo payment settling Amex liability;
  - friend/partner reimbursement settling an owed share;
  - business reimbursement settling a business/reimbursable expense.
- Extend review decisions so the user can mark:
  - a row as 100% business/reimbursable;
  - a row as joint or partner-owned;
  - a fixed amount or percentage split;
  - a reimbursement as linked to a prior allocation.
- Keep raw transactions and normalized ledger entries immutable; store allocations and settlement
  decisions append-only or auditable.
- Add private aggregate validation for real exports that compares:
  - Amex spend outflow vs Monzo Amex payment outflow;
  - outstanding reimbursable/business balances;
  - friend/partner/joint amounts owed;
  - personal spend after allocations.

Validation:

- Unit tests model fake but realistic chains:
  - income -> Amex charges -> Monzo Amex payment;
  - friend split expense -> reimbursement;
  - business Amex expense -> later reimbursement;
  - partner/joint split -> settlement;
  - mixed transaction with personal and non-personal portions.
- Tests prove card payments do not affect personal spend and only allocated personal portions do.
- Service/API tests prove allocation and settlement decisions are append-only and raw imports remain
  unchanged.
- Private validation command reports only aggregates from `storage/` and never row descriptions,
  names, merchants, account numbers, or transaction IDs.

### Stage 6: Reporting and budgets

Goal: turn reviewed transactions into useful monthly views.

- Monthly cashflow.
- Category spend.
- Net personal cost.
- Joint vs personal spend.
- Business/reimbursable expenses and outstanding balances.
- Friend/partner amounts owed or settled.
- Budget remaining.
- Credit-card liability and settlement status.
- Review inbox health.

Validation:

- Report unit tests use deterministic fake monthly ledgers with allocations/settlements and assert
  exact totals for cashflow, category spend, net personal cost, joint spend, reimbursement handling,
  business exclusions, friend/partner balances, and credit-card settlement.
- Budget tests cover overspend, underspend, zero-activity categories, and month boundaries.
- API tests verify report endpoints return stable JSON shapes validated with Zod.
- UI tests verify summary cards/tables render the report values from fake API data.

### Stage 7: Product hardening

Goal: make the app safe and pleasant for real local use.

- Add a basic CI workflow once the repo is pushed to GitHub.
- Add browser-level tests once import/review flows are stable enough to test end-to-end.
- Keep fixtures fake and useful.
- Document privacy expectations clearly.
- Add a simple local setup guide.
- Add screenshots or a fake-data demo path.
- Add Docker self-hosting once persistence is stable.

Validation:

- CI runs the same verification path used locally.
- Browser smoke tests cover app load, import fixture, review inbox, and monthly summary once those
  flows exist.
- Privacy checks document that real exports and generated databases belong in `storage/` and are
  ignored by git.
- Docker/self-hosting checks prove a fresh checkout can start the server and web app against an empty
  local SQLite database.

## Open decisions

- Whether budgets should be envelope-based, category-based, or both.
- Whether allocations should initially support both percentage and fixed-amount splits, or fixed
  amounts first with percentages as UI sugar.
- Whether counterparties should be first-class records immediately or simple labels until matching
  needs become clearer.
- Whether business expenses should be modeled as `business` allocation only or as
  `reimbursable/business` plus settlement status.
- Whether budgets should include or exclude reimbursable/business/joint allocations by default.
