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
| SQLite later              | Good default local database for private financial data; no external service required. |
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
pnpm dev
pnpm verify
pnpm check
pnpm test
```

## Privacy rules

- Do not commit real bank exports.
- Do not commit account numbers, account IDs, salary amounts, or merchant histories.
- Keep real local files under `storage/`.
- Use `fixtures/` and tests for fake data only.
