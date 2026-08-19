ALTER TABLE `comment_bank` ADD `operation_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `comment_bank_org_operation_uidx` ON `comment_bank` (`org_id`,`operation_id`);