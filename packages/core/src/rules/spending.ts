import type { LedgerEntry } from "../transactions/ledger-entry";

export function affectsPersonalSpend(entry: LedgerEntry): boolean {
  return ["spend", "reimbursement", "split_settlement"].includes(entry.kind);
}
