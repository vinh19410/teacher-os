CREATE TABLE `holiday_session_shift` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`holiday_id` text NOT NULL,
	`class_id` text NOT NULL,
	`original_date` text NOT NULL,
	`makeup_date` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`holiday_id`) REFERENCES `organization_holiday`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_session_shift_class_original_uq` ON `holiday_session_shift` (`class_id`,`original_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_session_shift_class_makeup_uq` ON `holiday_session_shift` (`class_id`,`makeup_date`);--> statement-breakpoint
CREATE INDEX `holiday_session_shift_org_idx` ON `holiday_session_shift` (`org_id`);--> statement-breakpoint
CREATE INDEX `holiday_session_shift_holiday_idx` ON `holiday_session_shift` (`holiday_id`);--> statement-breakpoint
CREATE TABLE `organization_holiday` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`scope` text NOT NULL,
	`mode` text NOT NULL,
	`notify` integer DEFAULT true NOT NULL,
	`notified_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organization_holiday_org_dates_idx` ON `organization_holiday` (`org_id`,`from_date`);--> statement-breakpoint
CREATE TABLE `organization_holiday_class` (
	`id` text PRIMARY KEY NOT NULL,
	`holiday_id` text NOT NULL,
	`class_id` text NOT NULL,
	FOREIGN KEY (`holiday_id`) REFERENCES `organization_holiday`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_holiday_class_holiday_class_uq` ON `organization_holiday_class` (`holiday_id`,`class_id`);