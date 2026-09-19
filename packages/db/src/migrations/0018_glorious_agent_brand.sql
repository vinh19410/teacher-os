CREATE TABLE `class_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`title` text NOT NULL,
	`due` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `assignment_prompt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `class_assignment_org_idx` ON `class_assignment` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_assignment_class_idx` ON `class_assignment` (`class_id`);--> statement-breakpoint
CREATE TABLE `class_assignment_target` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `class_assignment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_assignment_target_assignment_student_uq` ON `class_assignment_target` (`assignment_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `class_assignment_target_org_idx` ON `class_assignment_target` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_assignment_target_assignment_idx` ON `class_assignment_target` (`assignment_id`);