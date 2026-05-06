import { affectsPersonalSpend } from "../rules/spending";
import type { EntryKind } from "./kinds";
import type { LedgerEntry } from "./ledger-entry";

export const reviewStatuses = ["needs_review", "confirmed"] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];

export const reviewDecisionActions = ["confirm_kind", "change_kind"] as const;

export type ReviewDecisionAction = (typeof reviewDecisionActions)[number];

export type ReviewDecision = {
  id: string;
  reviewItemId: string;
  action: ReviewDecisionAction;
  decidedKind: EntryKind;
  note: string | null;
};

export type ReviewTransaction = LedgerEntry & {
  reviewItemId: string | null;
  reviewStatus: ReviewStatus;
  reviewReason: string | null;
  affectsPersonalSpend: boolean;
};

export function toReviewTransaction(entry: LedgerEntry): ReviewTransaction {
  return {
    ...entry,
    affectsPersonalSpend: affectsPersonalSpend(entry),
    reviewItemId: null,
    reviewStatus: entry.kind === "spend" ? "confirmed" : "needs_review",
    reviewReason: null,
  };
}

export function reviewDecisionActionForKind(
  detectedKind: EntryKind,
  decidedKind: EntryKind,
): ReviewDecisionAction {
  return detectedKind === decidedKind ? "confirm_kind" : "change_kind";
}
