import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { classAssignment } from "./class-assignment";
import { organization } from "./organization";
import { student } from "./student";

/**
 * Một lượt làm bài quiz của học viên (#283). Unique (assignmentId, studentId)
 * — 1 attempt mỗi lượt giao, không retake v1. `questionsSnapshot` là bản
 * chụp đề ĐẦY ĐỦ KEY (answer/alts) tại lúc start: teacher PATCH prompt sau
 * đó không đổi đề học viên đang làm cũng như grading (RT#3 — cùng precedent
 * title-snapshot của `class_assignment`). `answers` là JSON object
 * `{"<qIndex>": "<value>"}` được autosave từng câu bằng json_set atomic;
 * `correctCount` chỉ được ghi lúc submit (null = chưa nộp), wrong/skipped
 * luôn derive được từ snapshot + answers đã freeze. `essay` là bài viết
 * Writing (#304) — tách khỏi `answers` vì map đó gắn index câu hỏi (đề
 * Writing không có câu nào), cap 500 ký tự và đi vào gradeQuiz; cap riêng
 * 10.000 ký tự qua PATCH /attempts/:id/essay. `media_*` là file bài nói
 * Speaking học viên tải lên (#305): `mediaKey` trỏ vào object trong bucket
 * R2 `MEDIA`, null = chưa có file. Mỗi lần upload sinh key mới và ghi CAS
 * theo key cũ, nên DB không bao giờ trỏ vào object đang bị ghi đè.
 * `grade_*` là điểm + nhận xét giáo viên chấm bài Writing/Speaking; lưu là
 * ghi đè (học viên thấy ngay).
 */
export const quizAttempt = sqliteTable(
	"quiz_attempt",
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
		status: text("status").notNull().default("in_progress"), // "in_progress" | "submitted"
		questionsSnapshot: text("questions_snapshot").notNull(),
		answers: text("answers").notNull().default("{}"),
		essay: text("essay").notNull().default(""),
		mediaKey: text("media_key"),
		mediaName: text("media_name"),
		mediaType: text("media_type"),
		mediaSize: integer("media_size"),
		mediaUploadedAt: integer("media_uploaded_at", { mode: "timestamp_ms" }),
		correctCount: integer("correct_count"),
		/** Điểm giáo viên chấm Writing/Speaking: JSON `{criterion: band}`;
		 * null = chưa chấm. Band tổng derive (ieltsOverallBand), không lưu. */
		gradeScores: text("grade_scores", { mode: "json" }).$type<Record<
			string,
			number
		> | null>(),
		gradeFeedback: text("grade_feedback").notNull().default(""),
		gradedAt: integer("graded_at", { mode: "timestamp_ms" }),
		startedAt: integer("started_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("quiz_attempt_assignment_student_uq").on(
			table.assignmentId,
			table.studentId,
		),
		index("quiz_attempt_org_idx").on(table.orgId),
	],
);
