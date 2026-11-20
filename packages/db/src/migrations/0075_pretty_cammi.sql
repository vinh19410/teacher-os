ALTER TABLE `assignment_test` ADD `library_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_test_org_library_ref_uq` ON `assignment_test` (`org_id`,`library_ref`);