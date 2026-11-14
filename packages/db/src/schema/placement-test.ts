import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { lead } from "./lead";
import { organization } from "./organization";

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
		leadId: text("lead_id")
			.notNull()
			.references(() => lead.id, { onDelete: "cascade" }),
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
		writingScore: integer("writing_score"),
		speakingRubricJson: text("speaking_rubric_json"),
		speakingScore: integer("speaking_score"),
		teacherFeedback: text("teacher_feedback").notNull().default(""),
		finalBandLevel: text("final_band_level"),
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
		index("placement_test_submission_ip_created_idx").on(
			table.ipHash,
			table.submittedAt,
		),
	],
);
