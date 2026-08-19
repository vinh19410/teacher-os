import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { student } from "./student";

/** IELTS rubric scores, persisted only through the grade endpoint. */
export type AssignmentScores = {
	task: number;
	coherence: number;
	lexical: number;
	grammar: number;
};

/**
 * Wave 6 — assignment rows exist for grading only: no create endpoint,
 * rows enter the table via server-side flows (and test helper inserts).
 * The studentId FK cascades so a deleted student cannot orphan grades.
 */
export const assignment = sqliteTable(
	"assignment",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		type: text("type").notNull().default(""),
		due: text("due").notNull().default(""),
		status: text("status").notNull().default("not-submitted"),
		scores: text("scores", { mode: "json" })
			.$type<AssignmentScores | null>()
			.default(sql`NULL`),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("assignment_org_idx").on(table.orgId),
		index("assignment_student_idx").on(table.studentId),
	],
);
