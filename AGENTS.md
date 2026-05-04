# Agent Instructions

## Project intent

Build a public, data-free personal finance app for local or self-hosted use. The product should help
users review imported transactions and model real economic spending more accurately than bank
overviews, especially for credit-card repayments, reimbursements, transfers, and joint spending.

## Non-negotiables

- Never commit real financial exports, account identifiers, salary values, merchant histories, or
  generated local databases.
- Keep real local data under `storage/`, which is ignored by git.
- Use `fixtures/` and tests for fake data only.
- Preserve raw imported rows and derive normalized ledger entries from them so imports remain
  auditable.
- Keep SQLite behind the Hono API. The browser app must not read or write the database directly.

## Architecture rules

- Put domain models, import normalization, matching, and reporting calculations in `packages/core`
  when they can be pure and reusable.
- Put persistence, migrations, API routes, file-system access, and server-owned configuration in
  `apps/server`.
- Put interactive review flows, tables, routing, and client-side API integration in `apps/web`.
- Validate imported files and API boundaries with Zod.
- Keep TypeScript strict. Avoid unnecessary casts and broad catch blocks.

## Tooling workflow

- Run `mise install` before installing dependencies when setting up a new machine.
- Use pnpm workspace scripts as the command source of truth.
- Before handing off code changes, run `pnpm verify` unless the change is documentation-only.
- Use Biome via `pnpm format`, `pnpm format:check`, and `pnpm lint` for formatting and linting.

## Installed skills

- Use `frontend-design` when creating or substantially improving web UI.
- Use `shadcn` when adding or changing shadcn/ui components, Tailwind tokens, or UI composition.
- Use `vercel-react-best-practices` when writing or refactoring React data fetching, rendering, or
  performance-sensitive code.
- Use `vercel-composition-patterns` when designing reusable component APIs or reducing prop
  complexity.
- Use `agent-browser` for browser QA, screenshots, app smoke tests, and checking real UI behavior.

## Quality expectations

- Prefer small, composable modules with focused tests over large mixed-responsibility files.
- Add Vitest coverage for finance rules, import parsing, matching, and report calculations as those
  behaviors are introduced.
- Add browser-level tests after the import and review flows exist; do not front-load them before
  there is stable UI behavior to test.
