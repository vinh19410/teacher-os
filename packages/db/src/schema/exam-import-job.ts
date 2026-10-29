import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Một lượt nhập đề bằng AI (TOS-24 #470, ERD `ExamImportJob`). Vòng đời
 * `import_status`: `processing` → `completed` | `failed_refunded`. Job chỉ
 * tồn tại với 5 Credit đang giữ hoặc đã trừ; reserve thua (thiếu Credit) →
 * row bị XOÁ cùng file R2 trước khi trả 402 (kongming red-team #470 — job
 * không được kẹt `processing` không credit). `content_fingerprint` tính
 * sẵn cho TOS-25 chống trùng; `draft_json` là nguồn cho cột phải của màn
 * [6] và cho TOS-26 chỉnh sửa + xuất bản.
 */
export const examImportJob = sqliteTable(
	"exam_import_job",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id").notNull(),
		createdBy: text("created_by").notNull(),
		// Key R2: "exam-imports/<orgId>/<jobId>" (prefix org chống ghép key
		// chéo tổ chức — kongming red-team #470).
		fileKey: text("file_key").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		// Số trang PDF (null với ảnh); điền sau extractor.
		pageCount: integer("page_count"),
		// SHA-256 hex của nội dung file.
		contentFingerprint: text("content_fingerprint").notNull(),
		// Mức giữ chuẩn của một lượt import (hiện luôn 5).
		heldCredits: integer("held_credits").notNull().default(5),
		// "processing" | "completed" | "failed_refunded"
		importStatus: text("import_status").notNull().default("processing"),
		// JSON string khớp contract `extractedExamDraftSchema`.
		draftJson: text("draft_json"),
		errorCode: text("error_code"),
		// Lý do thất bại khi `error_code` = E-selfomy-alignment-004 (TOS-27):
		// "timeout" | "ai_error" | "empty_result".
		errorReason: text("error_reason"),
		// ID bộ đề assignment_test đã xuất bản từ job này (TOS-26 #472, idempotent).
		publishedTestId: text("published_test_id"),
		startedAt: integer("started_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		completedAt: integer("completed_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		// Chuẩn bị chống trùng TOS-25 (non-goal ở plan này, index dựng sẵn).
		index("exam_import_job_org_fingerprint_idx").on(
			table.orgId,
			table.contentFingerprint,
		),
		index("exam_import_job_org_created_idx").on(table.orgId, table.createdAt),
	],
);
