CREATE TABLE `holiday_session_cancel` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`holiday_id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`holiday_id`) REFERENCES `organization_holiday`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_session_cancel_class_date_uq` ON `holiday_session_cancel` (`class_id`,`date`);--> statement-breakpoint
CREATE INDEX `holiday_session_cancel_org_idx` ON `holiday_session_cancel` (`org_id`);--> statement-breakpoint
CREATE INDEX `holiday_session_cancel_holiday_idx` ON `holiday_session_cancel` (`holiday_id`);