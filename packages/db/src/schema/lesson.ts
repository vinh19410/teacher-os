import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { enrollment } from "./enrollment";
import { organization } from "./organization";

/**
 * A scheduled session belongs to a class and exactly one enrollment —
 * invariant 2 (teaching happens in class; 1:1 = class + one enrollment).
 * Distinct from syllabus_lesson (invariant 5): this row is delivered
 * teaching, not curriculum. No create path yet — rows arrive via helper
 * inserts until a later wave adds scheduling. done/remaining are never
 * stored here or on session_package; they derive from completed rows
 * (invariant 6), which is why (enrollmentId, status) is indexed.
 *
 * `date` (issue #98) is the occurrence identity: every lesson row of a class
 * sharing the same `yyyy-mm-dd` value IS one physical session. Unlike
 * syllabus titles (derived display-only), this is a persisted fact mutable
 * through a user action (`sessions/:date/edit` with moveDate moves the whole
 * bucket), following the code-standards carve-out
 * "fact-mutable-via-user-action gets persisted". It stays NULL for classes
 * whose rows diverge from their schedule heuristic — NULL is per-class (the
 * backfill and generator either stamp a full class or none of it), so any
 * NULL in a class means "render via the frozen legacy path". Class fields
 * (schedule / startDate / sessionsTotal) are treated as immutable after
 * creation: if that ever changes, the date-attach skeleton must be
 * recomputed and this contract revisited.
 */
export const lesson = sqliteTable(
	"lesson",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		enrollmentId: text("enrollment_id")
			.notNull()
			.references(() => enrollment.id, { onDelete: "cascade" }),
		day: integer("day").notNull(),
		time: text("time").notNull(),
		dur: integer("dur").notNull(),
		/** Occurrence identity yyyy-mm-dd (UTC-anchored); NULL = legacy class. */
		date: text("date"),
		type: text("type").notNull().default("1:1"),
		status: text("status").notNull().default("upcoming"),
		/**
		 * TOS-7 (#440): trạng thái điểm danh chi tiết — `present | late |
		 * excused | unexcused`. NULL = chưa ghi chi tiết (dòng cũ hoặc điểm
		 * danh 1-click; quy ước hiển thị `NULL + completed` là "Có mặt").
		 * Ánh xạ sang `status` (D2): present/late/unexcused → completed
		 * (trừ buổi), excused → absent (không trừ) — hàm duy nhất
		 * `lessonStatusForAttendance` ở @teacher-os/api contracts.
		 */
		attendance: text("attendance"),
		/** Ghi chú học vụ của giáo viên (≤255). Teacher-only — không bao giờ chiếu vào /api/student. */
		attendanceNote: text("attendance_note"),
		topic: text("topic").notNull().default(""),
		zoom: text("zoom").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("lesson_org_idx").on(table.orgId),
		index("lesson_enrollment_idx").on(table.enrollmentId, table.status),
		index("lesson_class_date_idx").on(table.classId, table.date),
	],
);
