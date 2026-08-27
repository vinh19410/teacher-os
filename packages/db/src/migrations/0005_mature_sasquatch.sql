CREATE TABLE `comment_bank` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`tag` text DEFAULT 'chung' NOT NULL,
	`text` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_bank_org_created_idx` ON `comment_bank` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `notif` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`text` text NOT NULL,
	`time` text DEFAULT '' NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`dot` text DEFAULT 'accent' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notif_org_created_idx` ON `notif` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`sessions` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent` text DEFAULT '' NOT NULL,
	`read` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `report_org_created_idx` ON `report` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `report_student_idx` ON `report` (`student_id`);