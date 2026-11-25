CREATE TABLE `class_material` (
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`material_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`class_id`, `material_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `class_material_material_idx` ON `class_material` (`material_id`);--> statement-breakpoint
CREATE INDEX `class_material_org_idx` ON `class_material` (`org_id`);