import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { classTable } from "./class";
import { organization } from "./organization";
import { student } from "./student";

/**
 * Bộ từ vựng (deck) do giáo viên tạo cho một lớp học (#359).
 * Mỗi deck tương ứng một Course lesson trong mô hình Flinto: còn từ `state='new'`
 * thì học sinh vào vòng Learn (§3b), học xong toàn bộ từ mới thì sang vòng Review (§3).
 * Xoá deck ở server phải xoá tường minh `vocab_deck + vocab_word + vocab_card`
 * trong 1 `db.batch` (không dựa vào FK cascade do PRAGMA foreign_keys theo connection),
 * nhưng giữ nguyên `vocab_review_log` để bảo toàn streak/retention.
 */
export const vocabDeck = sqliteTable(
	"vocab_deck",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		classId: text("class_id")
			.notNull()
			.references(() => classTable.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		lang: text("lang").notNull().default("en"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("vocab_deck_org_idx").on(table.orgId),
		index("vocab_deck_class_idx").on(table.classId),
	],
);

/**
 * Một mục từ vựng trong `vocab_deck` (#359).
 * `audioKey` do server sinh và gán sau khi giáo viên upload file âm thanh lên R2
 * (`vocab/{orgId}/{wordId}/{uuid}`), client không bao giờ tự truyền key.
 * Khi `audioKey` là null, minigame `listeningChoice` tự động không eligible.
 */
export const vocabWord = sqliteTable(
	"vocab_word",
	{
		id: text("id").primaryKey(),
		deckId: text("deck_id")
			.notNull()
			.references(() => vocabDeck.id, { onDelete: "cascade" }),
		word: text("word").notNull(),
		ipa: text("ipa"),
		translation: text("translation").notNull().default(""),
		audioKey: text("audio_key"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("vocab_word_deck_idx").on(table.deckId)],
);

/**
 * Trạng thái SRS 5 memory levels của từng học viên trên từng từ (`docs/srs-spec.md` §1).
 * Được lazy provision khi học viên đã enroll mở deck lần đầu (`INSERT OR IGNORE`
 * theo unique `(studentId, wordId)`), với mốc `dueAt = deck.createdAt - (n - 1) + i`
 * để giữ thứ tự từ ổn định kể cả khi có request đồng thời.
 *
 * Invariants:
 * - `level` luôn trong khoảng 1..5.
 * - `isWarning` chỉ có thể `true` ở `level === 5`.
 * - `intervalDays` chỉ phục vụ hiển thị/log; thuật toán lập lịch chỉ đọc `dueAt` (epoch ms UTC).
 */
export const vocabCard = sqliteTable(
	"vocab_card",
	{
		id: text("id").primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		wordId: text("word_id")
			.notNull()
			.references(() => vocabWord.id, { onDelete: "cascade" }),
		level: integer("level").notNull().default(1),
		isWarning: integer("is_warning", { mode: "boolean" })
			.notNull()
			.default(false),
		state: text("state").$type<"new" | "review">().notNull().default("new"),
		intervalDays: integer("interval_days").notNull().default(0),
		dueAt: integer("due_at").notNull(),
		lapses: integer("lapses").notNull().default(0),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("vocab_card_student_word_uq").on(table.studentId, table.wordId),
		index("vocab_card_student_due_idx").on(table.studentId, table.dueAt),
		index("vocab_card_word_idx").on(table.wordId),
	],
);

/**
 * Nhật ký ôn tập/học từ vựng (`docs/srs-spec.md` §5 ReviewLog).
 * - `id` chính là `clientLogId` (UUID do client sinh) để đảm bảo idempotency
 *   khi retry hoặc race condition (`onConflictDoNothing`).
 * - KHÔNG đặt FK tới `vocab_card` hay `vocab_deck`, đồng thời snapshot `word` + `translation`
 *   tại thời điểm ghi để lịch sử học, streak và retention sống sót khi giáo viên xoá deck.
 */
export const vocabReviewLog = sqliteTable(
	"vocab_review_log",
	{
		id: text("id").primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		cardId: text("card_id").notNull(),
		deckId: text("deck_id").notNull(),
		sessionKind: text("session_kind").$type<"review" | "learn">().notNull(),
		grade: text("grade").$type<"good" | "again">().notNull(),
		durationMs: integer("duration_ms").notNull(),
		reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		word: text("word").notNull(),
		translation: text("translation").notNull().default(""),
	},
	(table) => [
		index("vocab_review_log_student_reviewed_idx").on(
			table.studentId,
			table.reviewedAt,
		),
	],
);
