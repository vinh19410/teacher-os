DELETE FROM `notification_record` WHERE `event_type` = 'self_study_released';--> statement-breakpoint
DROP INDEX IF EXISTS `class_assignment_plan_item_idx`;--> statement-breakpoint
ALTER TABLE `class_assignment` DROP COLUMN `plan_item_id`;--> statement-breakpoint
ALTER TABLE `class_assignment` ADD `available_at` integer;--> statement-breakpoint
ALTER TABLE `class_assignment` ADD `class_study_pack_id` text;--> statement-breakpoint
CREATE INDEX `class_assignment_study_pack_idx` ON `class_assignment` (`class_study_pack_id`);--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `library_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_prompt_org_library_ref_uq` ON `assignment_prompt` (`org_id`,`library_ref`);--> statement-breakpoint
DROP TABLE IF EXISTS `self_study_plan_item`;--> statement-breakpoint
DROP TABLE IF EXISTS `self_study_plan_day`;--> statement-breakpoint
DROP TABLE IF EXISTS `self_study_plan`;--> statement-breakpoint
CREATE TABLE `study_pack_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`skill` text NOT NULL,
	`part` text DEFAULT '' NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`band` text DEFAULT '7.0' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`passage` text DEFAULT '' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`option_bank` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `study_pack_exercise_skill_status_idx` ON `study_pack_exercise` (`skill`,`status`);--> statement-breakpoint
CREATE TABLE `study_pack` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_pack_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_pack_org_idx` ON `study_pack` (`org_id`);--> statement-breakpoint
CREATE INDEX `study_pack_status_idx` ON `study_pack` (`status`);--> statement-breakpoint
CREATE TABLE `study_pack_item` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `study_pack`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_pack_item_pack_day_source_uq` ON `study_pack_item` (`pack_id`,`day_index`,`source_kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `study_pack_item_pack_day_pos_idx` ON `study_pack_item` (`pack_id`,`day_index`,`position`);--> statement-breakpoint
CREATE TABLE `class_study_pack` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`release_time` text DEFAULT '06:00' NOT NULL,
	`due_time` text DEFAULT '17:00' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`cancelled_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pack_id`) REFERENCES `study_pack`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `class_study_pack_org_idx` ON `class_study_pack` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_study_pack_class_status_idx` ON `class_study_pack` (`class_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_study_pack_class_pack_active_uq` ON `class_study_pack` (`class_id`,`pack_id`) WHERE "class_study_pack"."status" = 'active';
