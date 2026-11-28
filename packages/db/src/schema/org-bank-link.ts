import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * One bank-account link per org (issue #320), configured for standard SePay
 * (`my.sepay.vn` webhooks + API v2 reconciliation). `company_xid`/`bank_account_xid`
 * are legacy Bank Hub external ids kept nullable/unused on SQLite. `va_code`
 * holds an optional memo-based Virtual Account identifier (`TKP`, e.g. `MMY`
 * -> `TKPMMY`) without a unique index so multiple test/org links can share VA codes.
 * Re-linking overwrites the single row and archives the previous `account_number`
 * in `past_bank_account_xids` so manual reconciliation covers the old account.
 */
export const orgBankLink = sqliteTable(
	"org_bank_link",
	{
		orgId: text("org_id")
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Nullable while ensureCompany is mid-flight (row is inserted before
		// createCompany so concurrent tabs/webhooks see it); set once the
		// company exists. Multiple NULLs are distinct in the unique index.
		companyXid: text("company_xid"),
		bankAccountXid: text("bank_account_xid"),
		pastBankAccountXids: text("past_bank_account_xids").notNull().default("[]"),
		status: text("status").notNull().default("none"),
		brandName: text("brand_name").notNull().default(""),
		bankBin: text("bank_bin").notNull().default(""),
		bankCode: text("bank_code").notNull().default(""),
		accountNumber: text("account_number").notNull().default(""),
		vaCode: text("va_code").notNull().default(""),
		accountHolderName: text("account_holder_name").notNull().default(""),
		lastEventAt: integer("last_event_at").notNull().default(0),
		lastReconciledAt: integer("last_reconciled_at").notNull().default(0),
		linkedAt: integer("linked_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("org_bank_link_company_xid_uq").on(table.companyXid),
		uniqueIndex("org_bank_link_bank_account_xid_uq").on(table.bankAccountXid),
	],
);
