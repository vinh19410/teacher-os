import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
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
		/**
		 * Template/per-class-copy discriminator (issue #79): NULL = shared
		 * template; a class id = the class's imported deep copy. Enforced
		 * unique per class by syllabus_class_unique.
		 */
		classId: text("class_id"),
		/**
		 * Provenance of an imported copy — the template id it was copied
		 * from. Logical FK only (SQLite cannot ALTER TABLE ADD FK); the
		 * import handler only accepts templates (class_id IS NULL).
		 */
		sourceTemplateId: text("source_template_id").references(
			(): AnySQLiteColumn => syllabus.id,
			{ onDelete: "set null" },
		),
	},
	(table) => [
		index("syllabus_org_idx").on(table.orgId),
		uniqueIndex("syllabus_class_unique")
			.on(table.classId)
			.where(sql`class_id IS NOT NULL`),
	],
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
		/**
		 * Loại buổi (issue #154): kind là nội dung giáo trình (copy
		 * template→lớp giữ nguyên); status là tiến độ per-lớp (reset
		 * `upcoming` khi copy). Value space do zod contract guarded.
		 */
		kind: text("kind").notNull().default("lesson"),
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
