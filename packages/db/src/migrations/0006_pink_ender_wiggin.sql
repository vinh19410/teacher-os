CREATE TABLE `__new_comment_bank` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`tag` text DEFAULT 'chung' NOT NULL,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_comment_bank` (`id`, `org_id`, `operation_id`, `tag`, `text`, `created_at`) SELECT `id`, `org_id`, `id`, `tag`, `text`, `created_at` FROM `comment_bank`;
--> statement-breakpoint
DROP TABLE `comment_bank`;
--> statement-breakpoint
ALTER TABLE `__new_comment_bank` RENAME TO `comment_bank`;
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_bank_org_operation_uidx` ON `comment_bank` (`org_id`,`operation_id`);
--> statement-breakpoint
CREATE INDEX `comment_bank_org_created_idx` ON `comment_bank` (`org_id`,`created_at`,`id`);
