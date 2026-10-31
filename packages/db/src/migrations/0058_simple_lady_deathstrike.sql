CREATE TABLE `placement_test` (
	`org_id` text PRIMARY KEY NOT NULL,
	`draft` text,
	`published` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`published_revision` integer,
	`published_version` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`published_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `placement_test_audio` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `placement_test_audio_org_id_idx` ON `placement_test_audio` (`org_id`);