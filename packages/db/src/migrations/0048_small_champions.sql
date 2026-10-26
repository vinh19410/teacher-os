CREATE TABLE `notification_record` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_group` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link_path` text DEFAULT '' NOT NULL,
	`ref_type` text DEFAULT '' NOT NULL,
	`ref_id` text DEFAULT '' NOT NULL,
	`channels` text DEFAULT 'in_app' NOT NULL,
	`recipient_email` text,
	`sender_name` text DEFAULT '' NOT NULL,
	`reply_to_email` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_record_org_idempotency_key` ON `notification_record` (`org_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_record_org_created_idx` ON `notification_record` (`org_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `notification_record_org_student_created_idx` ON `notification_record` (`org_id`,`student_id`,`created_at`);