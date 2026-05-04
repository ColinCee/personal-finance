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
- Review item
- Category
- Merchant rule
- Transfer match
- Reimbursement match
- Split rule
- Budget
- Budget period

The app should preserve raw imported rows and derive normalized ledger entries from them. That makes
imports auditable and lets rules improve over time without losing the original source data.

## Implementation plan

### 1. Stabilize the scaffold

- Add `.mise.toml` for Node and pnpm version pinning.
- Add repo-level agent instructions so future agent runs preserve privacy, architecture, and
  verification expectations.
- Add Biome linting/formatting, verification, and test commands that cover all workspace packages.
- Use installed skills deliberately:
  - `frontend-design` for UI creation or major UI improvement.
  - `vercel-react-best-practices` for React rendering, data-fetching, and performance work.
  - `vercel-composition-patterns` for reusable component APIs.
  - `agent-browser` for browser QA, screenshots, and smoke tests.
  - `shadcn` for shadcn/ui components, theming, and composition rules.
- Add a basic CI workflow once the repo is pushed to GitHub.
- Add browser-level testing once import/review flows are stable enough to test end-to-end.
- Add a Dockerfile and compose file only after the app has persistence.

Implementation order should stay simple: first make local tooling reproducible, then confirm the
workspace scripts pass, then add the persistence layer. Avoid adding mise tasks until there are
non-JavaScript tools or repeated multi-command workflows that package scripts do not cover well.

### 2. Add local persistence

- Add SQLite to the server.
- Use Drizzle ORM with Drizzle Kit for typed schema/query management and generated SQL migrations.
- Create initial migrations for imported files, raw transactions, normalized transactions, and review
  items.
- Store the database under ignored local storage, for example `storage/personal-finance.sqlite`.
- Add database tests using temporary files.

Drizzle is the better fit for this greenfield app because the schema will evolve quickly and should
remain the source of truth for both TypeScript types and migrations. Kysely remains a strong query
builder, especially for existing databases or teams that want handwritten migrations, but it adds
more manual schema/type synchronization than this app needs right now.

Use `better-sqlite3` as the initial SQLite driver. It is mature, fast for local file-backed SQLite,
and simpler than libSQL for a local/self-hosted app. libSQL remains a good future option if the app
needs Turso/remote SQLite, native encryption-at-rest, or libSQL-specific ALTER/extension support.

### 3. Build import pipeline

- Start with `fixtures/transactions.csv`.
- Add parser validation with Zod.
- Store raw imported rows before normalization.
- Add source-specific import adapters:
  - fake/example CSV
  - Monzo CSV
  - Amex CSV
  - joint-account CSV once the export format is known
- Detect duplicate imports.

### 4. Build review inbox

- Show imported transactions that need confirmation.
- Allow users to confirm detected transaction kind.
- Allow users to recategorize transactions.
- Allow users to mark a transaction as transfer, Amex payment, reimbursement, or split settlement.
- Keep an audit trail of user decisions.

### 5. Add rules

- Add merchant/category rules.
- Add transfer matching rules.
- Add credit-card payment detection.
- Add reimbursement matching.
- Add joint split defaults.
- Apply rules during import while still surfacing uncertain matches for review.

### 6. Add reports

- Monthly cashflow.
- Category spend.
- Net personal cost.
- Joint vs personal spend.
- Budget remaining.
- Credit-card liability and settlement status.
- Review inbox health.

### 7. Prepare for public use

- Keep fixtures fake and useful.
- Document privacy expectations clearly.
- Add a simple local setup guide.
- Add screenshots or a fake-data demo path.
- Add Docker self-hosting once persistence is stable.

## Open decisions

- React UI library: plain CSS first, Tailwind, or shadcn/ui.
- Database query layer: Drizzle vs Kysely.
- Whether budgets should be envelope-based, category-based, or both.
- Whether transaction amounts should use integer minor units rather than decimal numbers.
- Whether review decisions should mutate normalized entries or create append-only adjustments.
- Whether the app should support multiple users/accounts in the schema from the start, even if the
  UI is single-user.
