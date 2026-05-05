# Personal Finance

Data-free local/self-hosted personal finance app.

The goal is to model the money movements that bank overviews usually get wrong:
credit-card repayments, reimbursements, joint-account splits, salary allocation, and budget
reporting. Real financial exports belong in `storage/`, which is ignored by git.

## Product shape

This is an interactive review workspace, not a spreadsheet replacement or SaaS product.

Initial workflow:

1. Import fake/example transaction exports first, then real local Monzo and Amex exports later.
2. Normalize transactions into one ledger model.
3. Review uncertain transfers, credit-card repayments, reimbursements, and split settlements.
4. Produce monthly cashflow and budget reports.

Out of scope for v1:

- Net worth, investments, pensions, and asset valuation.
- Bank API integrations.
- Hosted multi-user SaaS.

Those areas are related enough to live in this repo later, but they should not shape the first
ledger and budgeting model.

## Tech stack

| Choice                    | Why                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Vite + React + TypeScript | Simple app shell without Next.js complexity.                                          |
| Tailwind CSS + shadcn/ui  | Source-owned UI components and semantic design tokens.                                |
| TanStack Router           | Type-safe routing without adopting a full-stack framework.                            |
| TanStack Query            | Keeps server state, loading, and refresh logic out of components.                     |
| TanStack Table            | Transaction review needs filtering/sorting/table UI early.                            |
| Hono                      | Small local/self-hosted API for imports, persistence, and reports.                    |
| Drizzle + SQLite          | Local private database with typed schema and no external service required.            |
| Vitest                    | Unit-test ledger rules and UI behavior as edge cases are added.                       |

SQLite will run in the local/self-hosted server process, not directly in the browser. The browser
talks to the API, and the API owns the database file.

## Repository layout

```text
apps/
  web/       React app
  server/    Hono API
packages/
  core/      Ledger model and finance rules
fixtures/   Fake committed data for tests, demos, and docs
storage/    Local private storage, ignored by git
```

## Development

```bash
mise install
pnpm install
pnpm verify
pnpm check
pnpm test
```

### Local fake-data demo

The app is public and data-free, so the committed demo path uses `fixtures/`
only:

```bash
pnpm demo:seed
pnpm dev
```

`pnpm demo:seed` imports `fixtures/transactions.csv` into the local SQLite
database at `storage/personal-finance.sqlite`. The command is idempotent for the
same fixture file, so running it repeatedly should not duplicate rows.

With `pnpm dev` running:

- Web app: <http://127.0.0.1:5173>
- API health: <http://127.0.0.1:8787/api/health>
- Monthly reports API: <http://127.0.0.1:8787/api/reports/monthly>

If port `8787` is already in use, run the server on another port and point Vite
at it:

```bash
PORT=8788 pnpm --filter @personal-finance/server dev
VITE_API_PROXY_TARGET=http://127.0.0.1:8788 pnpm --filter @personal-finance/web dev
```

### Private local validation

Real Monzo and Amex exports can be placed in `storage/` for local-only aggregate
validation:

```bash
pnpm validate:private-imports
```

The validator reports counts, totals, classifications, and cross-checks without
printing row descriptions, merchant names, account numbers, transaction IDs, or
file names.

## CI and quality gates

GitHub Actions runs `pnpm verify` on pushes and pull requests. Locally, use the
same command before committing code changes. `pnpm verify` includes type checks,
Biome format checks, linting, tests, and production builds.

Browser-level smoke testing should use the fake-data demo path after starting
`pnpm dev`: check that the dashboard loads, monthly reports are visible, and the
review inbox renders the fake ledger rows. Keep browser smoke tests on fake
fixture data only.

## Privacy rules

- Do not commit real bank exports.
- Do not commit account numbers, account IDs, salary amounts, or merchant histories.
- Keep real local files under `storage/`.
- Use `fixtures/` and tests for fake data only.
- Do not paste private row-level data into issues, PRs, screenshots, logs, or agent prompts.
