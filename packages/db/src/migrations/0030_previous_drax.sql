CREATE TABLE `quiz_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`questions_snapshot` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`correct_count` integer,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `class_assignment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempt_assignment_student_uq` ON `quiz_attempt` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `quiz_attempt_org_idx` ON `quiz_attempt` (`org_id`);