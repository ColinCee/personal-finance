import { desc, eq, sql } from "drizzle-orm";

import {
  affectsPersonalSpend,
  reviewDecisionActionForKind,
  type ReviewTransaction,
} from "@personal-finance/core";
import type {
  AllocationPurpose,
  EntryKind,
  ReviewDecision,
  SettlementType,
} from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import {
  economicAllocations,
  ledgerEntries,
  reviewDecisions,
  reviewItems,
  settlementLinks,
} from "../db/schema";
import {
  AllocationDecisionInvalidError,
  ReviewItemAlreadyResolvedError,
  ReviewItemNotFoundError,
} from "../errors";

export type TransactionsRepository = {
  listReviewTransactions: () => ReviewTransaction[];
  appendReviewDecision: (decision: NewReviewDecision) => ReviewDecision;
  appendAllocationDecision: (
    decision: NewAllocationDecision,
  ) => AllocationDecisionResult;
};

export type NewReviewDecision = {
  id: string;
  reviewItemId: string;
  decidedKind: EntryKind;
  note?: string;
};

export type NewAllocationDecision = {
  reviewDecisionId: string;
  reviewItemId: string;
  note?: string;
  allocations: readonly NewEconomicAllocationDecision[];
  settlements: readonly NewSettlementDecision[];
};

export type NewEconomicAllocationDecision = {
  id: string;
  purpose: AllocationPurpose;
  amountMinorUnits: number;
  counterparty?: string;
};

export type NewSettlementDecision = {
  id: string;
  allocationId?: string | null;
  type: SettlementType;
  amountMinorUnits: number;
};

export type AllocationDecisionResult = {
  reviewItemId: string;
  allocationCount: number;
  settlementCount: number;
};

type ReviewItemForDecision = {
  id: string;
  ledgerEntryId: string;
  detectedKind: EntryKind;
  status: "needs_review" | "confirmed";
  amountMinorUnits?: number;
};

export function createTransactionsRepository(
  db: AppDatabase,
): TransactionsRepository {
  return {
    listReviewTransactions: () =>
      db
        .select({
          id: ledgerEntries.id,
          postedOn: ledgerEntries.postedOn,
          description: ledgerEntries.description,
          amountMinorUnits: ledgerEntries.amountMinorUnits,
          currency: ledgerEntries.currency,
          kind: ledgerEntries.kind,
          source: ledgerEntries.source,
          reviewItemId: reviewItems.id,
          reviewStatus: reviewItems.status,
        })
        .from(ledgerEntries)
        .leftJoin(reviewItems, eq(reviewItems.ledgerEntryId, ledgerEntries.id))
        .orderBy(desc(ledgerEntries.postedOn))
        .all()
        .map((entry) => ({
          ...entry,
          reviewStatus: entry.reviewStatus ?? "confirmed",
          affectsPersonalSpend: affectsPersonalSpend(entry),
        })),
    appendReviewDecision: (decision) =>
      db.transaction((transaction) => {
        const reviewItem = transaction
          .select({
            id: reviewItems.id,
            ledgerEntryId: reviewItems.ledgerEntryId,
            detectedKind: ledgerEntries.kind,
            status: reviewItems.status,
          })
          .from(reviewItems)
          .innerJoin(
            ledgerEntries,
            eq(ledgerEntries.id, reviewItems.ledgerEntryId),
          )
          .where(eq(reviewItems.id, decision.reviewItemId))
          .get();

        if (!reviewItem) {
          throw new ReviewItemNotFoundError(decision.reviewItemId);
        }
        assertReviewItemCanReceiveDecision(reviewItem);

        const action = reviewDecisionActionForKind(
          reviewItem.detectedKind,
          decision.decidedKind,
        );
        const insertedDecision = transaction
          .insert(reviewDecisions)
          .values({
            id: decision.id,
            reviewItemId: decision.reviewItemId,
            action,
            decidedKind: decision.decidedKind,
            note: decision.note,
          })
          .returning({
            id: reviewDecisions.id,
            reviewItemId: reviewDecisions.reviewItemId,
            action: reviewDecisions.action,
            decidedKind: reviewDecisions.decidedKind,
            note: reviewDecisions.note,
          })
          .get();

        transaction
          .update(reviewItems)
          .set({
            status: "confirmed",
            resolvedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(reviewItems.id, decision.reviewItemId))
          .run();

        return insertedDecision;
      }),
    appendAllocationDecision: (decision) =>
      db.transaction((transaction) => {
        const reviewItem = transaction
          .select({
            id: reviewItems.id,
            ledgerEntryId: reviewItems.ledgerEntryId,
            detectedKind: ledgerEntries.kind,
            status: reviewItems.status,
            amountMinorUnits: ledgerEntries.amountMinorUnits,
          })
          .from(reviewItems)
          .innerJoin(
            ledgerEntries,
            eq(ledgerEntries.id, reviewItems.ledgerEntryId),
          )
          .where(eq(reviewItems.id, decision.reviewItemId))
          .get();

        if (!reviewItem) {
          throw new ReviewItemNotFoundError(decision.reviewItemId);
        }
        assertReviewItemCanReceiveDecision(reviewItem);

        validateAllocationDecision({
          ledgerEntryId: reviewItem.ledgerEntryId,
          ledgerAmountMinorUnits: reviewItem.amountMinorUnits,
          allocations: decision.allocations,
          settlements: decision.settlements,
        });

        if (hasEconomicAllocations(decision)) {
          transaction
            .insert(economicAllocations)
            .values(
              toEconomicAllocationRows(decision, reviewItem.ledgerEntryId),
            )
            .run();
        }

        if (hasSettlementLinks(decision)) {
          transaction
            .insert(settlementLinks)
            .values(toSettlementLinkRows(decision, reviewItem.ledgerEntryId))
            .run();
        }

        transaction
          .insert(reviewDecisions)
          .values({
            id: decision.reviewDecisionId,
            reviewItemId: decision.reviewItemId,
            action: "confirm_kind",
            decidedKind: reviewItem.detectedKind,
            note: decision.note,
          })
          .run();

        transaction
          .update(reviewItems)
          .set({
            status: "confirmed",
            resolvedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(reviewItems.id, decision.reviewItemId))
          .run();

        return {
          reviewItemId: decision.reviewItemId,
          allocationCount: decision.allocations.length,
          settlementCount: decision.settlements.length,
        };
      }),
  };
}

function assertReviewItemCanReceiveDecision(reviewItem: ReviewItemForDecision) {
  if (reviewItem.status !== "needs_review") {
    throw new ReviewItemAlreadyResolvedError(reviewItem.id);
  }
}

function hasEconomicAllocations(decision: NewAllocationDecision): boolean {
  return decision.allocations.length > 0;
}

function hasSettlementLinks(decision: NewAllocationDecision): boolean {
  return decision.settlements.length > 0;
}

function toEconomicAllocationRows(
  decision: NewAllocationDecision,
  ledgerEntryId: string,
): (typeof economicAllocations.$inferInsert)[] {
  return decision.allocations.map((allocation) => ({
    id: allocation.id,
    ledgerEntryId,
    purpose: allocation.purpose,
    amountMinorUnits: allocation.amountMinorUnits,
    counterparty: allocation.counterparty,
  }));
}

function toSettlementLinkRows(
  decision: NewAllocationDecision,
  settlementLedgerEntryId: string,
): (typeof settlementLinks.$inferInsert)[] {
  return decision.settlements.map((settlement) => ({
    id: settlement.id,
    settlementLedgerEntryId,
    allocationId: settlement.allocationId,
    type: settlement.type,
    amountMinorUnits: settlement.amountMinorUnits,
  }));
}

function validateAllocationDecision(input: {
  ledgerEntryId: string;
  ledgerAmountMinorUnits: number;
  allocations: readonly NewEconomicAllocationDecision[];
  settlements: readonly NewSettlementDecision[];
}) {
  if (input.allocations.length === 0 && input.settlements.length === 0) {
    throw new AllocationDecisionInvalidError(
      "Allocation decision must include allocations or settlements.",
    );
  }

  if (input.allocations.length > 0 && input.settlements.length > 0) {
    throw new AllocationDecisionInvalidError(
      "Allocation decisions cannot mix economic allocations and settlement links.",
    );
  }

  for (const allocation of input.allocations) {
    if (allocation.amountMinorUnits <= 0) {
      throw new AllocationDecisionInvalidError(
        "Allocation amounts must be positive minor units.",
      );
    }
  }

  for (const settlement of input.settlements) {
    if (settlement.amountMinorUnits <= 0) {
      throw new AllocationDecisionInvalidError(
        "Settlement amounts must be positive minor units.",
      );
    }
  }

  if (input.allocations.length === 0) {
    const expectedSettlementMinorUnits = Math.abs(input.ledgerAmountMinorUnits);
    const settledMinorUnits = input.settlements.reduce(
      (total, settlement) => total + settlement.amountMinorUnits,
      0,
    );

    if (settledMinorUnits !== expectedSettlementMinorUnits) {
      throw new AllocationDecisionInvalidError(
        `Settlement amounts must sum to ${expectedSettlementMinorUnits} minor units; received ${settledMinorUnits}.`,
      );
    }

    return;
  }

  if (input.ledgerAmountMinorUnits >= 0) {
    throw new AllocationDecisionInvalidError(
      `Ledger entry cannot be economically allocated because it is not an outflow: ${input.ledgerEntryId}`,
    );
  }

  const expectedMinorUnits = Math.abs(input.ledgerAmountMinorUnits);
  const allocatedMinorUnits = input.allocations.reduce(
    (total, allocation) => total + allocation.amountMinorUnits,
    0,
  );

  if (allocatedMinorUnits !== expectedMinorUnits) {
    throw new AllocationDecisionInvalidError(
      `Allocation amounts must sum to ${expectedMinorUnits} minor units; received ${allocatedMinorUnits}.`,
    );
  }
}
