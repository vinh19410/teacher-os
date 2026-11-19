CREATE TABLE `class_session_meeting` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`meet_url` text DEFAULT '' NOT NULL,
	`google_calendar_event_id` text,
	`google_meet_space_name` text,
	`google_meet_code` text,
	`google_owner_user_id` text,
	`recording_url` text DEFAULT '' NOT NULL,
	`recording_file_id` text,
	`recording_status` text DEFAULT 'none' NOT NULL,
	`recording_error` text,
	`recording_synced_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`google_owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_session_meeting_class_date_uq` ON `class_session_meeting` (`class_id`,`date`);--> statement-breakpoint
CREATE INDEX `class_session_meeting_org_idx` ON `class_session_meeting` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_session_meeting_recording_idx` ON `class_session_meeting` (`recording_status`,`date`);