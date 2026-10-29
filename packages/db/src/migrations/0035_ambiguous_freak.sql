-- Highlight + ghi chú giáo viên trên bài Writing (quiz_attempt_annotation).
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- trang chấm và summary học viên đã chấm query bảng này, thiếu bảng thì
-- trả 500 (/readyz không kiểm bảng).
CREATE TABLE `quiz_attempt_annotation` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quiz_attempt_annotation_attempt_idx` ON `quiz_attempt_annotation` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `quiz_attempt_annotation_org_idx` ON `quiz_attempt_annotation` (`org_id`);