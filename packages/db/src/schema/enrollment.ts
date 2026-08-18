import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { organization } from "./organization";
import { student } from "./student";

/**
 * Roster row — invariant 4: membership of a student in a class is exactly
 * one enrollment, unique per (classId, studentId).
 */
export const enrollment = sqliteTable(
	"enrollment",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("enrollment_class_student_uq").on(
			table.classId,
			table.studentId,
		),
		index("enrollment_org_idx").on(table.orgId),
		index("enrollment_student_idx").on(table.studentId),
	],
);
