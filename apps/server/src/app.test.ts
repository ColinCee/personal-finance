import { describe, expect, test } from "vitest";

import { createTestDatabase } from "./test/database";
import { createApp } from "./app";
import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewItems,
} from "./db/schema";

describe("app", () => {
  test("returns persisted review transactions", async () => {
    const testDatabase = createTestDatabase();

    try {
      testDatabase.db
        .insert(accounts)
        .values({
          id: "account_fake_monzo",
          name: "Fake Monzo",
          institution: "Monzo",
          type: "current",
        })
        .run();

      testDatabase.db
        .insert(importedFiles)
        .values({
          id: "import_fake_1",
          source: "fixture_csv",
          originalFileName: "transactions.csv",
          fileSha256: "fake_hash",
          rowCount: 1,
        })
        .run();

      testDatabase.db
        .insert(rawTransactions)
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

      testDatabase.db
        .insert(ledgerEntries)
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

      testDatabase.db
        .insert(reviewItems)
        .values({
          id: "review_fake_1",
          ledgerEntryId: "ledger_fake_1",
          status: "needs_review",
          reason: "fixture_import",
        })
        .run();

      const app = createApp(testDatabase.db);
      const response = await app.request("/api/transactions");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([
        {
          id: "ledger_fake_1",
          postedOn: "2026-05-02",
          description: "Groceries",
          amountMinorUnits: -8240,
          currency: "GBP",
          kind: "spend",
          source: "fake-monzo",
          reviewStatus: "needs_review",
          affectsPersonalSpend: true,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });
});
