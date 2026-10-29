-- Student Vocab SRS Game (#359): vocab_deck, vocab_word, vocab_card, vocab_review_log.
-- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
-- snapshot giáo viên và các route /api/student/vocab/* query các bảng này.
-- Server + student PHẢI đi cùng release train (precedent #304, Zod .strict()).
CREATE TABLE `vocab_card` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`word_id` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`is_warning` integer DEFAULT false NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `vocab_word`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_card_student_word_uq` ON `vocab_card` (`student_id`,`word_id`);--> statement-breakpoint
CREATE INDEX `vocab_card_student_due_idx` ON `vocab_card` (`student_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `vocab_card_word_idx` ON `vocab_card` (`word_id`);--> statement-breakpoint
CREATE TABLE `vocab_deck` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `class`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_deck_org_idx` ON `vocab_deck` (`org_id`);--> statement-breakpoint
CREATE INDEX `vocab_deck_class_idx` ON `vocab_deck` (`class_id`);--> statement-breakpoint
CREATE TABLE `vocab_review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`card_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`session_kind` text NOT NULL,
	`grade` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`reviewed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`word` text NOT NULL,
	`translation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_review_log_student_reviewed_idx` ON `vocab_review_log` (`student_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `vocab_word` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`word` text NOT NULL,
	`ipa` text,
	`translation` text DEFAULT '' NOT NULL,
	`audio_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `vocab_deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocab_word_deck_idx` ON `vocab_word` (`deck_id`);