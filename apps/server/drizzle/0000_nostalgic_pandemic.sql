CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`type` text NOT NULL,
	`ownership` text DEFAULT 'personal' NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `imported_files` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`original_file_name` text NOT NULL,
	`file_sha256` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`row_count` integer NOT NULL,
	`status` text DEFAULT 'imported' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imported_files_source_file_sha256_unique` ON `imported_files` (`source`,`file_sha256`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_transaction_id` text,
	`account_id` text NOT NULL,
	`posted_on` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`raw_transaction_id`) REFERENCES `raw_transactions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_account_posted_on_idx` ON `ledger_entries` (`account_id`,`posted_on`);--> statement-breakpoint
CREATE INDEX `ledger_entries_kind_idx` ON `ledger_entries` (`kind`);--> statement-breakpoint
CREATE TABLE `raw_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`imported_file_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source` text NOT NULL,
	`source_row_id` text,
	`row_index` integer NOT NULL,
	`row_hash` text NOT NULL,
	`posted_on` text NOT NULL,
	`description` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`raw_json` text NOT NULL,
	FOREIGN KEY (`imported_file_id`) REFERENCES `imported_files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_transactions_imported_file_row_hash_unique` ON `raw_transactions` (`imported_file_id`,`row_hash`);--> statement-breakpoint
CREATE INDEX `raw_transactions_account_posted_on_idx` ON `raw_transactions` (`account_id`,`posted_on`);--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`status` text DEFAULT 'needs_review' NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_items_status_idx` ON `review_items` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_items_ledger_entry_unique` ON `review_items` (`ledger_entry_id`);