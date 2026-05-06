# Copilot Instructions

This is a public, data-free personal finance app for local or self-hosted use. It helps users import
bank exports, preserve raw rows for auditability, review uncertain transactions, model real economic
spend, and report actual personal spending after credit-card repayments, reimbursements, transfers,
shared costs, savings/investments, and private local classification rules.

Follow the repository agent instructions in [`../AGENTS.md`](../AGENTS.md).

## Public repository safety

- Treat the repo as public by default. Never commit real financial exports, generated SQLite
  databases, private classification rules, account identifiers, salary values, merchant histories,
  friend names, company names, or other personal data.
- Keep real local/private data under ignored `storage/`, including `storage/personal-finance.sqlite`
  and `storage/classification-rules.json`.
- Use `fixtures/` and tests for fake data only. If a test needs a private-rule example, use generic
  fake labels such as "Household repayments" or "Shared subscription", not real names.
- Before committing or pushing, check that `storage/` private files are ignored and scan tracked files
  for accidental private terms when real local data was used during development.

## Architecture and validation reminders

- Preserve raw imported rows and derive normalized ledger entries from them so imports remain
  auditable.
- Keep SQLite behind the Hono API. The browser app must not read or write the database directly.
- Validate imported files, local rules, and API boundaries with Zod.
- Run `pnpm verify` before handing off code changes unless the change is documentation-only.
