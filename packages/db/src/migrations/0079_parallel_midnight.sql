ALTER TABLE `vocab_deck` ADD `source_deck_id` text;--> statement-breakpoint
CREATE INDEX `vocab_deck_source_deck_idx` ON `vocab_deck` (`source_deck_id`);