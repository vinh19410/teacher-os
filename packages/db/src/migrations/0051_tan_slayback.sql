CREATE TABLE `credit_usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`credit_delta` integer NOT NULL,
	`tx_status` text NOT NULL,
	`ref_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_usage_log_idempotency_key_idx` ON `credit_usage_log` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `credit_usage_log_org_created_idx` ON `credit_usage_log` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_wallet` (
	`org_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`held` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exam_import_job` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`created_by` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer,
	`content_fingerprint` text NOT NULL,
	`held_credits` integer DEFAULT 5 NOT NULL,
	`import_status` text DEFAULT 'processing' NOT NULL,
	`draft_json` text,
	`error_code` text,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exam_import_job_org_fingerprint_idx` ON `exam_import_job` (`org_id`,`content_fingerprint`);--> statement-breakpoint
CREATE INDEX `exam_import_job_org_created_idx` ON `exam_import_job` (`org_id`,`created_at`);