import { sql } from "drizzle-orm";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { course } from "./course-catalog";
import { lead } from "./lead";
import { organization } from "./organization";
import { student } from "./student";

/**
 * Bộ đề kiểm tra đầu vào (`/kiem-tra-dau-vao/`, issue #515) — một org một đề
 * (D5). `draft` là JSON `PlacementContent` giáo viên đang sửa; `published` là
 * snapshot JSON `PlacementSnapshot` dựng tại thời điểm bấm Phát hành (D6).
 *
 * CAS trên `revision` chặn sửa đồng thời (409); `published_revision` ghi lại
 * `revision` tại lúc Phát hành gần nhất để tính chính xác cờ `dirty`.
 */
export const placementTest = sqliteTable("placement_test", {
	orgId: text("org_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	draft: text("draft"),
	published: text("published"),
	revision: integer("revision").notNull().default(0),
	publishedRevision: integer("published_revision"),
	publishedVersion: integer("published_version").notNull().default(0),
	publishedAt: integer("published_at", { mode: "timestamp_ms" }),
	publishedBy: text("published_by"),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

/**
 * Metadata file audio của bộ đề kiểm tra đầu vào (D8). Object thật nằm ở
 * bucket `LIBRARY_AUDIO` với key `placement/<orgId>/<id>`. Mỗi lần upload
 * sinh `id` (UUID) mới, bất biến, nên route công khai trả `Cache-Control:
 * immutable` được; file mồ côi > 24 giờ được dọn nền sau khi Phát hành (D11).
 */
export const placementTestAudio = sqliteTable(
	"placement_test_audio",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		objectKey: text("object_key").notNull(),
		name: text("name").notNull(),
		contentType: text("content_type").notNull(),
		size: integer("size").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("placement_test_audio_org_id_idx").on(table.orgId)],
);

export type PlacementSubmissionStatus = "pending_grading" | "graded";
export type PlacementAiStatus = "none" | "processing" | "drafted" | "failed";
export type PlacementSpeakingStatus =
	| "none"
	| "pending_upload"
	| "uploaded"
	| "skipped";

/**
 * Bài làm kiểm tra đầu vào 5 kỹ năng gắn với Lead (#721):
 * lưu snapshot đề tại thời điểm nộp, đáp án 3 phần tự động chấm
 * (Listening / Grammar & Vocab / Reading), bài Writing, metadata video/audio
 * Speaking (object thật lưu ở R2 bucket `MEDIA`), rubric giáo viên chấm và
 * kết quả CEFR cuối cùng đồng bộ ngược sang bảng `lead`.
 */
export const placementTestSubmission = sqliteTable(
	"placement_test_submission",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
		studentId: text("student_id").references(() => student.id, {
			onDelete: "set null",
		}),
		testVersion: integer("test_version").notNull().default(0),
		snapshotJson: text("snapshot_json").notNull(),
		answersJson: text("answers_json").notNull(),
		listeningCorrect: integer("listening_correct").notNull().default(0),
		listeningTotal: integer("listening_total").notNull().default(0),
		gvCorrect: integer("gv_correct").notNull().default(0),
		gvTotal: integer("gv_total").notNull().default(0),
		readingCorrect: integer("reading_correct").notNull().default(0),
		readingTotal: integer("reading_total").notNull().default(0),
		objectiveBreakdownJson: text("objective_breakdown_json").notNull(),
		writingText: text("writing_text").notNull().default(""),
		writingWordCount: integer("writing_word_count").notNull().default(0),
		speakingStatus: text("speaking_status")
			.$type<PlacementSpeakingStatus>()
			.notNull()
			.default("none"),
		speakingMediaKey: text("speaking_media_key"),
		speakingMediaMime: text("speaking_media_mime"),
		speakingMediaSize: integer("speaking_media_size"),
		speakingDurationSec: integer("speaking_duration_sec"),
		uploadTokenHash: text("upload_token_hash"),
		uploadTokenExpiresAt: integer("upload_token_expires_at", {
			mode: "timestamp_ms",
		}),
		status: text("status")
			.$type<PlacementSubmissionStatus>()
			.notNull()
			.default("pending_grading"),
		writingRubricJson: text("writing_rubric_json"),
		/** Điểm Writing kiểu cũ (0–15 nguyên). Null với bài chấm theo chuẩn IELTS. */
		writingScore: integer("writing_score"),
		/** Điểm tổng Writing theo IELTS (0–9, bước 0.5). Null với bài chấm kiểu cũ. */
		writingBand: real("writing_band"),
		/** JSON `PlacementWritingCriterionComments` nhận xét giáo viên theo 4 tiêu chí Writing. */
		writingCriterionCommentsJson: text("writing_criterion_comments_json"),
		speakingRubricJson: text("speaking_rubric_json"),
		/** Điểm Speaking kiểu cũ (0–20 nguyên). Null với bài chấm theo chuẩn IELTS. */
		speakingScore: integer("speaking_score"),
		/** Điểm tổng Speaking theo IELTS (0–9, bước 0.5). Null với bài chấm kiểu cũ. */
		speakingBand: real("speaking_band"),
		/** JSON `PlacementSpeakingCriterionComments` nhận xét giáo viên theo 4 tiêu chí Speaking. */
		speakingCriterionCommentsJson: text("speaking_criterion_comments_json"),
		teacherFeedback: text("teacher_feedback").notNull().default(""),
		/**
		 * Chấm nháp AI Writing/Speaking (#730). `ai_status`:
		 * `none` (chưa/không chấm) → `processing` → `drafted` | `failed`.
		 * Chuyển trạng thái CAS trên `ai_status`; nháp `processing` quá hạn bị
		 * sweep về `failed` (AI_GRADING_TIMEOUT). Nháp chỉ giáo viên thấy.
		 */
		aiStatus: text("ai_status")
			.$type<PlacementAiStatus>()
			.notNull()
			.default("none"),
		aiErrorCode: text("ai_error_code"),
		aiStartedAt: integer("ai_started_at", { mode: "timestamp_ms" }),
		aiDraftedAt: integer("ai_drafted_at", { mode: "timestamp_ms" }),
		/** JSON `PlacementAiSkillDraft` Writing (chỉ danh sách lỗi). */
		aiWritingJson: text("ai_writing_json"),
		/** JSON `PlacementAiSkillDraft` Speaking (chỉ danh sách lỗi). */
		aiSpeakingJson: text("ai_speaking_json"),
		/**
		 * Id job OpenAI Responses (background mode) đang chạy cho lượt chấm
		 * hiện tại — finalize lười poll các id này khi giáo viên mở bài. Null
		 * khi kỹ năng đó không có job hoặc job đã có kết quả.
		 */
		aiWritingResponseId: text("ai_writing_response_id"),
		aiSpeakingResponseId: text("ai_speaking_response_id"),
		/** Transcript lời nói Speaking (AI chuyển từ audio). */
		speakingTranscript: text("speaking_transcript").notNull().default(""),
		/** JSON `PlacementAiError[]` giáo viên chốt — thứ học viên thấy. */
		writingErrorsJson: text("writing_errors_json"),
		speakingErrorsJson: text("speaking_errors_json"),
		/**
		 * Token link kết quả công khai (sinh lúc chốt lần đầu, giữ nguyên
		 * khi chốt lại). Lưu thô để giáo viên copy lại link bất cứ lúc nào —
		 * chỉ lộ cho giáo viên cùng org; null = chưa chốt.
		 */
		resultToken: text("result_token"),
		resultPublishedAt: integer("result_published_at", {
			mode: "timestamp_ms",
		}),
		/** "sent" | "failed" | "skipped" (không có email) — lần chốt gần nhất. */
		resultEmailStatus: text("result_email_status"),
		finalBandLevel: text("final_band_level"),
		finalCourseId: text("final_course_id").references(() => course.id, {
			onDelete: "set null",
		}),
		finalCourse: text("final_course"),
		finalDisplayCourse: text("final_display_course"),
		finalScorePct: integer("final_score_pct"),
		finalNote: text("final_note").notNull().default(""),
		gradedBy: text("graded_by"),
		gradedAt: integer("graded_at", { mode: "timestamp_ms" }),
		ipHash: text("ip_hash").notNull().default(""),
		submittedAt: integer("submitted_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("placement_test_submission_org_lead_created_idx").on(
			table.orgId,
			table.leadId,
			table.submittedAt,
		),
		index("placement_test_submission_org_student_created_idx").on(
			table.orgId,
			table.studentId,
			table.submittedAt,
		),
		index("placement_test_submission_ip_created_idx").on(
			table.ipHash,
			table.submittedAt,
		),
		uniqueIndex("placement_test_submission_result_token_uq").on(
			table.resultToken,
		),
		index("placement_test_submission_ai_status_idx").on(
			table.aiStatus,
			table.aiStartedAt,
		),
	],
);
