import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Ledger of inbound bank transactions (issue #320). Source of truth for
 * `invoice.paid_amount` (= SUM of matched amounts). `provider_txn_id` is the
 * idempotency key: UNIQUE(provider, provider_txn_id) turns duplicate IPN
 * deliveries and reconciliation re-pulls into no-ops. `invoice_id` is plain
 * text — no FK — same spirit as `invoice.enrollmentId` (financial records
 * survive referenced-row deletion). `raw` keeps the original webhook payload
 * only while the transaction is unmatched (debugging/reconciliation); matched
 * rows carry an empty string to bound PII retention.
 */
export const paymentTransaction = sqliteTable(
	"payment_transaction",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		provider: text("provider").notNull().default("sepay_bankhub"),
		providerTxnId: text("provider_txn_id").notNull(),
		bankAccountXid: text("bank_account_xid").notNull().default(""),
		amount: integer("amount").notNull(),
		content: text("content").notNull().default(""),
		referenceCode: text("reference_code").notNull().default(""),
		transactionDate: text("transaction_date").notNull().default(""),
		paymentCode: text("payment_code"),
		invoiceId: text("invoice_id"),
		matchStatus: text("match_status").notNull().default("unmatched"),
		unmatchedReason: text("unmatched_reason").notNull().default(""),
		raw: text("raw").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("payment_transaction_provider_txn_uq").on(
			table.provider,
			table.providerTxnId,
		),
		index("payment_transaction_org_match_idx").on(
			table.orgId,
			table.matchStatus,
		),
		index("payment_transaction_invoice_idx").on(table.invoiceId),
	],
);
