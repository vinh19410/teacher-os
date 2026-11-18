ALTER TABLE `vocab_deck` ADD `lesson_number` integer;--> statement-breakpoint
ALTER TABLE `vocab_deck` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `vocab_word` ADD `entry_type` text DEFAULT 'word' NOT NULL;--> statement-breakpoint
ALTER TABLE `vocab_word` ADD `pos` text;--> statement-breakpoint
ALTER TABLE `vocab_word` ADD `example` text;