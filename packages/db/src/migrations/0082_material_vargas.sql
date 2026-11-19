ALTER TABLE `class_session_meeting` ADD `join_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `zoom_meeting_id` text;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_password` text;