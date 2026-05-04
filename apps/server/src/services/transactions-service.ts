import { randomUUID } from "node:crypto";

import type { EntryKind } from "@personal-finance/core";
import type {
  AllocationPurpose,
  ReviewTransaction,
  SettlementType,
} from "@personal-finance/core";

import type { TransactionsRepository } from "../repositories/transactions-repository";

export type TransactionsService = {
  listReviewTransactions: () => ReviewTransaction[];
  recordReviewDecision: (
    decision: ReviewDecisionRequest,
  ) => ReviewDecisionResponse;
  recordAllocationDecision: (
    decision: AllocationDecisionRequest,
  ) => AllocationDecisionResponse;
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

export type AllocationDecisionRequest = {
  reviewItemId: string;
  note?: string;
  allocations?: readonly AllocationDecisionAllocation[];
  settlements?: readonly AllocationDecisionSettlement[];
};

export type AllocationDecisionAllocation = {
  purpose: AllocationPurpose;
  amountMinorUnits: number;
  counterparty?: string;
};

export type AllocationDecisionSettlement = {
  allocationId?: string | null;
  type: SettlementType;
  amountMinorUnits: number;
};

export type AllocationDecisionResponse = {
  reviewItemId: string;
  allocationCount: number;
  settlementCount: number;
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
    recordAllocationDecision: (decision) =>
      transactionsRepository.appendAllocationDecision({
        reviewDecisionId: `review_decision_${randomUUID()}`,
        reviewItemId: decision.reviewItemId,
        note: decision.note,
        allocations: (decision.allocations ?? []).map((allocation) => ({
          id: `allocation_${randomUUID()}`,
          ...allocation,
        })),
        settlements: (decision.settlements ?? []).map((settlement) => ({
          id: `settlement_${randomUUID()}`,
          ...settlement,
        })),
      }),
  };
}
