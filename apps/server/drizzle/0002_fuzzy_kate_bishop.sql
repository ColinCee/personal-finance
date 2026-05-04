CREATE TABLE `economic_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`purpose` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`counterparty` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `economic_allocations_ledger_entry_idx` ON `economic_allocations` (`ledger_entry_id`);--> statement-breakpoint
CREATE INDEX `economic_allocations_purpose_idx` ON `economic_allocations` (`purpose`);--> statement-breakpoint
CREATE TABLE `settlement_links` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_ledger_entry_id` text NOT NULL,
	`allocation_id` text,
	`type` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settlement_ledger_entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allocation_id`) REFERENCES `economic_allocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `settlement_links_settlement_ledger_entry_idx` ON `settlement_links` (`settlement_ledger_entry_id`);--> statement-breakpoint
CREATE INDEX `settlement_links_allocation_idx` ON `settlement_links` (`allocation_id`);--> statement-breakpoint
CREATE INDEX `settlement_links_type_idx` ON `settlement_links` (`type`);