import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { assignmentPrompt } from "./assignment-prompt";
import { organization } from "./organization";

/**
 * Đề thi hoàn chỉnh một kỹ năng (design "IELTS Full Test Builder",
 * 2026-09-28): một row là MỘT full test ghép từ các prompt trong ngân hàng
 * qua `assignment_test_part`. `skill` theo key của ASSIGNMENT_PART_TYPES;
 * `status` ready = dùng được khi giao, draft = bản nháp riêng tư.
 */
export const assignmentTest = sqliteTable(
	"assignment_test",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description"),
		skill: text("skill").notNull(), // "reading" | "listening" | "writing" | "speaking"
		/** null = không giới hạn thời gian (hợp cho Writing/Speaking). */
		timeLimitSeconds: integer("time_limit_seconds"),
		/** Bộ sưu tập nguồn, vd "IELTS Trainer 2 Academic". */
		collection: text("collection"),
		/** Nhóm đề trong bộ sưu tập, vd "TEST 5". */
		testGroup: text("test_group"),
		status: text("status").notNull().default("draft"), // "draft" | "ready"
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("assignment_test_org_idx").on(table.orgId)],
);

/**
 * Một slot của full test: trỏ tới đúng MỘT prompt ngân hàng. Slot id theo
 * `ASSIGNMENT_TEST_PRESETS` ('p1'..'p3' reading, 's1'..'s4' listening,
 * 'task1'/'task2' writing, 'part1'..'part3' speaking); unique (testId, part)
 * khiến replace-all là cách duy nhất đổi các slot — không thể có 2 prompt
 * cùng slot trong một test. Org-scoping đi qua testId (bảng không có orgId).
 */
export const assignmentTestPart = sqliteTable(
	"assignment_test_part",
	{
		id: text("id").primaryKey(),
		testId: text("test_id")
			.notNull()
			.references(() => assignmentTest.id, { onDelete: "cascade" }),
		/**
		 * RESTRICT: prompt đang nằm trong một test không được xóa khỏi ngân
		 * hàng — lỗi rõ ràng hơn orphan/client hiện lỗ.
		 */
		promptId: text("prompt_id")
			.notNull()
			.references(() => assignmentPrompt.id, { onDelete: "restrict" }),
		part: text("part").notNull(),
		position: integer("position").notNull(),
		/** Số câu bắt đầu khi đánh số nối tiếp; null = tự động theo thứ tự. */
		qStartOverride: integer("q_start_override"),
	},
	(table) => [
		uniqueIndex("assignment_test_part_test_part_unique").on(
			table.testId,
			table.part,
		),
	],
);
