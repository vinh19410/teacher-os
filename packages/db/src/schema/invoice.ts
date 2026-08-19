import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { student } from "./student";

/**
 * An org-scoped tuition invoice. Creation is intentionally not exposed in the
 * current product surface; tests and future import tooling may insert rows.
 */
export const invoice = sqliteTable(
	"invoice",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		amount: integer("amount").notNull(),
		status: text("status").notNull().default("unpaid"),
		date: text("date").notNull().default(""),
		type: text("type").notNull().default(""),
		method: text("method").notNull().default("—"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("invoice_org_idx").on(table.orgId),
		index("invoice_student_idx").on(table.studentId),
	],
);
