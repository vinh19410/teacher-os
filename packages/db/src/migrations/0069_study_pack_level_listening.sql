ALTER TABLE `assignment_prompt` ADD `level` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `audio_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_pack_exercise` ADD `level` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_pack_exercise` ADD `audio_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_pack_exercise` ADD `transcript` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_pack` ADD `level` text DEFAULT '' NOT NULL;