ALTER TABLE `student` ADD `email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "student" SET "phone" = replace(replace("phone", ' ', ''), '+', '');