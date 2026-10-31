CREATE TABLE `self_study_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`title` text DEFAULT 'Kế hoạch tự học' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`release_time` text DEFAULT '06:00' NOT NULL,
	`due_time` text DEFAULT '17:00' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`completed_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `self_study_plan_org_idx` ON `self_study_plan` (`org_id`);--> statement-breakpoint
CREATE INDEX `self_study_plan_class_idx` ON `self_study_plan` (`class_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `self_study_plan_class_published_uq` ON `self_study_plan` (`class_id`) WHERE "self_study_plan"."status" = 'published';--> statement-breakpoint
CREATE TABLE `self_study_plan_day` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`release_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`holiday_override` integer DEFAULT false NOT NULL,
	`warning` text DEFAULT '' NOT NULL,
	`notified_at` integer,
	`released_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `self_study_plan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `self_study_plan_day_plan_date_uq` ON `self_study_plan_day` (`plan_id`,`date`);--> statement-breakpoint
CREATE INDEX `self_study_plan_day_pending_release_idx` ON `self_study_plan_day` (`status`,`release_at`);--> statement-breakpoint
CREATE INDEX `self_study_plan_day_org_idx` ON `self_study_plan_day` (`org_id`);--> statement-breakpoint
CREATE TABLE `self_study_plan_item` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`prompt_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `self_study_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `assignment_prompt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `self_study_plan_item_plan_date_prompt_uq` ON `self_study_plan_item` (`plan_id`,`date`,`prompt_id`);--> statement-breakpoint
CREATE INDEX `self_study_plan_item_plan_date_idx` ON `self_study_plan_item` (`plan_id`,`date`,`position`);--> statement-breakpoint
ALTER TABLE `class_assignment` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `class_assignment` ADD `plan_item_id` text;--> statement-breakpoint
CREATE INDEX `class_assignment_plan_item_idx` ON `class_assignment` (`plan_item_id`);