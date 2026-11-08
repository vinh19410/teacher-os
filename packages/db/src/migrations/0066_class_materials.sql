-- Hand-edited after drizzle-kit generate: the folder-name unique index keeps
-- coalesce(parent_id, '') as a real expression (drizzle-kit split it on the
-- comma) so root folders (parent NULL) are unique too, and the CHECK uses bare
-- column names.

CREATE TABLE `lesson_material` (
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`date` text NOT NULL,
	`material_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`class_id`, `date`, `material_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lesson_material_material_idx` ON `lesson_material` (`material_id`);--> statement-breakpoint
CREATE INDEX `lesson_material_org_idx` ON `lesson_material` (`org_id`);--> statement-breakpoint
CREATE TABLE `material` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`object_key` text,
	`mime_type` text,
	`size_bytes` integer,
	`original_name` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `material_folder`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "material_kind_shape" CHECK(("kind" = 'link' and "url" is not null and "object_key" is null) or ("kind" in ('file', 'media') and "object_key" is not null and "url" is null))
);
--> statement-breakpoint
CREATE INDEX `material_org_folder_idx` ON `material` (`org_id`,`folder_id`);--> statement-breakpoint
CREATE INDEX `material_org_kind_idx` ON `material` (`org_id`,`kind`);--> statement-breakpoint
CREATE TABLE `material_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `material_folder`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `material_folder_org_parent_idx` ON `material_folder` (`org_id`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `material_folder_org_parent_name_uq` ON `material_folder` (`org_id`,coalesce("parent_id", ''),`name`);