PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placement_test_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`lead_id` text,
	`student_id` text,
	`test_version` integer DEFAULT 0 NOT NULL,
	`snapshot_json` text NOT NULL,
	`answers_json` text NOT NULL,
	`listening_correct` integer DEFAULT 0 NOT NULL,
	`listening_total` integer DEFAULT 0 NOT NULL,
	`gv_correct` integer DEFAULT 0 NOT NULL,
	`gv_total` integer DEFAULT 0 NOT NULL,
	`reading_correct` integer DEFAULT 0 NOT NULL,
	`reading_total` integer DEFAULT 0 NOT NULL,
	`objective_breakdown_json` text NOT NULL,
	`writing_text` text DEFAULT '' NOT NULL,
	`writing_word_count` integer DEFAULT 0 NOT NULL,
	`speaking_status` text DEFAULT 'none' NOT NULL,
	`speaking_media_key` text,
	`speaking_media_mime` text,
	`speaking_media_size` integer,
	`speaking_duration_sec` integer,
	`upload_token_hash` text,
	`upload_token_expires_at` integer,
	`status` text DEFAULT 'pending_grading' NOT NULL,
	`writing_rubric_json` text,
	`writing_score` integer,
	`speaking_rubric_json` text,
	`speaking_score` integer,
	`teacher_feedback` text DEFAULT '' NOT NULL,
	`ai_status` text DEFAULT 'none' NOT NULL,
	`ai_error_code` text,
	`ai_started_at` integer,
	`ai_drafted_at` integer,
	`ai_writing_json` text,
	`ai_speaking_json` text,
	`ai_writing_response_id` text,
	`ai_speaking_response_id` text,
	`speaking_transcript` text DEFAULT '' NOT NULL,
	`writing_errors_json` text,
	`speaking_errors_json` text,
	`result_token` text,
	`result_published_at` integer,
	`result_email_status` text,
	`final_band_level` text,
	`final_course` text,
	`final_display_course` text,
	`final_score_pct` integer,
	`final_note` text DEFAULT '' NOT NULL,
	`graded_by` text,
	`graded_at` integer,
	`ip_hash` text DEFAULT '' NOT NULL,
	`submitted_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `lead`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_placement_test_submission`("id", "org_id", "lead_id", "test_version", "snapshot_json", "answers_json", "listening_correct", "listening_total", "gv_correct", "gv_total", "reading_correct", "reading_total", "objective_breakdown_json", "writing_text", "writing_word_count", "speaking_status", "speaking_media_key", "speaking_media_mime", "speaking_media_size", "speaking_duration_sec", "upload_token_hash", "upload_token_expires_at", "status", "writing_rubric_json", "writing_score", "speaking_rubric_json", "speaking_score", "teacher_feedback", "ai_status", "ai_error_code", "ai_started_at", "ai_drafted_at", "ai_writing_json", "ai_speaking_json", "ai_writing_response_id", "ai_speaking_response_id", "speaking_transcript", "writing_errors_json", "speaking_errors_json", "result_token", "result_published_at", "result_email_status", "final_band_level", "final_course", "final_display_course", "final_score_pct", "final_note", "graded_by", "graded_at", "ip_hash", "submitted_at", "updated_at") SELECT "id", "org_id", "lead_id", "test_version", "snapshot_json", "answers_json", "listening_correct", "listening_total", "gv_correct", "gv_total", "reading_correct", "reading_total", "objective_breakdown_json", "writing_text", "writing_word_count", "speaking_status", "speaking_media_key", "speaking_media_mime", "speaking_media_size", "speaking_duration_sec", "upload_token_hash", "upload_token_expires_at", "status", "writing_rubric_json", "writing_score", "speaking_rubric_json", "speaking_score", "teacher_feedback", "ai_status", "ai_error_code", "ai_started_at", "ai_drafted_at", "ai_writing_json", "ai_speaking_json", "ai_writing_response_id", "ai_speaking_response_id", "speaking_transcript", "writing_errors_json", "speaking_errors_json", "result_token", "result_published_at", "result_email_status", "final_band_level", "final_course", "final_display_course", "final_score_pct", "final_note", "graded_by", "graded_at", "ip_hash", "submitted_at", "updated_at" FROM `placement_test_submission`;--> statement-breakpoint
DROP TABLE `placement_test_submission`;--> statement-breakpoint
ALTER TABLE `__new_placement_test_submission` RENAME TO `placement_test_submission`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `placement_test_submission_org_lead_created_idx` ON `placement_test_submission` (`org_id`,`lead_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `placement_test_submission_org_student_created_idx` ON `placement_test_submission` (`org_id`,`student_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `placement_test_submission_ip_created_idx` ON `placement_test_submission` (`ip_hash`,`submitted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `placement_test_submission_result_token_uq` ON `placement_test_submission` (`result_token`);--> statement-breakpoint
CREATE INDEX `placement_test_submission_ai_status_idx` ON `placement_test_submission` (`ai_status`,`ai_started_at`);--> statement-breakpoint
ALTER TABLE `student` ADD `placement_prompt_dismissed_at` integer;