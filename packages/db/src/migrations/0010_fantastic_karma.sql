ALTER TABLE `lesson` ADD `date` text;--> statement-breakpoint
CREATE INDEX `lesson_class_date_idx` ON `lesson` (`class_id`,`date`);