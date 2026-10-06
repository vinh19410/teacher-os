CREATE TABLE `org_bank_link` (
	`org_id` text PRIMARY KEY NOT NULL,
	`company_xid` text,
	`bank_account_xid` text,
	`past_bank_account_xids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`brand_name` text DEFAULT '' NOT NULL,
	`bank_bin` text DEFAULT '' NOT NULL,
	`bank_code` text DEFAULT '' NOT NULL,
	`account_number` text DEFAULT '' NOT NULL,
	`account_holder_name` text DEFAULT '' NOT NULL,
	`last_event_at` integer DEFAULT 0 NOT NULL,
	`last_reconciled_at` integer DEFAULT 0 NOT NULL,
	`linked_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_bank_link_company_xid_uq` ON `org_bank_link` (`company_xid`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_bank_link_bank_account_xid_uq` ON `org_bank_link` (`bank_account_xid`);--> statement-breakpoint
CREATE TABLE `payment_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text DEFAULT 'sepay_bankhub' NOT NULL,
	`provider_txn_id` text NOT NULL,
	`bank_account_xid` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`reference_code` text DEFAULT '' NOT NULL,
	`transaction_date` text DEFAULT '' NOT NULL,
	`payment_code` text,
	`invoice_id` text,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`unmatched_reason` text DEFAULT '' NOT NULL,
	`raw` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transaction_provider_txn_uq` ON `payment_transaction` (`provider`,`provider_txn_id`);--> statement-breakpoint
CREATE INDEX `payment_transaction_org_match_idx` ON `payment_transaction` (`org_id`,`match_status`);--> statement-breakpoint
CREATE INDEX `payment_transaction_invoice_idx` ON `payment_transaction` (`invoice_id`);--> statement-breakpoint
ALTER TABLE `invoice` ADD `payment_code` text;--> statement-breakpoint
ALTER TABLE `invoice` ADD `pay_token` text;--> statement-breakpoint
ALTER TABLE `invoice` ADD `paid_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_payment_code_uq` ON `invoice` (`payment_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_pay_token_uq` ON `invoice` (`pay_token`);