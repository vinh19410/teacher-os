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
 * Đề bài tập thư viện hệ thống (`reading` | `grammar` | `vocabulary`) dùng trong
 * bộ đề tự học (#533). Khi gán bộ đề vào lớp, bài tập này được materialize
 * idempotent thành dòng `assignment_prompt` (có `library_ref`) của trung tâm.
 */
export const libraryExercise = sqliteTable(
	"study_pack_exercise",
	{
		id: text("id").primaryKey(),
		skill: text("skill").notNull(), // "reading" | "grammar" | "vocabulary"
		part: text("part").notNull().default(""),
		type: text("type").notNull().default(""),
		title: text("title").notNull(),
		band: text("band").notNull().default("7.0"),
		intro: text("intro").notNull().default(""),
		passage: text("passage").notNull().default(""),
		questions: text("questions").notNull().default("[]"),
		optionBank: text("option_bank").notNull().default("[]"),
		note: text("note").notNull().default(""),
		status: text("status").notNull().default("draft"), // "draft" | "ready"
		createdBy: text("created_by"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("study_pack_exercise_skill_status_idx").on(table.skill, table.status),
	],
);

/**
 * Bộ đề tự học theo ngày (#533).
 * `orgId = NULL` biểu diễn bộ đề thư viện hệ thống do admin quản lý.
 */
export const studyPack = sqliteTable(
	"study_pack",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id").references(() => organization.id, {
			onDelete: "cascade",
		}),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		status: text("status").notNull().default("draft"), // "draft" | "ready"
		sourcePackId: text("source_pack_id"),
		createdBy: text("created_by"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("study_pack_org_idx").on(table.orgId),
		index("study_pack_status_idx").on(table.status),
	],
);

/**
 * Từng bài tập thuộc một ngày (`dayIndex` 1..N) trong bộ đề tự học (#533).
 */
export const studyPackItem = sqliteTable(
	"study_pack_item",
	{
		id: text("id").primaryKey(),
		packId: text("pack_id")
			.notNull()
			.references(() => studyPack.id, { onDelete: "cascade" }),
		dayIndex: integer("day_index").notNull(),
		position: integer("position").notNull().default(0),
		sourceKind: text("source_kind").notNull(), // "org_prompt" | "library_test_part" | "library_exercise"
		sourceId: text("source_id").notNull(),
		note: text("note").notNull().default(""),
	},
	(table) => [
		uniqueIndex("study_pack_item_pack_day_source_uq").on(
			table.packId,
			table.dayIndex,
			table.sourceKind,
			table.sourceId,
		),
		index("study_pack_item_pack_day_pos_idx").on(
			table.packId,
			table.dayIndex,
			table.position,
		),
	],
);

/**
 * Lượt gán một bộ đề tự học vào một lớp (#533).
 * Partial unique index trên `(class_id, pack_id) WHERE status = 'active'` đảm bảo
 * không thể gán trùng cùng một bộ đề đang chạy trên một lớp, nhưng cho phép gán lại
 * sau khi huỷ (`status = 'cancelled'`).
 */
export const classStudyPack = sqliteTable(
	"class_study_pack",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		packId: text("pack_id")
			.notNull()
			.references(() => studyPack.id, { onDelete: "restrict" }),
		title: text("title").notNull(),
		startDate: text("start_date").notNull(),
		releaseTime: text("release_time").notNull().default("06:00"),
		dueTime: text("due_time").notNull().default("17:00"),
		status: text("status").notNull().default("active"), // "active" | "cancelled"
		createdBy: text("created_by"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("class_study_pack_org_idx").on(table.orgId),
		index("class_study_pack_class_status_idx").on(table.classId, table.status),
		uniqueIndex("class_study_pack_class_pack_active_uq")
			.on(table.classId, table.packId)
			.where(sql`${table.status} = 'active'`),
	],
);
