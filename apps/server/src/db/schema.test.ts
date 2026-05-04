import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";

import { createTestDatabase, type TestDatabase } from "../test/database";
import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewDecisions,
  reviewItems,
} from "./schema";

let testDatabase: TestDatabase | undefined;

afterEach(() => {
  testDatabase?.cleanup();
  testDatabase = undefined;
});

function setupDatabase() {
  testDatabase = createTestDatabase();

  return testDatabase.db;
}

describe("database schema", () => {
  test("runs migrations against a temporary SQLite database", () => {
    const db = setupDatabase();

    const tables = db.select().from(accounts).all();

    expect(tables).toEqual([]);
    expect(testDatabase?.path).toContain("personal-finance-db-");
  });

  test("inserts and reads imported transactions, ledger entries, and review items", () => {
    const db = setupDatabase();

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
        description: "Groceries",
        amountMinorUnits: -8240,
        rawJson: JSON.stringify({ description: "Groceries" }),
      })
      .run();

    db.insert(ledgerEntries)
      .values({
        id: "ledger_fake_1",
        rawTransactionId: "raw_fake_1",
        accountId: "account_fake_monzo",
        postedOn: "2026-05-02",
        description: "Groceries",
        amountMinorUnits: -8240,
        kind: "spend",
        source: "fake-monzo",
      })
      .run();

    db.insert(reviewItems)
      .values({
        id: "review_fake_1",
        ledgerEntryId: "ledger_fake_1",
        status: "confirmed",
        reason: "ordinary_spend",
      })
      .run();

    const [reviewItem] = db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.ledgerEntryId, "ledger_fake_1"))
      .all();

    expect(reviewItem).toMatchObject({
      id: "review_fake_1",
      status: "confirmed",
      reason: "ordinary_spend",
    });

    db.insert(reviewDecisions)
      .values({
        id: "decision_fake_1",
        reviewItemId: "review_fake_1",
        action: "confirm_kind",
        decidedKind: "spend",
      })
      .run();

    const [decision] = db
      .select()
      .from(reviewDecisions)
      .where(eq(reviewDecisions.reviewItemId, "review_fake_1"))
      .all();

    expect(decision).toMatchObject({
      id: "decision_fake_1",
      action: "confirm_kind",
      decidedKind: "spend",
    });
  });
});
