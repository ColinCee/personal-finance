import { affectsPersonalSpend } from "../rules/spending";
import type { LedgerEntry } from "./ledger-entry";

export const reviewStatuses = ["needs_review", "confirmed"] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];

export type ReviewTransaction = LedgerEntry & {
  reviewStatus: ReviewStatus;
  affectsPersonalSpend: boolean;
};

export function toReviewTransaction(entry: LedgerEntry): ReviewTransaction {
  return {
    ...entry,
    affectsPersonalSpend: affectsPersonalSpend(entry),
    reviewStatus: entry.kind === "spend" ? "confirmed" : "needs_review",
  };
}
