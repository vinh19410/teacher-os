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
import { student } from "./student";

/**
 * Lượt giao đề ngân hàng cho một lớp (#208). Một row = MỘT lượt giao; `title`
 * là snapshot tên đề lúc giao — đề đổi tên sau đó không ảnh hưởng bài đã giao.
 * Bảng `assignment` (grading per-student) không đụng; trạng thái nộp sống ở
 * `class_assignment_target.submittedAt` và hoàn toàn derived cho tới khi có
 * write-path đánh dấu nộp (Non-Goal plan #208).
 */
export const classAssignment = sqliteTable(
	"class_assignment",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		promptId: text("prompt_id")
			.notNull()
			.references(() => assignmentPrompt.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		due: text("due").notNull(), // ISO yyyy-mm-dd (so ngày được, khác dd/mm display)
		note: text("note").notNull().default(""),
		dueAt: integer("due_at", { mode: "timestamp_ms" }),
		availableAt: integer("available_at", { mode: "timestamp_ms" }),
		classStudyPackId: text("class_study_pack_id"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("class_assignment_org_idx").on(table.orgId),
		index("class_assignment_class_idx").on(table.classId),
		index("class_assignment_study_pack_idx").on(table.classStudyPackId),
	],
);

/**
 * Học viên nhận một lượt giao: unique (assignmentId, studentId) — một học viên
 * chỉ xuất hiện một lần mỗi lượt. `submittedAt` null = chưa nộp.
 */
export const classAssignmentTarget = sqliteTable(
	"class_assignment_target",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		assignmentId: text("assignment_id")
			.notNull()
			.references(() => classAssignment.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		submittedAt: text("submitted_at"), // ISO 8601 datetime string (toISOString()) | null
	},
	(table) => [
		uniqueIndex("class_assignment_target_assignment_student_uq").on(
			table.assignmentId,
			table.studentId,
		),
		index("class_assignment_target_org_idx").on(table.orgId),
		index("class_assignment_target_assignment_idx").on(table.assignmentId),
	],
);
