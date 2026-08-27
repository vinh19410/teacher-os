CREATE TABLE `invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`method` text DEFAULT '—' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_org_idx` ON `invoice` (`org_id`);--> statement-breakpoint
CREATE INDEX `invoice_student_idx` ON `invoice` (`student_id`);