DROP INDEX `enrollment_class_student_uq`;--> statement-breakpoint
ALTER TABLE `enrollment` ADD `removed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_class_student_uq` ON `enrollment` (`class_id`,`student_id`) WHERE "enrollment"."status" != 'removed';