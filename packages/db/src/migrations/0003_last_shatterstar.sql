CREATE TABLE `assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`due` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'not-submitted' NOT NULL,
	`scores` text DEFAULT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignment_org_idx` ON `assignment` (`org_id`);--> statement-breakpoint
CREATE INDEX `assignment_student_idx` ON `assignment` (`student_id`);