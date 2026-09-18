import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { student } from "./student";

export type ReportStatus = "read" | "sent" | "draft";

/** Org-scoped parent report projection; created via POST /api/reports (#173). Real delivery is not wired — channel is metadata. */
export const report = sqliteTable(
	"report",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		period: text("period").notNull().default(""),
		sessions: integer("sessions").notNull().default(0),
		status: text("status").$type<ReportStatus>().notNull().default("draft"),
		sent: text("sent").notNull().default(""),
		read: text("read").notNull().default(""),
		/** #173 — what the teacher wrote and through which channel. */
		content: text("content").notNull().default(""),
		channel: text("channel").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("report_org_created_idx").on(table.orgId, table.createdAt, table.id),
		index("report_student_idx").on(table.studentId),
	],
);
