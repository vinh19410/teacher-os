import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

export const syllabus = sqliteTable(
	"syllabus",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		level: text("level").notNull().default(""),
		type: text("type").notNull().default("ielts"),
		/** JSON array string, e.g. '["Writing","Speaking"]'. */
		skills: text("skills").notNull().default("[]"),
		description: text("description").notNull().default(""),
		totalLessons: integer("total_lessons").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("syllabus_org_idx").on(table.orgId)],
);

export const syllabusModule = sqliteTable(
	"syllabus_module",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		syllabusId: text("syllabus_id")
			.notNull()
			.references(() => syllabus.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		position: integer("position").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("syllabus_module_org_idx").on(table.orgId),
		index("syllabus_module_syllabus_idx").on(table.syllabusId),
	],
);

/**
 * Syllabus lesson (curriculum slot) is a different entity from a taught
 * lesson — invariant 5. It belongs to a module, never to a class directly.
 */
export const syllabusLesson = sqliteTable(
	"syllabus_lesson",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		moduleId: text("module_id")
			.notNull()
			.references(() => syllabusModule.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		objectives: text("objectives").notNull().default(""),
		materials: text("materials").notNull().default(""),
		status: text("status").notNull().default("upcoming"),
		position: integer("position").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("syllabus_lesson_org_idx").on(table.orgId),
		index("syllabus_lesson_module_idx").on(table.moduleId),
	],
);
