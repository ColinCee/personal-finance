import { describe, expect, test } from "vitest";

import type { EntryKind } from "@personal-finance/core";
import type { AppDatabase } from "./db/client";
import { createTestDatabase } from "./test/database";

const fixtureCsv = [
  "posted_on,description,amount,currency,kind,source",
  "2026-05-01,Salary,3000.00,GBP,income,fake-monzo",
  "2026-05-02,Groceries,-82.40,GBP,spend,fake-amex",
  "2026-05-03,Amex payment,-82.40,GBP,credit_card_payment,fake-monzo",
  "2026-05-04,Dinner repayment,25.00,GBP,reimbursement,fake-monzo",
].join("\n");
import { createApp } from "./app";
import {
  accounts,
  economicAllocations,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewDecisions,
  reviewItems,
  settlementLinks,
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
          reviewReason: "fixture_import",
          affectsPersonalSpend: true,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("returns persisted monthly reports", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -8240,
        description: "Groceries",
        kind: "spend",
      });
      testDatabase.db
        .insert(economicAllocations)
        .values({
          id: "allocation_fake_1",
          ledgerEntryId: "ledger_fake_1",
          purpose: "personal",
          amountMinorUnits: 8240,
        })
        .run();
      const app = createApp(testDatabase.db);
      const response = await app.request("/api/reports/monthly");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject([
        {
          month: "2026-05",
          cashflowNetMinorUnits: -8240,
          moneyOutMinorUnits: 8240,
          personalSpendMinorUnits: 8240,
          transactionCount: 1,
          reviewItemCount: 1,
          openReviewItemCount: 1,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("reloads private rules and applies them to existing review rows", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 2199,
        description: "Household subscription repayment",
        kind: "income",
      });
      const app = createApp(testDatabase.db, {
        localClassificationRulesProvider: () => [
          {
            id: "household-repayments",
            label: "Household repayments",
            match: {
              amountDirection: "money_in",
              descriptionContains: ["household subscription"],
            },
            classifyAs: "reimbursement",
          },
        ],
      });
      const response = await app.request(
        "/api/local-classification-rules/apply",
        { method: "POST" },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ruleCount: 1,
        matchedTransactionCount: 1,
        resolvedReviewItemCount: 1,
        updatedLedgerEntryCount: 1,
      });
      expect(testDatabase.db.select().from(ledgerEntries).get()).toMatchObject({
        kind: "reimbursement",
      });
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        reason: "private_rule:household-repayments",
        status: "confirmed",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("reloads public classifier rules and resolves existing automated rows", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 5000,
        description: "Instant Access Pot",
        kind: "income",
      });
      const app = createApp(testDatabase.db);
      const response = await app.request(
        "/api/local-classification-rules/apply",
        { method: "POST" },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ruleCount: 0,
        automatedMatchedTransactionCount: 1,
        privateMatchedTransactionCount: 0,
        matchedTransactionCount: 1,
        resolvedReviewItemCount: 1,
        updatedLedgerEntryCount: 1,
      });
      expect(testDatabase.db.select().from(ledgerEntries).get()).toMatchObject({
        kind: "transfer",
      });
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        reason: "pot_transfer",
        status: "confirmed",
      });
      expect(
        testDatabase.db.select().from(reviewDecisions).get(),
      ).toMatchObject({
        decidedKind: "transfer",
        note: "Auto-identified by public classifier.",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("reloads public classifier rules and resolves existing zero-amount rows", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 0,
        description: "Zero balance correction",
        kind: "income",
      });
      const app = createApp(testDatabase.db);
      const response = await app.request(
        "/api/local-classification-rules/apply",
        { method: "POST" },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        automatedMatchedTransactionCount: 1,
        matchedTransactionCount: 1,
        resolvedReviewItemCount: 1,
        updatedLedgerEntryCount: 1,
      });
      expect(testDatabase.db.select().from(ledgerEntries).get()).toMatchObject({
        kind: "transfer",
      });
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        reason: "zero_amount",
        status: "confirmed",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("reloads public classifier rules and resolves existing Monzo Flex rows", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: 40574,
        description: "Flex payment for travel booking",
        kind: "income",
        raw: {
          Type: "Flex",
          Description: "Flex payment for travel booking",
        },
      });
      const app = createApp(testDatabase.db);
      const response = await app.request(
        "/api/local-classification-rules/apply",
        { method: "POST" },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        automatedMatchedTransactionCount: 1,
        matchedTransactionCount: 1,
        resolvedReviewItemCount: 1,
        updatedLedgerEntryCount: 1,
      });
      expect(testDatabase.db.select().from(ledgerEntries).get()).toMatchObject({
        kind: "transfer",
      });
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        reason: "monzo_flex",
        status: "confirmed",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("previews CSV imports with safe aggregate metadata only", async () => {
    const testDatabase = createTestDatabase();

    try {
      const app = createApp(testDatabase.db);
      const response = await app.request("/api/imports/preview", {
        method: "POST",
        body: csvImportFormData({
          csv: fixtureCsv,
          fileName: "transactions.csv",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        source: "fixture_csv",
        originalFileName: "transactions.csv",
        rowCount: 4,
        duplicateRowCount: 0,
        alreadyImported: false,
        dateRange: {
          from: "2026-05-01",
          to: "2026-05-04",
        },
      });
      expect(testDatabase.db.select().from(importedFiles).all()).toEqual([]);
      expect(testDatabase.db.select().from(rawTransactions).all()).toEqual([]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("commits CSV imports and returns import history", async () => {
    const testDatabase = createTestDatabase();

    try {
      const app = createApp(testDatabase.db);
      const importResponse = await app.request("/api/imports", {
        method: "POST",
        body: csvImportFormData({
          csv: fixtureCsv,
          fileName: "transactions.csv",
        }),
      });

      expect(importResponse.status).toBe(201);
      await expect(importResponse.json()).resolves.toMatchObject({
        imported: true,
        source: "fixture_csv",
        rawTransactionCount: 4,
        ledgerEntryCount: 4,
        reviewItemCount: 0,
      });
      expect(testDatabase.db.select().from(rawTransactions).all()).toHaveLength(
        4,
      );
      expect(testDatabase.db.select().from(ledgerEntries).all()).toHaveLength(
        4,
      );

      const historyResponse = await app.request("/api/imports");

      expect(historyResponse.status).toBe(200);
      await expect(historyResponse.json()).resolves.toMatchObject([
        {
          source: "fixture_csv",
          originalFileName: "transactions.csv",
          rowCount: 4,
          status: "imported",
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("reports duplicate rows for previously imported CSV files", async () => {
    const testDatabase = createTestDatabase();

    try {
      const app = createApp(testDatabase.db);

      await app.request("/api/imports", {
        method: "POST",
        body: csvImportFormData({
          csv: fixtureCsv,
          fileName: "transactions.csv",
        }),
      });
      const previewResponse = await app.request("/api/imports/preview", {
        method: "POST",
        body: csvImportFormData({
          csv: fixtureCsv,
          fileName: "transactions.csv",
        }),
      });

      expect(previewResponse.status).toBe(200);
      await expect(previewResponse.json()).resolves.toMatchObject({
        alreadyImported: true,
        duplicateRowCount: 4,
        rowCount: 4,
      });
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

  test("rejects decisions for resolved review items", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -250000,
        description: "Amex payment",
        kind: "credit_card_payment",
      });
      const app = createApp(testDatabase.db);
      const decisionRequest = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decidedKind: "credit_card_payment",
        }),
      };

      expect(
        await app.request(
          "/api/review-items/review_fake_1/decisions",
          decisionRequest,
        ),
      ).toMatchObject({ status: 201 });

      const duplicateResponse = await app.request(
        "/api/review-items/review_fake_1/decisions",
        decisionRequest,
      );

      expect(duplicateResponse.status).toBe(409);
      await expect(duplicateResponse.json()).resolves.toEqual({
        error: "Review item is already resolved: review_fake_1",
      });
      expect(testDatabase.db.select().from(reviewDecisions).all()).toHaveLength(
        1,
      );
    } finally {
      testDatabase.cleanup();
    }
  });

  test("records a business allocation decision from a review item", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -30000,
        description: "Business hotel",
        kind: "spend",
      });
      const rawTransactionsBeforeDecision = testDatabase.db
        .select()
        .from(rawTransactions)
        .all();
      const ledgerEntriesBeforeDecision = testDatabase.db
        .select()
        .from(ledgerEntries)
        .all();
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            allocations: [
              {
                purpose: "business",
                amountMinorUnits: 30000,
                counterparty: "business",
              },
            ],
            note: "Business expense on personal card.",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        reviewItemId: "review_fake_1",
        allocationCount: 1,
        settlementCount: 0,
      });
      expect(
        testDatabase.db.select().from(economicAllocations).all(),
      ).toMatchObject([
        {
          ledgerEntryId: "ledger_fake_1",
          purpose: "business",
          amountMinorUnits: 30000,
          counterparty: "business",
        },
      ]);
      expect(testDatabase.db.select().from(reviewItems).get()).toMatchObject({
        status: "confirmed",
      });
      expect(testDatabase.db.select().from(reviewDecisions).all()).toHaveLength(
        1,
      );
      expect(testDatabase.db.select().from(rawTransactions).all()).toEqual(
        rawTransactionsBeforeDecision,
      );
      expect(testDatabase.db.select().from(ledgerEntries).all()).toEqual(
        ledgerEntriesBeforeDecision,
      );
    } finally {
      testDatabase.cleanup();
    }
  });

  test("records split allocation decisions from a review item", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -8000,
        description: "Dinner",
        kind: "spend",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            allocations: [
              {
                purpose: "personal",
                amountMinorUnits: 4000,
              },
              {
                purpose: "friend",
                amountMinorUnits: 4000,
                counterparty: "friend",
              },
            ],
            note: "Friend split.",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        reviewItemId: "review_fake_1",
        allocationCount: 2,
        settlementCount: 0,
      });
      expect(
        testDatabase.db.select().from(economicAllocations).all(),
      ).toMatchObject([
        {
          ledgerEntryId: "ledger_fake_1",
          purpose: "personal",
          amountMinorUnits: 4000,
          counterparty: null,
        },
        {
          ledgerEntryId: "ledger_fake_1",
          purpose: "friend",
          amountMinorUnits: 4000,
          counterparty: "friend",
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("records a card-payment settlement decision from a review item", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -48000,
        description: "Amex payment",
        kind: "credit_card_payment",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            settlements: [
              {
                type: "card_payment",
                amountMinorUnits: 48000,
              },
            ],
            note: "Monzo payment settling Amex liability.",
          }),
        },
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        reviewItemId: "review_fake_1",
        allocationCount: 0,
        settlementCount: 1,
      });
      expect(
        testDatabase.db.select().from(settlementLinks).all(),
      ).toMatchObject([
        {
          settlementLedgerEntryId: "ledger_fake_1",
          allocationId: null,
          type: "card_payment",
          amountMinorUnits: 48000,
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("rejects allocation decisions that do not fully allocate an outflow", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -30000,
        description: "Business hotel",
        kind: "spend",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            allocations: [
              {
                purpose: "business",
                amountMinorUnits: 20000,
              },
            ],
          }),
        },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error:
          "Allocation amounts must sum to 30000 minor units; received 20000.",
      });
      expect(testDatabase.db.select().from(economicAllocations).all()).toEqual(
        [],
      );
    } finally {
      testDatabase.cleanup();
    }
  });

  test("rejects settlement decisions that do not fully settle the entry", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -48000,
        description: "Amex payment",
        kind: "credit_card_payment",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            settlements: [
              {
                type: "card_payment",
                amountMinorUnits: 47000,
              },
            ],
          }),
        },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error:
          "Settlement amounts must sum to 48000 minor units; received 47000.",
      });
      expect(testDatabase.db.select().from(settlementLinks).all()).toEqual([]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("rejects allocation decisions that mix allocations and settlements", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -8000,
        description: "Dinner",
        kind: "spend",
      });
      const app = createApp(testDatabase.db);

      const response = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            allocations: [
              {
                purpose: "personal",
                amountMinorUnits: 8000,
              },
            ],
            settlements: [
              {
                type: "card_payment",
                amountMinorUnits: 8000,
              },
            ],
          }),
        },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error:
          "Allocation decisions cannot mix economic allocations and settlement links.",
      });
      expect(testDatabase.db.select().from(economicAllocations).all()).toEqual(
        [],
      );
      expect(testDatabase.db.select().from(settlementLinks).all()).toEqual([]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("rejects duplicate allocation decisions for resolved review items", async () => {
    const testDatabase = createTestDatabase();

    try {
      seedAppReviewFixture(testDatabase.db, {
        amountMinorUnits: -30000,
        description: "Business hotel",
        kind: "spend",
      });
      const app = createApp(testDatabase.db);

      const decisionRequest = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allocations: [
            {
              purpose: "business",
              amountMinorUnits: 30000,
            },
          ],
        }),
      };

      expect(
        await app.request(
          "/api/review-items/review_fake_1/allocation-decisions",
          decisionRequest,
        ),
      ).toMatchObject({ status: 201 });

      const duplicateResponse = await app.request(
        "/api/review-items/review_fake_1/allocation-decisions",
        decisionRequest,
      );

      expect(duplicateResponse.status).toBe(409);
      await expect(duplicateResponse.json()).resolves.toEqual({
        error: "Review item is already resolved: review_fake_1",
      });
      expect(
        testDatabase.db.select().from(economicAllocations).all(),
      ).toHaveLength(1);
      expect(testDatabase.db.select().from(reviewDecisions).all()).toHaveLength(
        1,
      );
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
    raw?: Record<string, string>;
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
      rawJson: JSON.stringify(entry.raw ?? { description: entry.description }),
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

function csvImportFormData(input: {
  csv: string;
  fileName: string;
  source?: string;
}) {
  const form = new FormData();

  if (input.source) {
    form.set("source", input.source);
  }
  form.set("file", new File([input.csv], input.fileName, { type: "text/csv" }));

  return form;
}
