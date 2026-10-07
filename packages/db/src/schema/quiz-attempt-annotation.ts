import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization";
import { quizAttempt } from "./quiz-attempt";

/**
 * Highlight + ghi chú giáo viên trên bài Writing (#332). `start_offset` /
 * `end_offset` là index UTF-16 code unit (giống `String.slice`) trên
 * `quiz_attempt.essay` — essay đóng băng sau khi nộp (PATCH essay trả 409
 * khi đã submitted, không có retake) nên offset luôn ổn định. Không lưu
 * trích đoạn; client cắt từ essay theo offset. Không cho highlight chồng
 * nhau — kiểm ở server (409 OVERLAP), render bỏ qua đoạn chồng để không
 * vỡ UI nếu dữ liệu lỗi. Mỗi highlight lưu ngay bằng một dòng riêng, không
 * gắn với nút lưu điểm.
 */
export const quizAttemptAnnotation = sqliteTable(
	"quiz_attempt_annotation",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		attemptId: text("attempt_id")
			.notNull()
			.references(() => quizAttempt.id, { onDelete: "cascade" }),
		startOffset: integer("start_offset").notNull(),
		endOffset: integer("end_offset").notNull(),
		note: text("note").notNull().default(""),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("quiz_attempt_annotation_attempt_idx").on(table.attemptId),
		index("quiz_attempt_annotation_org_idx").on(table.orgId),
	],
);
