CREATE TABLE `lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`day` integer NOT NULL,
	`time` text NOT NULL,
	`dur` integer NOT NULL,
	`type` text DEFAULT '1:1' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`zoom` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lesson_org_idx` ON `lesson` (`org_id`);--> statement-breakpoint
CREATE INDEX `lesson_enrollment_idx` ON `lesson` (`enrollment_id`,`status`);