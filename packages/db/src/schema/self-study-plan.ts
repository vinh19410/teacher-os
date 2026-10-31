import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { assignmentPrompt } from "./assignment-prompt";
import { classTable } from "./class";
import { organization } from "./organization";

export const SELF_STUDY_PLAN_STATUSES = [
	"draft",
	"published",
	"completed",
	"cancelled",
] as const;
export type SelfStudyPlanStatus = (typeof SELF_STUDY_PLAN_STATUSES)[number];

export const SELF_STUDY_PLAN_DAY_STATUSES = [
	"pending",
	"released",
	"skipped",
	"missed",
] as const;
export type SelfStudyPlanDayStatus =
	(typeof SELF_STUDY_PLAN_DAY_STATUSES)[number];

/**
 * Kế hoạch tự học dài hạn của một lớp (#526).
 * Partial unique index trên `class_id WHERE status = 'published'` đảm bảo mỗi
 * lớp chỉ có tối đa một plan đang chạy tại một thời điểm.
 */
export const selfStudyPlan = sqliteTable(
	"self_study_plan",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		title: text("title").notNull().default("Kế hoạch tự học"),
		startDate: text("start_date").notNull(), // ISO yyyy-mm-dd
		endDate: text("end_date").notNull(), // ISO yyyy-mm-dd
		releaseTime: text("release_time").notNull().default("06:00"), // HH:MM VN
		dueTime: text("due_time").notNull().default("17:00"), // HH:MM VN
		status: text("status")
			.$type<SelfStudyPlanStatus>()
			.notNull()
			.default("draft"),
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		completedAt: integer("completed_at", { mode: "timestamp_ms" }),
		cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("self_study_plan_org_idx").on(table.orgId),
		index("self_study_plan_class_idx").on(table.classId),
		uniqueIndex("self_study_plan_class_published_uq")
			.on(table.classId)
			.where(sql`${table.status} = 'published'`),
	],
);

/**
 * Một ngày trong kế hoạch tự học (#526).
 * `releaseAt` và `dueAt` là thời điểm tuyệt đối (timestamp_ms) tính sẵn từ
 * `date` + `releaseTime`/`dueTime` theo giờ Việt Nam để cron job quét không
 * phụ thuộc cấu hình giờ tĩnh.
 */
export const selfStudyPlanDay = sqliteTable(
	"self_study_plan_day",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		planId: text("plan_id")
			.notNull()
			.references(() => selfStudyPlan.id, { onDelete: "cascade" }),
		date: text("date").notNull(), // ISO yyyy-mm-dd
		releaseAt: integer("release_at", { mode: "timestamp_ms" }).notNull(),
		dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
		status: text("status")
			.$type<SelfStudyPlanDayStatus>()
			.notNull()
			.default("pending"),
		holidayOverride: integer("holiday_override", { mode: "boolean" })
			.notNull()
			.default(false),
		warning: text("warning").notNull().default(""),
		notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
		releasedAt: integer("released_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("self_study_plan_day_plan_date_uq").on(
			table.planId,
			table.date,
		),
		index("self_study_plan_day_pending_release_idx").on(
			table.status,
			table.releaseAt,
		),
		index("self_study_plan_day_org_idx").on(table.orgId),
	],
);

/**
 * Đề ngân hàng (`assignment_prompt` ở trạng thái `ready`) gắn vào một ngày của
 * kế hoạch tự học (#526).
 */
export const selfStudyPlanItem = sqliteTable(
	"self_study_plan_item",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		planId: text("plan_id")
			.notNull()
			.references(() => selfStudyPlan.id, { onDelete: "cascade" }),
		date: text("date").notNull(), // ISO yyyy-mm-dd
		promptId: text("prompt_id")
			.notNull()
			.references(() => assignmentPrompt.id, { onDelete: "cascade" }),
		position: integer("position").notNull().default(0),
		note: text("note").notNull().default(""),
	},
	(table) => [
		uniqueIndex("self_study_plan_item_plan_date_prompt_uq").on(
			table.planId,
			table.date,
			table.promptId,
		),
		index("self_study_plan_item_plan_date_idx").on(
			table.planId,
			table.date,
			table.position,
		),
	],
);
