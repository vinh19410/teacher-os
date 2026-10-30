CREATE TABLE `lead` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`birth_date` text DEFAULT '' NOT NULL,
	`course` text DEFAULT '' NOT NULL,
	`study_mode` text DEFAULT '' NOT NULL,
	`study_days` text DEFAULT '' NOT NULL,
	`time_slot` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`placement` text DEFAULT '' NOT NULL,
	`teacher_note` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'profile' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`ip_hash` text DEFAULT '' NOT NULL,
	`submit_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`status_changed_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_org_status_created_idx` ON `lead` (`org_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `lead_org_phone_updated_idx` ON `lead` (`org_id`,`phone`,`updated_at`);--> statement-breakpoint
CREATE INDEX `lead_ip_updated_idx` ON `lead` (`ip_hash`,`updated_at`);