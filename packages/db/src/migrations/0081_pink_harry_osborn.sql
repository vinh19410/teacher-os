PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_class_session_meeting` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`recording_url` text DEFAULT '' NOT NULL,
	`recording_status` text DEFAULT 'none' NOT NULL,
	`recording_error` text,
	`recording_synced_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_class_session_meeting`("id", "org_id", "class_id", "date", "recording_url", "recording_status", "recording_error", "recording_synced_at", "created_at", "updated_at") SELECT "id", "org_id", "class_id", "date", "recording_url", "recording_status", "recording_error", "recording_synced_at", "created_at", "updated_at" FROM `class_session_meeting`;--> statement-breakpoint
DROP TABLE `class_session_meeting`;--> statement-breakpoint
ALTER TABLE `__new_class_session_meeting` RENAME TO `class_session_meeting`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `class_session_meeting_class_date_uq` ON `class_session_meeting` (`class_id`,`date`);--> statement-breakpoint
CREATE INDEX `class_session_meeting_org_idx` ON `class_session_meeting` (`org_id`);--> statement-breakpoint
CREATE INDEX `class_session_meeting_recording_idx` ON `class_session_meeting` (`recording_status`,`date`);