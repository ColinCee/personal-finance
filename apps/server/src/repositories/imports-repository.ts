import { and, eq } from "drizzle-orm";

import type { NormalizedTransactionInput } from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewItems,
} from "../db/schema";

export type FixtureImportRecord = {
  importId: string;
  fileSha256: string;
  originalFileName: string;
  transactions: readonly NormalizedTransactionInput[];
};

export type FixtureImportResult = {
  imported: boolean;
  importedFileId: string;
  rawTransactionCount: number;
  ledgerEntryCount: number;
  reviewItemCount: number;
};

export type ImportsRepository = {
  importFixtureTransactions: (
    record: FixtureImportRecord,
  ) => FixtureImportResult;
};

export function createImportsRepository(db: AppDatabase): ImportsRepository {
  return {
    importFixtureTransactions: (record) => {
      const existingImport = db
        .select({ id: importedFiles.id })
        .from(importedFiles)
        .where(
          and(
            eq(importedFiles.source, "fixture_csv"),
            eq(importedFiles.fileSha256, record.fileSha256),
          ),
        )
        .get();

      if (existingImport) {
        return {
          imported: false,
          importedFileId: existingImport.id,
          rawTransactionCount: 0,
          ledgerEntryCount: 0,
          reviewItemCount: 0,
        };
      }

      return db.transaction((transaction) => {
        for (const source of new Set(
          record.transactions.map((entry) => entry.source),
        )) {
          transaction
            .insert(accounts)
            .values({
              id: accountIdForSource(source),
              name: accountNameForSource(source),
              institution: institutionForSource(source),
              type: source === "fake-amex" ? "credit_card" : "current",
            })
            .onConflictDoNothing()
            .run();
        }

        transaction
          .insert(importedFiles)
          .values({
            id: record.importId,
            source: "fixture_csv",
            originalFileName: record.originalFileName,
            fileSha256: record.fileSha256,
            rowCount: record.transactions.length,
          })
          .run();

        let reviewItemCount = 0;

        record.transactions.forEach((entry, index) => {
          const rowHash = `${record.fileSha256}:${index}`;
          const rawTransactionId = `raw_${record.importId}_${index}`;
          const ledgerEntryId = `ledger_${record.importId}_${index}`;

          transaction
            .insert(rawTransactions)
            .values({
              id: rawTransactionId,
              importedFileId: record.importId,
              accountId: accountIdForSource(entry.source),
              source: entry.source,
              sourceRowId: entry.id,
              rowIndex: index,
              rowHash,
              postedOn: entry.postedOn,
              description: entry.description,
              amountMinorUnits: entry.amountMinorUnits,
              currency: entry.currency,
              rawJson: JSON.stringify(entry),
            })
            .run();

          transaction
            .insert(ledgerEntries)
            .values({
              id: ledgerEntryId,
              rawTransactionId,
              accountId: accountIdForSource(entry.source),
              postedOn: entry.postedOn,
              description: entry.description,
              amountMinorUnits: entry.amountMinorUnits,
              currency: entry.currency,
              kind: entry.kind,
              source: entry.source,
            })
            .run();

          if (entry.kind !== "spend") {
            reviewItemCount += 1;
            transaction
              .insert(reviewItems)
              .values({
                id: `review_${record.importId}_${index}`,
                ledgerEntryId,
                status: "needs_review",
                reason: "fixture_import_uncertain_kind",
              })
              .run();
          }
        });

        return {
          imported: true,
          importedFileId: record.importId,
          rawTransactionCount: record.transactions.length,
          ledgerEntryCount: record.transactions.length,
          reviewItemCount,
        };
      });
    },
  };
}

function accountIdForSource(source: NormalizedTransactionInput["source"]) {
  return `account_${source}`;
}

function accountNameForSource(source: NormalizedTransactionInput["source"]) {
  return source === "fake-amex" ? "Fake Amex" : "Fake Monzo";
}

function institutionForSource(source: NormalizedTransactionInput["source"]) {
  return source === "fake-amex" ? "American Express" : "Monzo";
}
