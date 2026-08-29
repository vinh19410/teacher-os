ALTER TABLE `invoice` ADD `enrollment_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice` ADD `due` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `invoice_enrollment_idx` ON `invoice` (`enrollment_id`);