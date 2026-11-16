ALTER TABLE `placement_test_submission` ADD `ai_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `ai_error_code` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `ai_started_at` integer;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `ai_drafted_at` integer;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `ai_writing_json` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `ai_speaking_json` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `speaking_transcript` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `writing_errors_json` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `speaking_errors_json` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `result_token` text;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `result_published_at` integer;--> statement-breakpoint
ALTER TABLE `placement_test_submission` ADD `result_email_status` text;--> statement-breakpoint
CREATE UNIQUE INDEX `placement_test_submission_result_token_uq` ON `placement_test_submission` (`result_token`);--> statement-breakpoint
CREATE INDEX `placement_test_submission_ai_status_idx` ON `placement_test_submission` (`ai_status`,`ai_started_at`);