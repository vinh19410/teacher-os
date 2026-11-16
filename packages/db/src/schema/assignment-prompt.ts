import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization } from "./organization";

/**
 * Ngân hàng đề IELTS 4 kỹ năng (design "Thêm đề vào ngân hàng", 2026-09-21).
 * Một row là MỘT đề chưa gắn lớp/học viên — giao bài (tạo row `assignment`)
 * là luồng riêng ở trang Lớp học, nên không có FK student/class ở đây.
 * task/genre are legacy compatibility columns; skill/part/type are the
 * canonical v5 catalog identifiers.
 */
export const assignmentPrompt = sqliteTable(
	"assignment_prompt",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		task: text("task").notNull(), // "task1" | "task2"
		genre: text("genre").notNull(),
		skill: text("skill").notNull().default("writing"),
		part: text("part").notNull().default(""),
		type: text("type").notNull().default(""),
		title: text("title").notNull(),
		band: text("band").notNull().default("7.0"), // "6.0".."7.5"
		level: text("level").notNull().default(""),
		source: text("source").notNull().default(""),
		prompt: text("prompt").notNull(),
		intro: text("intro").notNull().default(""),
		passage: text("passage").notNull().default(""),
		transcript: text("transcript").notNull().default(""),
		cueTopic: text("cue_topic").notNull().default(""),
		cuePoints: text("cue_points").notNull().default(""),
		audioName: text("audio_name").notNull().default(""),
		audioUrl: text("audio_url").notNull().default(""),
		imageUrl: text("image_url").notNull().default(""),
		questions: text("questions").notNull().default("[]"),
		/**
		 * Ngân hàng lựa chọn có cấu trúc cho các dạng matching + listening map
		 * (phase-02 FR1): JSON array of strings, `[]` = không có bank (đề cũ).
		 * Contracts cap 8 mục (`ASSIGNMENT_OPTION_BANK_MAX`) — nhãn chỉ có
		 * 8 giá trị (A–H / i–viii).
		 */
		optionBank: text("option_bank").notNull().default("[]"),
		note: text("note").notNull().default(""),
		status: text("status").notNull().default("draft"), // "draft" | "ready"
		/** #574: phần Writing đính kèm tuỳ chọn trên đề tự chấm (`writing_part IS NOT NULL` = đề gộp). */
		writingPart: text("writing_part"),
		writingType: text("writing_type"),
		writingPrompt: text("writing_prompt").notNull().default(""),
		libraryRef: text("library_ref"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("assignment_prompt_org_idx").on(table.orgId),
		uniqueIndex("assignment_prompt_org_library_ref_uq").on(
			table.orgId,
			table.libraryRef,
		),
	],
);
