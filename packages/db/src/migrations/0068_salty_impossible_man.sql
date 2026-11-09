CREATE TABLE `syllabus_lesson_material` (
	`org_id` text NOT NULL,
	`syllabus_lesson_id` text NOT NULL,
	`material_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`syllabus_lesson_id`, `material_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`syllabus_lesson_id`) REFERENCES `syllabus_lesson`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `syllabus_lesson_material_material_idx` ON `syllabus_lesson_material` (`material_id`);--> statement-breakpoint
CREATE INDEX `syllabus_lesson_material_org_idx` ON `syllabus_lesson_material` (`org_id`);