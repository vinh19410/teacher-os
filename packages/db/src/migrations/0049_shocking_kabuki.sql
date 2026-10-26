ALTER TABLE `payment_transaction` ADD `method` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transaction` ADD `recorded_by` text;