import { desc, eq } from "drizzle-orm";

import {
  affectsPersonalSpend,
  type ReviewTransaction,
} from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import { ledgerEntries, reviewItems } from "../db/schema";

export type TransactionsRepository = {
  listReviewTransactions: () => ReviewTransaction[];
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
  };
}
