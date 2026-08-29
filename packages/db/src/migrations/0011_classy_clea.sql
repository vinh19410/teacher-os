-- 0011 (issue #104): session_package owns its student — student_id NOT NULL,
-- enrollment_id optional ("parked" packages). Hand-written body on top of the
-- drizzle-kit skeleton: the generated INSERT ... SELECT reads student_id from
-- the OLD table (column does not exist yet) and would fail on first row.
-- Statement 1 is an anti-orphan guard: old-schema NOT NULL on enrollment_id
-- never proved referential integrity (SQLite FK is not always on), and the
-- INNER JOIN backfill would silently drop orphaned money rows. The guard
-- SELECT yields one NULL row per orphan — inserting NULL into a NOT NULL
-- column aborts the migration BEFORE any data is touched. The leading
-- IF EXISTS drop keeps a tripped guard retryable (the trip happens before
-- its own cleanup drop runs). Zero orphans → zero rows → no-op.

DROP TABLE IF EXISTS `session_package_orphan_guard`;--> statement-breakpoint
CREATE TABLE `session_package_orphan_guard` (`violations` text NOT NULL);--> statement-breakpoint
INSERT INTO `session_package_orphan_guard` (`violations`) SELECT NULL FROM `session_package` sp LEFT JOIN `enrollment` e ON e.`id` = sp.`enrollment_id` WHERE e.`id` IS NULL;--> statement-breakpoint
DROP TABLE `session_package_orphan_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_package` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`student_id` text NOT NULL,
	`enrollment_id` text,
	`total` integer NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'Online' NOT NULL,
	`start` text DEFAULT '' NOT NULL,
	`expiry` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session_package` (`id`, `org_id`, `student_id`, `enrollment_id`, `total`, `price`, `mode`, `start`, `expiry`, `status`, `created_at`) SELECT sp.`id`, sp.`org_id`, e.`student_id`, sp.`enrollment_id`, sp.`total`, sp.`price`, sp.`mode`, sp.`start`, sp.`expiry`, sp.`status`, sp.`created_at` FROM `session_package` sp INNER JOIN `enrollment` e ON e.`id` = sp.`enrollment_id`;--> statement-breakpoint
DROP TABLE `session_package`;--> statement-breakpoint
ALTER TABLE `__new_session_package` RENAME TO `session_package`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `session_package_enrollment_uq` ON `session_package` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `session_package_org_idx` ON `session_package` (`org_id`);--> statement-breakpoint
CREATE INDEX `session_package_org_student_idx` ON `session_package` (`org_id`,`student_id`);
