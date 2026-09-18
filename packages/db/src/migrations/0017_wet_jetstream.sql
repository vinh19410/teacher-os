CREATE TABLE `assignment_prompt` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`task` text NOT NULL,
	`genre` text NOT NULL,
	`title` text NOT NULL,
	`band` text DEFAULT '7.0' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`prompt` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignment_prompt_org_idx` ON `assignment_prompt` (`org_id`);