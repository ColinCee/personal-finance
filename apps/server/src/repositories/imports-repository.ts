import { and, desc, eq } from "drizzle-orm";

import {
  classifyTransaction,
  type FileImportSource,
  type ImportSource,
  type NormalizedTransactionInput,
} from "@personal-finance/core";

import type { AppDatabase } from "../db/client";
import {
  accounts,
  importedFiles,
  ledgerEntries,
  rawTransactions,
  reviewItems,
} from "../db/schema";

export type ImportRecord = {
  importId: string;
  fileSha256: string;
  originalFileName: string;
  source: FileImportSource;
  transactions: readonly NormalizedTransactionInput[];
};

export type ImportResult = {
  imported: boolean;
  importedFileId: string;
  rawTransactionCount: number;
  ledgerEntryCount: number;
  reviewItemCount: number;
};

export type ImportHistoryItem = {
  id: string;
  source: FileImportSource;
  originalFileName: string;
  importedAt: string;
  rowCount: number;
  status: "imported";
};

export type ImportsRepository = {
  findImportBySourceAndHash: (
    source: FileImportSource,
    fileSha256: string,
  ) => { id: string; rowCount: number } | undefined;
  importTransactions: (record: ImportRecord) => ImportResult;
  listImportedFiles: () => ImportHistoryItem[];
};

export function createImportsRepository(db: AppDatabase): ImportsRepository {
  return {
    findImportBySourceAndHash: (source, fileSha256) =>
      db
        .select({ id: importedFiles.id, rowCount: importedFiles.rowCount })
        .from(importedFiles)
        .where(
          and(
            eq(importedFiles.source, source),
            eq(importedFiles.fileSha256, fileSha256),
          ),
        )
        .get(),

    importTransactions: (record) => {
      const existingImport = db
        .select({ id: importedFiles.id })
        .from(importedFiles)
        .where(
          and(
            eq(importedFiles.source, record.source),
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
              type:
                source === "amex" || source === "fake-amex"
                  ? "credit_card"
                  : "current",
            })
            .onConflictDoNothing()
            .run();
        }

        transaction
          .insert(importedFiles)
          .values({
            id: record.importId,
            source: record.source,
            originalFileName: record.originalFileName,
            fileSha256: record.fileSha256,
            rowCount: record.transactions.length,
          })
          .run();

        let reviewItemCount = 0;

        record.transactions.forEach((entry, index) => {
          const classification = classifyTransaction(entry);
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
              rawJson: JSON.stringify(entry.raw),
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
              kind: classification.kind,
              source: entry.source,
            })
            .run();

          if (classification.reviewRequired) {
            reviewItemCount += 1;
            transaction
              .insert(reviewItems)
              .values({
                id: `review_${record.importId}_${index}`,
                ledgerEntryId,
                status: "needs_review",
                reason: classification.reason,
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

    listImportedFiles: () =>
      db
        .select({
          id: importedFiles.id,
          source: importedFiles.source,
          originalFileName: importedFiles.originalFileName,
          importedAt: importedFiles.importedAt,
          rowCount: importedFiles.rowCount,
          status: importedFiles.status,
        })
        .from(importedFiles)
        .orderBy(desc(importedFiles.importedAt))
        .all(),
  };
}

function accountIdForSource(source: ImportSource) {
  return `account_${source}`;
}

function accountNameForSource(source: ImportSource) {
  switch (source) {
    case "amex":
      return "Amex";
    case "fake-amex":
      return "Fake Amex";
    case "monzo":
      return "Monzo";
    case "fake-monzo":
      return "Fake Monzo";
  }
}

function institutionForSource(source: ImportSource) {
  switch (source) {
    case "amex":
    case "fake-amex":
      return "American Express";
    case "monzo":
    case "fake-monzo":
      return "Monzo";
  }
}
