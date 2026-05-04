import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewDecisions,
  reviewItems,
} from "../db/schema";
import { createTransactionsRepository } from "../repositories/transactions-repository";
import { createTestDatabase } from "../test/database";
import { createTransactionsService } from "./transactions-service";

describe("transactions service", () => {
  test("records review decisions without mutating imported rows or ledger entries", () => {
    const testDatabase = createTestDatabase();

    try {
      seedReviewFixture(testDatabase.db);
      const [rawTransactionBefore] = testDatabase.db
        .select()
        .from(rawTransactions)
        .where(eq(rawTransactions.id, "raw_fake_1"))
        .all();
      const [ledgerEntryBefore] = testDatabase.db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.id, "ledger_fake_1"))
        .all();
      const transactionsService = createTransactionsService(
        createTransactionsRepository(testDatabase.db),
      );

      const decision = transactionsService.recordReviewDecision({
        reviewItemId: "review_fake_1",
        decidedKind: "spend",
        note: "Refund was actually a normal card purchase correction.",
      });

      expect(decision).toMatchObject({
        reviewItemId: "review_fake_1",
        action: "change_kind",
        decidedKind: "spend",
        note: "Refund was actually a normal card purchase correction.",
      });
      expect(decision.id).toMatch(/^review_decision_/);
      expect(
        testDatabase.db.select().from(reviewDecisions).all(),
      ).toMatchObject([
        {
          reviewItemId: "review_fake_1",
          action: "change_kind",
          decidedKind: "spend",
        },
      ]);
      expect(
        testDatabase.db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.id, "review_fake_1"))
          .get(),
      ).toMatchObject({
        status: "confirmed",
      });
      expect(
        testDatabase.db
          .select()
          .from(rawTransactions)
          .where(eq(rawTransactions.id, "raw_fake_1"))
          .get(),
      ).toEqual(rawTransactionBefore);
      expect(
        testDatabase.db
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.id, "ledger_fake_1"))
          .get(),
      ).toEqual(ledgerEntryBefore);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("throws when recording a decision for an unknown review item", () => {
    const testDatabase = createTestDatabase();

    try {
      const transactionsService = createTransactionsService(
        createTransactionsRepository(testDatabase.db),
      );

      expect(() =>
        transactionsService.recordReviewDecision({
          reviewItemId: "missing_review",
          decidedKind: "spend",
        }),
      ).toThrow("Review item not found: missing_review");
    } finally {
      testDatabase.cleanup();
    }
  });
});

function seedReviewFixture(db: ReturnType<typeof createTestDatabase>["db"]) {
  db.insert(accounts)
    .values({
      id: "account_fake_monzo",
      name: "Fake Monzo",
      institution: "Monzo",
      type: "current",
    })
    .run();

  db.insert(importedFiles)
    .values({
      id: "import_fake_1",
      source: "fixture_csv",
      originalFileName: "transactions.csv",
      fileSha256: "fake_hash",
      rowCount: 1,
    })
    .run();

  db.insert(rawTransactions)
    .values({
      id: "raw_fake_1",
      importedFileId: "import_fake_1",
      accountId: "account_fake_monzo",
      source: "fake-monzo",
      rowIndex: 0,
      rowHash: "row_hash_1",
      postedOn: "2026-05-02",
      description: "Refund",
      amountMinorUnits: 8240,
      rawJson: JSON.stringify({ description: "Refund" }),
    })
    .run();

  db.insert(ledgerEntries)
    .values({
      id: "ledger_fake_1",
      rawTransactionId: "raw_fake_1",
      accountId: "account_fake_monzo",
      postedOn: "2026-05-02",
      description: "Refund",
      amountMinorUnits: 8240,
      kind: "reimbursement",
      source: "fake-monzo",
    })
    .run();

  db.insert(reviewItems)
    .values({
      id: "review_fake_1",
      ledgerEntryId: "ledger_fake_1",
      status: "needs_review",
      reason: "fixture_import_uncertain_kind",
    })
    .run();
}
