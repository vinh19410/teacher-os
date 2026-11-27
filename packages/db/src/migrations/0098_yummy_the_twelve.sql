ALTER TABLE `class_session_meeting` ADD `recording_storage_key` text;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_size_bytes` integer;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_mime_type` text;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_uploaded_at` integer;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_expires_at` integer;--> statement-breakpoint
ALTER TABLE `class_session_meeting` ADD `recording_zoom_trash_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX `class_session_meeting_recording_expires_idx` ON `class_session_meeting` (`recording_expires_at`);