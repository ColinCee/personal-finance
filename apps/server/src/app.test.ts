import { describe, expect, test } from "vitest";

import type { EntryKind } from "@personal-finance/core";
import type { AppDatabase } from "./db/client";
import { createTestDatabase } from "./test/database";
import { createApp } from "./app";
import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewDecisions,
  reviewItems,
} from "./db/schema";

describe("app", () => {
  test("returns persisted review transactions", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -8240,
        description: "Groceries",
        kind: "spend",
      });

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
          reviewItemId: "review_fake_1",
          reviewStatus: "needs_review",
          affectsPersonalSpend: true,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("confirms a detected review item kind", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -250000,
        description: "Amex payment",
        kind: "credit_card_payment",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decidedKind: "credit_card_payment",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        reviewItemId: "review_fake_1",
        action: "confirm_kind",
        decidedKind: "credit_card_payment",
        note: null,
      });
      expect(testDatabase.db.select().from(reviewDecisions).all()).toHaveLength(
        1,
      );
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        status: "confirmed",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("records a changed review item kind", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 8240,
        description: "Refund",
        kind: "reimbursement",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decidedKind: "spend",
            note: "Actually a purchase correction.",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        reviewItemId: "review_fake_1",
        action: "change_kind",
        decidedKind: "spend",
        note: "Actually a purchase correction.",
      });
      expect(testDatabase.db.select().from(reviewDecisions).all()).toHaveLength(
        1,
      );
    } finally {
      testDatabase.cleanup();
    }
  });

  test("rejects invalid review decision payloads", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 8240,
        description: "Refund",
        kind: "reimbursement",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decidedKind: "unknown_kind",
          }),
        },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "Invalid review decision payload",
      });
      expect(testDatabase.db.select().from(reviewDecisions).all()).toEqual([]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("returns not found for unknown review items", async () => {
    const testDatabase = createTestDatabase();

    try {
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/missing_review/decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decidedKind: "spend",
          }),
        },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "Review item not found: missing_review",
      });
    } finally {
      testDatabase.cleanup();
    }
  });
});

function seedAppReviewFixture(
  db: AppDatabase,
  entry: {
    amountMinorUnits: number;
    description: string;
    kind: EntryKind;
  },
) {
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
      description: entry.description,
      amountMinorUnits: entry.amountMinorUnits,
      rawJson: JSON.stringify({ description: entry.description }),
    })
    .run();

  db.insert(ledgerEntries)
    .values({
      id: "ledger_fake_1",
      rawTransactionId: "raw_fake_1",
      accountId: "account_fake_monzo",
      postedOn: "2026-05-02",
      description: entry.description,
      amountMinorUnits: entry.amountMinorUnits,
      kind: entry.kind,
      source: "fake-monzo",
    })
    .run();

  db.insert(reviewItems)
    .values({
      id: "review_fake_1",
      ledgerEntryId: "ledger_fake_1",
      status: "needs_review",
      reason: "fixture_import",
    })
    .run();
}
