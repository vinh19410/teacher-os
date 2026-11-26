ALTER TABLE `class_assignment` ADD `session_date` text;--> statement-breakpoint
CREATE INDEX `class_assignment_class_session_idx` ON `class_assignment` (`class_id`,`session_date`);--> statement-breakpoint
ALTER TABLE `lesson_material` ADD `category` text DEFAULT 'lecture' NOT NULL;--> statement-breakpoint
ALTER TABLE `lesson_material` ADD `source_title` text;--> statement-breakpoint
ALTER TABLE `lesson_material` ADD `source_page_start` integer;--> statement-breakpoint
ALTER TABLE `lesson_material` ADD `source_page_end` integer;