import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { syllabus } from "./syllabus";

/**
 * Teaching happens in class — invariant 2. Roster is the enrollment table,
 * never a JSON id list on this row (invariant 4).
 */
export const classTable = sqliteTable(
	"class",
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
		mode: text("mode").notNull().default("Online"),
		syllabusId: text("syllabus_id").references(() => syllabus.id),
		schedule: text("schedule").notNull().default(""),
		sessionsTotal: integer("sessions_total").notNull().default(0),
		sessionsDone: integer("sessions_done").notNull().default(0),
		status: text("status").notNull().default("active"),
		startDate: text("start_date").notNull().default(""),
		/** "auto" (default, schedule generator) | "manual" (manual session creation, issue #649). */
		schedulingMode: text("scheduling_mode").notNull().default("auto"),
		/** Học phí mỗi học viên (VND) cho toàn khóa; null = chưa thiết lập.
		 * User-action ghi: tạo lớp (POST /api/classes), sửa học phí lớp (POST /api/classes/:id/tuition-fee).
		 * Per-student theo yêu cầu — KHÔNG phải tổng học phí cả lớp; không derive từ invoice (persist-vs-derive carve-out). */
		tuitionFee: integer("tuition_fee"),
		notes: text("notes").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("class_org_idx").on(table.orgId)],
);
