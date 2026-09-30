-- Full-test builder (assignment_test + assignment_test_part).
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- worker mới SELECT bảng chưa tồn tại sẽ 500.
CREATE TABLE `assignment_test` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`skill` text NOT NULL,
	`time_limit_seconds` integer,
	`collection` text,
	`test_group` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignment_test_org_idx` ON `assignment_test` (`org_id`);--> statement-breakpoint
CREATE TABLE `assignment_test_part` (
	`id` text PRIMARY KEY NOT NULL,
	`test_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`part` text NOT NULL,
	`position` integer NOT NULL,
	`q_start_override` integer,
	FOREIGN KEY (`test_id`) REFERENCES `assignment_test`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `assignment_prompt`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_test_part_test_part_unique` ON `assignment_test_part` (`test_id`,`part`);