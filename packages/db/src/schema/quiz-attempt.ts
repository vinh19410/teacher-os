import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { assignmentTest } from "./assignment-test";
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
 *
 * Phase 10 (#378) thêm tự luyện: `assignmentId` nullable vì attempt
 * `mode='practice'` KHÔNG gắn lượt giao — `testId` trỏ đề trong thư viện
 * `assignment_test` (SET NULL khi giáo viên xoá đề: attempt giữ nguyên điểm
 * đã nộp, chỉ mất tiêu đề deck — review đọc title từ snapshot-grade, server
 * hiển thị "Đề đã xoá"). Unique index trên (assignmentId, studentId) không
 * chặn practice làm lại: SQLite unique coi NULL khác nhau nên mỗi lượt tự
 * luyện là 1 row mới, không retake-limit v1. Ràng buộc logic
 * assignment ⇒ assignment_id / practice ⇒ test_id ép bằng CHECK ở mức DB,
 * route + test bảo vệ thêm. Index (org_id, student_id, mode, submitted_at)
 * phục vụ History phase 11.
 */
export const quizAttempt = sqliteTable(
	"quiz_attempt",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		assignmentId: text("assignment_id").references(() => classAssignment.id, {
			onDelete: "cascade",
		}),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		testId: text("test_id").references(() => assignmentTest.id, {
			onDelete: "set null",
		}),
		/** "assignment" (mặc định, dữ liệu cũ backfill) | "practice". */
		mode: text("mode").notNull().default("assignment"),
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
		// History phase 11: bài tự luyện của một học viên theo thời gian nộp.
		index("quiz_attempt_student_mode_idx").on(
			table.orgId,
			table.studentId,
			table.mode,
			table.submittedAt,
		),
		// Ràng buộc logic phase 10: attempt gắn lượt giao không thể tự luyện —
		// ép ở mức DB. KHÔNG có CHECK đảo "practice ⇒ test_id": FK test_id là
		// ON DELETE SET NULL, CHECK sẽ chặn chính phép SET NULL đó → xoá đề có
		// attempt practice lỗi 500 (kongming post-impl review). Ngữ nghĩa
		// "practice phải có đề" do route tạo attempt bảo vệ.
		check(
			"quiz_attempt_mode_assignment_link",
			sql`${table.mode} <> 'assignment' or ${table.assignmentId} is not null`,
		),
	],
);
