import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { student } from "./student";

/**
 * An org-scoped tuition invoice. Creation happens via POST /api/invoices
 * (issue #60): the request carries an enrollmentId, the server derives the
 * studentId, and `due` stores ISO yyyy-mm-dd. `enrollmentId` is plain text —
 * no FK — so the financial record survives enrollment deletion; validity is
 * enforced at write time.
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
		enrollmentId: text("enrollment_id").notNull().default(""),
		amount: integer("amount").notNull(),
		status: text("status").notNull().default("unpaid"),
		due: text("due").notNull().default(""),
		note: text("note").notNull().default(""),
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
		// Serves per-enrollment invoice timelines (tuition totals, issue #62).
		index("invoice_enrollment_idx").on(table.enrollmentId),
	],
);
