ALTER TABLE `class` ADD `opening_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `class` ADD `opening_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `class` ADD `opening_announcement_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_record` ADD `html_body` text;--> statement-breakpoint
ALTER TABLE `notification_record` ADD `text_body` text;--> statement-breakpoint
CREATE INDEX `notification_record_org_event_ref_idx` ON `notification_record` (`org_id`,`event_type`,`ref_type`,`ref_id`);