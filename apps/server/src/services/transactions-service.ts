import { randomUUID } from "node:crypto";

import type { EntryKind } from "@personal-finance/core";
import type { ReviewTransaction } from "@personal-finance/core";

import type { TransactionsRepository } from "../repositories/transactions-repository";

export type TransactionsService = {
  listReviewTransactions: () => ReviewTransaction[];
  recordReviewDecision: (
    decision: ReviewDecisionRequest,
  ) => ReviewDecisionResponse;
};

export type ReviewDecisionRequest = {
  reviewItemId: string;
  decidedKind: EntryKind;
  note?: string;
};

export type ReviewDecisionResponse = {
  id: string;
  reviewItemId: string;
  action: "confirm_kind" | "change_kind";
  decidedKind: EntryKind;
  note: string | null;
};

export function createTransactionsService(
  transactionsRepository: TransactionsRepository,
): TransactionsService {
  return {
    listReviewTransactions: () =>
      transactionsRepository.listReviewTransactions(),
    recordReviewDecision: (decision) =>
      transactionsRepository.appendReviewDecision({
        id: `review_decision_${randomUUID()}`,
        ...decision,
      }),
  };
}
