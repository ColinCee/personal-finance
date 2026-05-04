import { desc, eq, sql } from "drizzle-orm";

import {
  affectsPersonalSpend,
  reviewDecisionActionForKind,
  type ReviewTransaction,
} from "@personal-finance/core";
import type { EntryKind, ReviewDecision } from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import { ledgerEntries, reviewDecisions, reviewItems } from "../db/schema";

export type TransactionsRepository = {
  listReviewTransactions: () => ReviewTransaction[];
  appendReviewDecision: (decision: NewReviewDecision) => ReviewDecision;
};

export type NewReviewDecision = {
  id: string;
  reviewItemId: string;
  decidedKind: EntryKind;
  note?: string;
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
          })
          .from(reviewItems)
          .innerJoin(
            ledgerEntries,
            eq(ledgerEntries.id, reviewItems.ledgerEntryId),
          )
          .where(eq(reviewItems.id, decision.reviewItemId))
          .get();

        if (!reviewItem) {
          throw new Error(`Review item not found: ${decision.reviewItemId}`);
        }

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
  };
}
