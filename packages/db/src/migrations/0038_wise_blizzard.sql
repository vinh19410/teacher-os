-- Independent Vocab Decks & Suggestions (#363): vocab_deck.class_id nullable (table recreate) + vocab_suggestion.
-- DEPLOY ORDER (bắt buộc):
-- 1. Chạy `db:migrate:deploy` TRƯỚC khi deploy worker (off-hours khuyến nghị do recreate `vocab_deck`).
-- 2. Deploy server trả `vocabSuggestions` optional trong snapshot TRƯỚC khi deploy web/student.
-- 3. Server + web + student PHẢI đi cùng release train.
CREATE TABLE `vocab_suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`student_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `vocab_deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_suggestion_org_idx` ON `vocab_suggestion` (`org_id`);--> statement-breakpoint
CREATE INDEX `vocab_suggestion_student_status_idx` ON `vocab_suggestion` (`student_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_suggestion_student_deck_uq` ON `vocab_suggestion` (`student_id`,`deck_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vocab_deck` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text,
	`title` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`source_library_deck_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vocab_deck`("id", "org_id", "class_id", "title", "lang", "source_library_deck_id", "created_at", "updated_at") SELECT "id", "org_id", "class_id", "title", "lang", "source_library_deck_id", "created_at", "updated_at" FROM `vocab_deck`;--> statement-breakpoint
DROP TABLE `vocab_deck`;--> statement-breakpoint
ALTER TABLE `__new_vocab_deck` RENAME TO `vocab_deck`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `vocab_deck_org_idx` ON `vocab_deck` (`org_id`);--> statement-breakpoint
CREATE INDEX `vocab_deck_class_idx` ON `vocab_deck` (`class_id`);--> statement-breakpoint
CREATE INDEX `vocab_deck_source_library_idx` ON `vocab_deck` (`source_library_deck_id`);