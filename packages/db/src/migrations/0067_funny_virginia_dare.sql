CREATE TABLE `class_session` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`dur` integer NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`zoom` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `class_session_org_idx` ON `class_session` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_session_class_idx` ON `class_session` (`class_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_session_class_date_uq` ON `class_session` (`class_id`,`date`);--> statement-breakpoint
ALTER TABLE `class` ADD `scheduling_mode` text DEFAULT 'auto' NOT NULL;