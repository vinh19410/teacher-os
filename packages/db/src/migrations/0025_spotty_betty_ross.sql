CREATE TABLE `student_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`inviter_user_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `student_invitation_org_idx` ON `student_invitation` (`org_id`);--> statement-breakpoint
CREATE INDEX `student_invitation_email_idx` ON `student_invitation` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_invitation_org_email_pending_uq` ON `student_invitation` (`org_id`,lower(trim("email"))) WHERE status = 'pending';--> statement-breakpoint
DROP INDEX `student_email_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `student_org_email_uq` ON `student` (`org_id`,lower(trim("email"))) WHERE trim("student"."email") != '';