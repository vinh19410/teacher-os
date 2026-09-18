import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Ngân hàng đề Writing (design "Thêm đề vào ngân hàng", 2026-09-18).
 * Một row là MỘT đề chưa gắn lớp/học viên — giao bài (tạo row `assignment`)
 * là luồng riêng ở trang Lớp học, nên không có FK student/class ở đây.
 * genre là free id dạng đề (chart/table/.../discuss/...) — thêm dạng đề mới
 * không cần migration.
 */
export const assignmentPrompt = sqliteTable(
	"assignment_prompt",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		task: text("task").notNull(), // "task1" | "task2"
		genre: text("genre").notNull(),
		title: text("title").notNull(),
		band: text("band").notNull().default("7.0"), // "6.0".."7.5"
		source: text("source").notNull().default(""),
		prompt: text("prompt").notNull(),
		note: text("note").notNull().default(""),
		status: text("status").notNull().default("draft"), // "draft" | "ready"
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("assignment_prompt_org_idx").on(table.orgId)],
);
