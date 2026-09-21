ALTER TABLE `assignment_prompt` ADD `skill` text DEFAULT 'writing' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `part` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `intro` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `passage` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `transcript` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `cue_topic` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `cue_points` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `audio_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `questions` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `assignment_prompt`
SET `skill` = 'writing', `part` = `task`, `type` = `genre`
WHERE `part` = '';
