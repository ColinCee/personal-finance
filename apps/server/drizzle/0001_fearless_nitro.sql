CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_item_id` text NOT NULL,
	`action` text NOT NULL,
	`decided_kind` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`review_item_id`) REFERENCES `review_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_decisions_review_item_created_at_idx` ON `review_decisions` (`review_item_id`,`created_at`);