import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { count } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { AppDatabase } from "../db/client";
import { ledgerEntries, rawTransactions, reviewItems } from "../db/schema";
import { createImportsRepository } from "../repositories/imports-repository";
import { createTestDatabase } from "../test/database";
import { createImportsService } from "./imports-service";

const fixtureCsv = readFileSync(
  resolve(import.meta.dirname, "../../../../fixtures/transactions.csv"),
  "utf8",
);

describe("imports service", () => {
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
        reviewItemCount: 3,
      });
      expect(tableCount(testDatabase.db, rawTransactions)).toBe(4);
      expect(tableCount(testDatabase.db, ledgerEntries)).toBe(4);
      expect(tableCount(testDatabase.db, reviewItems)).toBe(3);
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
    } finally {
      testDatabase.cleanup();
    }
  });
});

function tableCount(
  db: AppDatabase,
  table: typeof rawTransactions | typeof ledgerEntries | typeof reviewItems,
) {
  const [result] = db.select({ value: count() }).from(table).all();

  return result?.value ?? 0;
}
