CREATE TABLE `library_test` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`skill` text NOT NULL,
	`time_limit_seconds` integer DEFAULT 3600 NOT NULL,
	`collection` text,
	`test_group` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `library_test_skill_status_idx` ON `library_test` (`skill`,`status`);--> statement-breakpoint
CREATE TABLE `library_test_part` (
	`id` text PRIMARY KEY NOT NULL,
	`test_id` text NOT NULL,
	`part` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`band` text DEFAULT '7.0' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`passage` text DEFAULT '' NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`option_bank` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`audio_key` text,
	`audio_name` text,
	`audio_content_type` text,
	`audio_size` integer,
	`audio_uploaded_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`test_id`) REFERENCES `library_test`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_test_part_test_part_unique` ON `library_test_part` (`test_id`,`part`);