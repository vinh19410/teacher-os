import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Thư viện đề toàn hệ thống (plan #413, phase 2). Theo precedent
 * `vocab_library_*`: KHÔNG `orgId` — mọi tổ chức đều đọc được, chỉ admin
 * ghi; `id` do server sinh. `skill` (`reading`|`listening`) là immutable
 * sau tạo — enforce ở contract/route, không ở DB (SQLite không có ENUM).
 */
export const libraryTest = sqliteTable(
	"library_test",
	{
		id: text("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description"),
		// "reading" | "listening"
		skill: text("skill").notNull(),
		/** Mặc định 60 phút; immutable-skill nhưng thời gian vẫn chỉnh được. */
		timeLimitSeconds: integer("time_limit_seconds").notNull().default(3600),
		/** Bộ sưu tập nguồn, vd "IELTS Trainer 2 Academic" (giống assignment_test). */
		collection: text("collection"),
		/** Nhóm đề trong bộ sưu tập, vd "TEST 5". */
		testGroup: text("test_group"),
		// "draft" | "ready"
		status: text("status").notNull().default("draft"),
		/**
		 * User id người tạo — không FK cứng để xóa user không xóa đề
		 * (dữ liệu thư viện sống độc lập với tài khoản).
		 */
		createdBy: text("created_by"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("library_test_skill_status_idx").on(table.skill, table.status)],
);

/**
 * Một slot của đề trong thư viện. Cột map 1-1 với `assignment_prompt`
 * (trừ các cột chỉ dùng cho Writing/Speaking: task, genre, cueTopic,
 * cuePoints, prompt) để clone đề vào ngân hàng org sau này copy thẳng.
 * `questions`/`optionBank` là JSON text — cùng shape contract
 * `assignmentQuestionSchema` / optionBank của assignment_prompt.
 * Audio nullable: listening ready cần đủ audio mọi part (gate ở contract).
 */
export const libraryTestPart = sqliteTable(
	"library_test_part",
	{
		id: text("id").primaryKey(),
		testId: text("test_id")
			.notNull()
			.references(() => libraryTest.id, { onDelete: "cascade" }),
		// "p1".."p3" (reading) | "s1".."s4" (listening)
		part: text("part").notNull(),
		type: text("type").notNull().default(""),
		title: text("title").notNull().default(""),
		band: text("band").notNull().default("7.0"), // "6.0".."7.5"
		source: text("source").notNull().default(""),
		intro: text("intro").notNull().default(""),
		passage: text("passage").notNull().default(""),
		transcript: text("transcript").notNull().default(""),
		imageUrl: text("image_url").notNull().default(""),
		questions: text("questions").notNull().default("[]"),
		/** JSON array of strings, cap 8 mục — cùng contract assignment_prompt. */
		optionBank: text("option_bank").notNull().default("[]"),
		note: text("note").notNull().default(""),
		audioKey: text("audio_key"),
		audioName: text("audio_name"),
		audioContentType: text("audio_content_type"),
		audioSize: integer("audio_size"),
		audioUploadedAt: integer("audio_uploaded_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("library_test_part_test_part_unique").on(
			table.testId,
			table.part,
		),
	],
);
