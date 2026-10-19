-- Student Full Vocabulary Courses (#366): recreate `vocab_card` without `FOREIGN KEY (word_id) REFERENCES vocab_word(id)`
-- so `vocab_card.word_id` supports both `vocab_word.id` and `vocab_library_word.id` (`libword-*`).
-- DEPLOY ORDER (bắt buộc):
-- 1. Chạy `db:migrate:deploy` TRƯỚC khi deploy worker (off-hours khuyến nghị do recreate `vocab_card`).
-- 2. Deploy đồng bộ `apps/server` + `apps/web` + `apps/student` trong cùng release train.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vocab_card` (
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
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vocab_card`("id", "student_id", "word_id", "level", "is_warning", "state", "interval_days", "due_at", "lapses", "created_at", "updated_at") SELECT "id", "student_id", "word_id", "level", "is_warning", "state", "interval_days", "due_at", "lapses", "created_at", "updated_at" FROM `vocab_card`;--> statement-breakpoint
DROP TABLE `vocab_card`;--> statement-breakpoint
ALTER TABLE `__new_vocab_card` RENAME TO `vocab_card`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_card_student_word_uq` ON `vocab_card` (`student_id`,`word_id`);--> statement-breakpoint
CREATE INDEX `vocab_card_student_due_idx` ON `vocab_card` (`student_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `vocab_card_word_idx` ON `vocab_card` (`word_id`);