CREATE TABLE `class` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`skill` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'Online' NOT NULL,
	`syllabus_id` text,
	`schedule` text DEFAULT '' NOT NULL,
	`sessions_total` integer DEFAULT 0 NOT NULL,
	`sessions_done` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_id`) REFERENCES `syllabus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `class_org_idx` ON `class` (`org_id`);--> statement-breakpoint
CREATE TABLE `enrollment` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_class_student_uq` ON `enrollment` (`class_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `enrollment_org_idx` ON `enrollment` (`org_id`);--> statement-breakpoint
CREATE INDEX `enrollment_student_idx` ON `enrollment` (`student_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'teacher' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_org_user_uq` ON `membership` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `membership` (`user_id`);--> statement-breakpoint
CREATE TABLE `student` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`zalo` text DEFAULT '' NOT NULL,
	`parent_name` text DEFAULT '' NOT NULL,
	`parent_phone` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_org_idx` ON `student` (`org_id`);--> statement-breakpoint
CREATE TABLE `syllabus` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`level` text DEFAULT '' NOT NULL,
	`skill` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`total_lessons` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `syllabus_org_idx` ON `syllabus` (`org_id`);--> statement-breakpoint
CREATE TABLE `syllabus_lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`objectives` text DEFAULT '' NOT NULL,
	`materials` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `syllabus_module`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `syllabus_lesson_org_idx` ON `syllabus_lesson` (`org_id`);--> statement-breakpoint
CREATE INDEX `syllabus_lesson_module_idx` ON `syllabus_lesson` (`module_id`);--> statement-breakpoint
CREATE TABLE `syllabus_module` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`syllabus_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_id`) REFERENCES `syllabus`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `syllabus_module_org_idx` ON `syllabus_module` (`org_id`);--> statement-breakpoint
CREATE INDEX `syllabus_module_syllabus_idx` ON `syllabus_module` (`syllabus_id`);--> statement-breakpoint
CREATE TABLE `session_package` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`total` integer NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'Online' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`expiry` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_package_enrollment_uq` ON `session_package` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `session_package_org_idx` ON `session_package` (`org_id`);