import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { quizAttempt } from "./quiz-attempt";

/**
 * Bản nháp chấm AI của một attempt Writing/Speaking (TOS-30 #478, máy
 * trạng thái `AiGradingDraft` trong SRS selfomy-alignment): 1 dòng /
 * `quiz_attempt` (PK trùng `attempt_id`). Tách khỏi `quiz_attempt`
 * CỐ Ý: học viên đọc điểm qua `quiz_attempt.grade_scores` — bảng riêng
 * khiến nháp AI "ẩn với học viên" theo cấu trúc, không cần lọc API.
 *
 * Máy trạng thái (`status`):
 * - `ai_processing` — pipeline đang chạy (reserve → grade → settle).
 * - `ai_drafted` — AI chấm xong, giáo viên chưa rà.
 * - `teacher_reviewing` — giáo viên đã "Lưu bản nháp" (version tăng mỗi lần lưu).
 * - `manual_pending` — AI lỗi/quá hạn/thiếu Credit (hoàn Credit), chờ chấm tay.
 * - `published` — giáo viên "Chốt trả bài" qua POST /grade; học viên mở khoá.
 *
 * Chuyển trạng thái đều CAS trên `status` (WHERE status = 'giá trị cũ')
 * vì 3 luồng tranh cùng dòng: runner nền, sweep `releaseStaleGradings`,
 * route chấm của giáo viên. Ví Credit biến đổi SAU khi thắng CAS.
 */
export const aiGradingDraft = sqliteTable(
	"ai_grading_draft",
	{
		// 1 draft / attempt — idempotency "insert ON CONFLICT DO NOTHING" ở
		// pipeline chống gọi trùng khi nộp lại.
		attemptId: text("attempt_id")
			.primaryKey()
			.references(() => quizAttempt.id, { onDelete: "cascade" }),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		/** Kỹ năng chấm: "writing" | "speaking" — chốt lúc tạo draft. */
		skill: text("skill").notNull(),
		/** Xem máy trạng thái ở comment đầu file. */
		status: text("status").notNull().default("ai_processing"),
		/** Điểm gợi ý AI: JSON `{criterion: band}` theo `criteriaForSkill` —
		 * cùng key với `quiz_attempt.grade_scores` để publish không đổi shape. */
		aiScores: text("ai_scores", { mode: "json" }).$type<Record<
			string,
			number
		> | null>(),
		aiFeedback: text("ai_feedback").notNull().default(""),
		/** Điểm/nhận xét giáo viên đã "Lưu bản nháp" — điền sẵn form chấm. */
		reviewedScores: text("reviewed_scores", { mode: "json" }).$type<Record<
			string,
			number
		> | null>(),
		reviewedFeedback: text("reviewed_feedback").notNull().default(""),
		/** "standard" (TOS-30); "quick" do TOS-32 thêm. */
		gradingMode: text("grading_mode").notNull().default("standard"),
		/** Credit đã đồng ý tiêu cho lần chấm này (1 Writing / 2 Speaking). */
		creditCost: integer("credit_cost").notNull().default(0),
		/** Transcript Speaking — TOS-31 (STT) điền; TOS-30 để rỗng. */
		transcript: text("transcript").notNull().default(""),
		/** Mã lỗi pipeline: AI_GRADING_TIMEOUT | AI_GRADING_FAILED |
		 * AI_GRADING_DISABLED | AI_GRADING_NO_TRANSCRIPT. Null = không lỗi. */
		errorCode: text("error_code"),
		/** Tăng mỗi lần "Lưu bản nháp" — nền cho chống lưu đè E-011 (TOS-33). */
		version: integer("version").notNull().default(1),
		/** TOS-33 D3: số lượt "Thử chấm lại AI" đã chạy thêm sau lượt đầu
		 * (0 = lượt reserve gốc). Quyết khóa idempotency sổ cái
		 * `ai_grading:<attemptId>:r<n>:<op>` khi n ≥ 1 — mỗi lượt một bộ
		 * reserve/settle/release riêng trong sổ cái. */
		retryCount: integer("retry_count").notNull().default(0),
		startedAt: integer("started_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		draftedAt: integer("drafted_at", { mode: "timestamp_ms" }),
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		// Hàng chờ rà soát theo org + trạng thái (badge ở /grading, sweep stale).
		index("ai_grading_draft_org_status_idx").on(table.orgId, table.status),
	],
);
