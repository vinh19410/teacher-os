CREATE TABLE `ai_grading_draft` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`skill` text NOT NULL,
	`status` text DEFAULT 'ai_processing' NOT NULL,
	`ai_scores` text,
	`ai_feedback` text DEFAULT '' NOT NULL,
	`reviewed_scores` text,
	`reviewed_feedback` text DEFAULT '' NOT NULL,
	`grading_mode` text DEFAULT 'standard' NOT NULL,
	`credit_cost` integer DEFAULT 0 NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`error_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`drafted_at` integer,
	`published_at` integer,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_grading_draft_org_status_idx` ON `ai_grading_draft` (`org_id`,`status`);