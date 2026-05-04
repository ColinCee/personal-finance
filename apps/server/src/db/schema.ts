import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
  entryKinds,
  fileImportSources,
  importSources,
  reviewStatuses,
} from "@personal-finance/core";

export const accountTypes = [
  "current",
  "credit_card",
  "savings",
  "joint_current",
] as const;

export const accountOwnershipTypes = ["personal", "joint"] as const;

export const importedFileStatuses = ["imported"] as const;

function timestampColumn(name: string) {
  return text(name).notNull().default(sql`CURRENT_TIMESTAMP`);
}

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  type: text("type", { enum: accountTypes }).notNull(),
  ownership: text("ownership", { enum: accountOwnershipTypes })
    .notNull()
    .default("personal"),
  currency: text("currency", { enum: ["GBP"] })
    .notNull()
    .default("GBP"),
  createdAt: timestampColumn("created_at"),
  updatedAt: text("updated_at"),
});

export const importedFiles = sqliteTable(
  "imported_files",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: fileImportSources }).notNull(),
    originalFileName: text("original_file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    rowCount: integer("row_count").notNull(),
    status: text("status", { enum: importedFileStatuses })
      .notNull()
      .default("imported"),
  },
  (table) => [
    uniqueIndex("imported_files_source_file_sha256_unique").on(
      table.source,
      table.fileSha256,
    ),
  ],
);

export const rawTransactions = sqliteTable(
  "raw_transactions",
  {
    id: text("id").primaryKey(),
    importedFileId: text("imported_file_id")
      .notNull()
      .references(() => importedFiles.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    source: text("source", { enum: importSources }).notNull(),
    sourceRowId: text("source_row_id"),
    rowIndex: integer("row_index").notNull(),
    rowHash: text("row_hash").notNull(),
    postedOn: text("posted_on").notNull(),
    description: text("description").notNull(),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: text("currency", { enum: ["GBP"] })
      .notNull()
      .default("GBP"),
    rawJson: text("raw_json").notNull(),
  },
  (table) => [
    uniqueIndex("raw_transactions_imported_file_row_hash_unique").on(
      table.importedFileId,
      table.rowHash,
    ),
    index("raw_transactions_account_posted_on_idx").on(
      table.accountId,
      table.postedOn,
    ),
  ],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    rawTransactionId: text("raw_transaction_id").references(
      () => rawTransactions.id,
      { onDelete: "set null" },
    ),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    postedOn: text("posted_on").notNull(),
    description: text("description").notNull(),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: text("currency", { enum: ["GBP"] })
      .notNull()
      .default("GBP"),
    kind: text("kind", { enum: entryKinds }).notNull(),
    source: text("source", { enum: importSources }).notNull(),
    createdAt: timestampColumn("created_at"),
  },
  (table) => [
    index("ledger_entries_account_posted_on_idx").on(
      table.accountId,
      table.postedOn,
    ),
    index("ledger_entries_kind_idx").on(table.kind),
  ],
);

export const reviewItems = sqliteTable(
  "review_items",
  {
    id: text("id").primaryKey(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "cascade" }),
    status: text("status", { enum: reviewStatuses })
      .notNull()
      .default("needs_review"),
    reason: text("reason").notNull(),
    createdAt: timestampColumn("created_at"),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("review_items_status_idx").on(table.status),
    uniqueIndex("review_items_ledger_entry_unique").on(table.ledgerEntryId),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type ImportedFile = typeof importedFiles.$inferSelect;
export type NewImportedFile = typeof importedFiles.$inferInsert;
export type RawTransaction = typeof rawTransactions.$inferSelect;
export type NewRawTransaction = typeof rawTransactions.$inferInsert;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntryRow = typeof ledgerEntries.$inferInsert;
export type ReviewItem = typeof reviewItems.$inferSelect;
export type NewReviewItem = typeof reviewItems.$inferInsert;
