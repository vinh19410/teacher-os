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

/**
 * Class-level session occurrence (issue #649).
 * Single source of truth for manual / flexible class sessions.
 * Independent of student enrollments (0 students still keeps sessions).
 * When students are enrolled, corresponding `lesson` rows are materialized
 * for attendance and grading.
 */
export const classSession = sqliteTable(
	"class_session",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		date: text("date").notNull(),
		time: text("time").notNull(),
		dur: integer("dur").notNull(),
		topic: text("topic").notNull().default(""),
		zoom: text("zoom").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("class_session_org_idx").on(table.orgId),
		index("class_session_class_idx").on(table.classId),
		uniqueIndex("class_session_class_date_uq").on(table.classId, table.date),
	],
);
