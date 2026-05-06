import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { count } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { AppDatabase } from "../db/client";
import {
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewItems,
} from "../db/schema";
import { createImportsRepository } from "../repositories/imports-repository";
import { createTestDatabase } from "../test/database";
import { createImportsService } from "./imports-service";

const fixtureCsv = readFileSync(
  resolve(import.meta.dirname, "../../../../fixtures/transactions.csv"),
  "utf8",
);

describe("imports service", () => {
  test("previews fixture CSV metadata without persisting rows", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
      );

      const preview = importsService.previewCsvImport({
        csv: fixtureCsv,
        originalFileName: "transactions.csv",
      });

      expect(preview).toMatchObject({
        source: "fixture_csv",
        originalFileName: "transactions.csv",
        rowCount: 4,
        duplicateRowCount: 0,
        alreadyImported: false,
        dateRange: {
          from: "2026-05-01",
          to: "2026-05-04",
        },
        reviewItemCount: 0,
        moneyInMinorUnits: 302500,
        moneyOutMinorUnits: 16480,
        netAmountMinorUnits: 286020,
      });
      expect(tableCount(testDatabase.db, importedFiles)).toBe(0);
      expect(tableCount(testDatabase.db, rawTransactions)).toBe(0);
      expect(tableCount(testDatabase.db, ledgerEntries)).toBe(0);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("auto-detects bank CSV sources during preview", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
      );

      const preview = importsService.previewCsvImport({
        csv: [
          "Transaction ID,Date,Time,Type,Name,Amount,Currency,Local currency,Money Out,Money In",
          "tx_1,02/05/2026,12:34:56,Card payment,Groceries,-82.40,GBP,GBP,82.40,",
        ].join("\n"),
        originalFileName: "monzo.csv",
      });

      expect(preview).toMatchObject({
        source: "monzo_csv",
        rowCount: 1,
        moneyOutMinorUnits: 8240,
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("imports fixture CSV rows into raw transactions, ledger entries, and review items", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
      );

      const result = importsService.importFixtureCsv({
        csv: fixtureCsv,
        originalFileName: "transactions.csv",
      });

      expect(result).toMatchObject({
        imported: true,
        rawTransactionCount: 4,
        ledgerEntryCount: 4,
        reviewItemCount: 0,
      });
      expect(tableCount(testDatabase.db, rawTransactions)).toBe(4);
      expect(tableCount(testDatabase.db, ledgerEntries)).toBe(4);
      expect(tableCount(testDatabase.db, reviewItems)).toBe(0);
      expect(
        JSON.parse(
          testDatabase.db.select().from(rawTransactions).get()?.rawJson ?? "{}",
        ),
      ).toEqual({
        amount: "3000.00",
        currency: "GBP",
        description: "Salary",
        kind: "income",
        posted_on: "2026-05-01",
        source: "fake-monzo",
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("does not duplicate a fixture import with the same file hash", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
      );

      importsService.importFixtureCsv({
        csv: fixtureCsv,
        originalFileName: "transactions.csv",
      });
      const duplicateResult = importsService.importFixtureCsv({
        csv: fixtureCsv,
        originalFileName: "transactions.csv",
      });

      expect(duplicateResult).toMatchObject({
        imported: false,
        rawTransactionCount: 0,
        ledgerEntryCount: 0,
        reviewItemCount: 0,
      });
      expect(tableCount(testDatabase.db, rawTransactions)).toBe(4);
      expect(tableCount(testDatabase.db, ledgerEntries)).toBe(4);
      expect(
        importsService.previewCsvImport({
          csv: fixtureCsv,
          originalFileName: "transactions.csv",
        }),
      ).toMatchObject({
        alreadyImported: true,
        duplicateRowCount: 4,
        rowCount: 4,
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  test("keeps uncertain classification matches in review", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
      );

      const result = importsService.importFixtureCsv({
        csv: [
          "posted_on,description,amount,currency,kind,source",
          "2026-05-02,Bank credit,25.00,GBP,income,fake-monzo",
          "2026-05-03,Joint dinner split,-42.00,GBP,spend,fake-monzo",
        ].join("\n"),
        originalFileName: "uncertain-transactions.csv",
      });

      expect(result).toMatchObject({
        imported: true,
        rawTransactionCount: 2,
        ledgerEntryCount: 2,
        reviewItemCount: 2,
      });
      expect(testDatabase.db.select().from(reviewItems).all()).toMatchObject([
        {
          reason: "positive_amount_uncertain",
          status: "needs_review",
        },
        {
          reason: "split_settlement",
          status: "needs_review",
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });

  test("auto-confirms transactions matched by private local rules", () => {
    const testDatabase = createTestDatabase();

    try {
      const importsService = createImportsService(
        createImportsRepository(testDatabase.db),
        {
          localClassificationRules: [
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
        },
      );

      const result = importsService.importFixtureCsv({
        csv: [
          "posted_on,description,amount,currency,kind,source",
          "2026-05-02,Household subscription repayment,21.99,GBP,income,fake-monzo",
        ].join("\n"),
        originalFileName: "private-rule-transactions.csv",
      });

      expect(result).toMatchObject({
        imported: true,
        rawTransactionCount: 1,
        ledgerEntryCount: 1,
        reviewItemCount: 0,
      });
      expect(testDatabase.db.select().from(ledgerEntries).get()).toMatchObject({
        kind: "reimbursement",
      });
      expect(testDatabase.db.select().from(reviewItems).all()).toMatchObject([
        {
          reason: "private_rule:household-repayments",
          status: "confirmed",
        },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });
});

function tableCount(
  db: AppDatabase,
  table:
    | typeof importedFiles
    | typeof rawTransactions
    | typeof ledgerEntries
    | typeof reviewItems,
) {
  const [result] = db.select({ value: count() }).from(table).all();

  return result?.value ?? 0;
}
