import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Khóa học từ vựng dùng chung toàn hệ thống (#361).
 * - Không có `orgId`/`classId`: mọi giáo viên thuộc mọi tổ chức đều đọc được.
 * - `id` là khóa chính deterministic suy ra từ master CSV (`libcourse-<csvId>`)
 *   để seed pipeline chạy lại idempotent bằng `ON CONFLICT(id) DO UPDATE`.
 */
export const vocabLibraryCourse = sqliteTable("vocab_library_course", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	target: text("target"),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

/**
 * Bài học (lesson/deck mẫu) thuộc một `vocab_library_course` (#361).
 * - Global read-only catalog; khi giáo viên chọn giao cho lớp, server clone
 *   thành bản ghi `vocab_deck` thường thuộc `orgId`/`classId` của caller.
 * - `id` deterministic dạng `libdeck-<csvId>`.
 */
export const vocabLibraryDeck = sqliteTable(
	"vocab_library_deck",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => vocabLibraryCourse.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		imageUrl: text("image_url"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("vocab_library_deck_course_idx").on(table.courseId)],
);

/**
 * Mục từ vựng mẫu trong `vocab_library_deck` (#361).
 * - `id` deterministic dạng `libword-<csvId>` (dùng cột `id` unique của CSV,
 *   không dùng `lessonDetailId` vì cột đó bị trùng lặp giữa các khóa).
 * - Giữ toàn bộ trường phong phú từ master CSV (`pos`, `sentenceVi`, `sentenceEn`,
 *   `pictureUrl`, `audioUrl`) để bảo toàn dữ liệu cho các tính năng tương lai,
 *   dù bước clone hiện tại chỉ chép `word`, `ipa`, `translation`, `audioUrl`, `sortOrder`.
 */
export const vocabLibraryWord = sqliteTable(
	"vocab_library_word",
	{
		id: text("id").primaryKey(),
		deckId: text("deck_id")
			.notNull()
			.references(() => vocabLibraryDeck.id, { onDelete: "cascade" }),
		word: text("word").notNull(),
		ipa: text("ipa"),
		pos: text("pos"),
		translation: text("translation").notNull().default(""),
		sentenceVi: text("sentence_vi"),
		sentenceEn: text("sentence_en"),
		pictureUrl: text("picture_url"),
		audioUrl: text("audio_url"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("vocab_library_word_deck_idx").on(table.deckId)],
);
