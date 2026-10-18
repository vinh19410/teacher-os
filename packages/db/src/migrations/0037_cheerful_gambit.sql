-- Built-in Vocabulary Courses (#361): vocab_library_course, vocab_library_deck, vocab_library_word
-- + vocab_deck.source_library_deck_id + vocab_word.audio_url.
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- snapshot giáo viên và các route /api/kernel/vocab-library/*, /api/student/vocab/* query các cột/bảng này.
-- Server + student PHẢI đi cùng release train (precedent #304, #361, Zod .strict()).
CREATE TABLE `vocab_library_course` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vocab_library_deck` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`image_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `vocab_library_course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_library_deck_course_idx` ON `vocab_library_deck` (`course_id`);--> statement-breakpoint
CREATE TABLE `vocab_library_word` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`word` text NOT NULL,
	`ipa` text,
	`pos` text,
	`translation` text DEFAULT '' NOT NULL,
	`sentence_vi` text,
	`sentence_en` text,
	`picture_url` text,
	`audio_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `vocab_library_deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_library_word_deck_idx` ON `vocab_library_word` (`deck_id`);--> statement-breakpoint
ALTER TABLE `vocab_deck` ADD `source_library_deck_id` text;--> statement-breakpoint
CREATE INDEX `vocab_deck_source_library_idx` ON `vocab_deck` (`source_library_deck_id`);--> statement-breakpoint
ALTER TABLE `vocab_word` ADD `audio_url` text;