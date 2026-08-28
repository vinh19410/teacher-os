import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Person only — invariant 3: no package columns on student.
 * Entitlements live on session_package keyed by student (enrollment is the optional class attachment — issue #104).
 */
export const student = sqliteTable(
	"student",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		phone: text("phone").notNull().default(""),
		zalo: text("zalo").notNull().default(""),
		parentName: text("parent_name").notNull().default(""),
		parentPhone: text("parent_phone").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("student_org_idx").on(table.orgId)],
);
