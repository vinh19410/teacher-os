import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { enrollment } from "./enrollment";
import { organization } from "./organization";

/**
 * A scheduled session belongs to a class and exactly one enrollment —
 * invariant 2 (teaching happens in class; 1:1 = class + one enrollment).
 * Distinct from syllabus_lesson (invariant 5): this row is delivered
 * teaching, not curriculum. No create path yet — rows arrive via helper
 * inserts until a later wave adds scheduling. done/remaining are never
 * stored here or on session_package; they derive from completed rows
 * (invariant 6), which is why (enrollmentId, status) is indexed.
 */
export const lesson = sqliteTable(
	"lesson",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		enrollmentId: text("enrollment_id")
			.notNull()
			.references(() => enrollment.id, { onDelete: "cascade" }),
		day: integer("day").notNull(),
		time: text("time").notNull(),
		dur: integer("dur").notNull(),
		type: text("type").notNull().default("1:1"),
		status: text("status").notNull().default("upcoming"),
		topic: text("topic").notNull().default(""),
		zoom: text("zoom").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("lesson_org_idx").on(table.orgId),
		index("lesson_enrollment_idx").on(table.enrollmentId, table.status),
	],
);
