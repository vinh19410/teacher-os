ALTER TABLE `assignment_prompt` ADD `writing_part` text;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `writing_type` text;--> statement-breakpoint
ALTER TABLE `assignment_prompt` ADD `writing_prompt` text DEFAULT '' NOT NULL;