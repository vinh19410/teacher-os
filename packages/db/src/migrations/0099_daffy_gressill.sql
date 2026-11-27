CREATE TABLE `mcp_token` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_token_hash_uq` ON `mcp_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `mcp_token_user_org_idx` ON `mcp_token` (`user_id`,`org_id`);