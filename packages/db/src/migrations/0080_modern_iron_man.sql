CREATE TABLE `vocab_group` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_group_org_idx` ON `vocab_group` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_group_org_normalized_name_uq` ON `vocab_group` (`org_id`,`normalized_name`);--> statement-breakpoint
ALTER TABLE `vocab_deck` ADD `group_id` text REFERENCES `vocab_group`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `vocab_deck_group_idx` ON `vocab_deck` (`group_id`);