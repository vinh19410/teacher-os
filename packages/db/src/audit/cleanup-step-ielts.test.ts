import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
	auditStepIelts,
	buildStepIeltsCleanupPlan,
	createLibsqlStepIeltsRunner,
	formatStepIeltsAuditReport,
	matchesStepIelts,
	runStepIeltsCleanup,
} from "./cleanup-step-ielts";

const DDL = [
	`CREATE TABLE library_test (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT,
		skill TEXT NOT NULL DEFAULT 'reading',
		time_limit_seconds INTEGER NOT NULL DEFAULT 3600,
		collection TEXT,
		test_group TEXT,
		status TEXT NOT NULL DEFAULT 'draft',
		created_by TEXT,
		created_at INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE assignment_test (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT,
		skill TEXT NOT NULL DEFAULT 'reading',
		time_limit_seconds INTEGER,
		collection TEXT,
		test_group TEXT,
		status TEXT NOT NULL DEFAULT 'draft',
		library_ref TEXT,
		created_at INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE library_test_part (
		id TEXT PRIMARY KEY,
		test_id TEXT NOT NULL,
		part TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT '',
		title TEXT NOT NULL DEFAULT '',
		band TEXT NOT NULL DEFAULT '7.0',
		source TEXT NOT NULL DEFAULT '',
		intro TEXT NOT NULL DEFAULT '',
		passage TEXT NOT NULL DEFAULT '',
		transcript TEXT NOT NULL DEFAULT '',
		image_url TEXT NOT NULL DEFAULT '',
		questions TEXT NOT NULL DEFAULT '[]',
		option_bank TEXT NOT NULL DEFAULT '[]',
		groups TEXT NOT NULL DEFAULT '[]',
		note TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE assignment_prompt (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		skill TEXT NOT NULL DEFAULT 'reading',
		part TEXT NOT NULL DEFAULT 'p1',
		title TEXT NOT NULL DEFAULT '',
		source TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE study_pack (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
	`CREATE TABLE material (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL DEFAULT 0
	)`,
];

async function setupTestDb() {
	const client = createClient({ url: ":memory:" });
	for (const stmt of DDL) {
		await client.execute(stmt);
	}
	const runner = createLibsqlStepIeltsRunner(client);
	return { client, runner };
}

describe("cleanup-step-ielts", () => {
	it("matchesStepIelts nhận diện đúng chuỗi liên quan Step IELTS", () => {
		expect(matchesStepIelts("Step IELTS")).toBe(true);
		expect(matchesStepIelts("step ielts")).toBe(true);
		expect(matchesStepIelts("stepielts")).toBe(true);
		expect(matchesStepIelts("Bộ đề Step-IELTS 2026")).toBe(true);
		expect(
			matchesStepIelts("Nguồn: https://stepielts.com/student/reading/123"),
		).toBe(true);

		expect(matchesStepIelts("Cambridge IELTS 18")).toBe(false);
		expect(matchesStepIelts("IELTS Trainer 2")).toBe(false);
		expect(matchesStepIelts("First Step/GT2")).toBe(false);
		expect(matchesStepIelts(null)).toBe(false);
		expect(matchesStepIelts("")).toBe(false);
	});

	it("auditStepIelts trả về 0 kết quả trên DB rỗng", async () => {
		const { runner } = await setupTestDb();
		const result = await auditStepIelts(runner);
		expect(result.totalMatches).toBe(0);
		expect(result.libraryTests).toHaveLength(0);
		expect(result.assignmentTests).toHaveLength(0);
	});

	it("auditStepIelts phát hiện chính xác các bản ghi có chứa Step IELTS và bỏ qua các bản ghi khác", async () => {
		const { client, runner } = await setupTestDb();

		// Insert library_test: 1 match collection, 1 match description, 1 clean
		await client.execute({
			sql: "INSERT INTO library_test (id, title, collection, description) VALUES (?, ?, ?, ?)",
			args: ["lt-1", "Traffic Jams", "Step IELTS", "Mô tả bình thường"],
		});
		await client.execute({
			sql: "INSERT INTO library_test (id, title, collection, description) VALUES (?, ?, ?, ?)",
			args: [
				"lt-2",
				"Ancient Sahara",
				"Cambridge",
				"Trích dẫn từ Step IELTS 2025",
			],
		});
		await client.execute({
			sql: "INSERT INTO library_test (id, title, collection, description) VALUES (?, ?, ?, ?)",
			args: ["lt-3", "Clean Test", "Cambridge 18", "Mô tả sạch"],
		});

		// Insert assignment_test
		await client.execute({
			sql: "INSERT INTO assignment_test (id, org_id, title, collection, description, library_ref) VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				"at-1",
				"org-1",
				"Traffic Jams Org Copy",
				"Step IELTS",
				null,
				"lt-1",
			],
		});
		await client.execute({
			sql: "INSERT INTO assignment_test (id, org_id, title, collection, description, library_ref) VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				"at-2",
				"org-1",
				"Clean Org Copy",
				"Cambridge 18",
				"Mô tả",
				"lt-3",
			],
		});

		// Insert library_test_part
		await client.execute({
			sql: "INSERT INTO library_test_part (id, test_id, part, source, note) VALUES (?, ?, ?, ?, ?)",
			args: ["part-1", "lt-1", "p1", "Step IELTS", "Ghi chú thường"],
		});
		await client.execute({
			sql: "INSERT INTO library_test_part (id, test_id, part, source, note) VALUES (?, ?, ?, ?, ?)",
			args: ["part-2", "lt-3", "p1", "Cambridge", "Ghi chú thường"],
		});

		// Insert assignment_prompt
		await client.execute({
			sql: "INSERT INTO assignment_prompt (id, org_id, source) VALUES (?, ?, ?)",
			args: ["pr-1", "org-1", "Step IELTS"],
		});
		await client.execute({
			sql: "INSERT INTO assignment_prompt (id, org_id, source) VALUES (?, ?, ?)",
			args: ["pr-2", "org-1", "Cambridge 18"],
		});

		// Insert study_pack
		await client.execute({
			sql: "INSERT INTO study_pack (id, title, description) VALUES (?, ?, ?)",
			args: ["sp-1", "Gói luyện thi", "Luyện đề theo phong cách Step IELTS"],
		});

		// Insert material
		await client.execute({
			sql: "INSERT INTO material (id, title, description) VALUES (?, ?, ?)",
			args: ["mat-1", "Tài liệu", "Tài liệu tham khảo stepielts.com"],
		});

		const result = await auditStepIelts(runner);

		expect(result.totalMatches).toBe(7);
		expect(result.libraryTests).toHaveLength(2);
		expect(result.assignmentTests).toHaveLength(1);
		expect(result.libraryTestParts).toHaveLength(1);
		expect(result.assignmentPrompts).toHaveLength(1);
		expect(result.studyPacks).toHaveLength(1);
		expect(result.materials).toHaveLength(1);

		expect(
			result.libraryTests.find((t) => t.id === "lt-1")?.matchCollection,
		).toBe(true);
		expect(
			result.libraryTests.find((t) => t.id === "lt-2")?.matchDescription,
		).toBe(true);
		expect(result.assignmentTests[0]?.id).toBe("at-1");
		expect(result.libraryTestParts[0]?.id).toBe("part-1");
		expect(result.assignmentPrompts[0]?.id).toBe("pr-1");
		expect(result.studyPacks[0]?.id).toBe("sp-1");
		expect(result.materials[0]?.id).toBe("mat-1");
	});

	it("runStepIeltsCleanup làm sạch các trường dữ liệu và xác thực về 0", async () => {
		const { client, runner } = await setupTestDb();

		await client.execute({
			sql: "INSERT INTO library_test (id, title, collection, description) VALUES (?, ?, ?, ?)",
			args: ["lt-1", "Traffic Jams", "Step IELTS", "Từ Step IELTS"],
		});
		await client.execute({
			sql: "INSERT INTO assignment_test (id, org_id, title, collection, description) VALUES (?, ?, ?, ?, ?)",
			args: ["at-1", "org-1", "Traffic Jams Copy", "Step IELTS", null],
		});
		await client.execute({
			sql: "INSERT INTO library_test_part (id, test_id, part, source, note) VALUES (?, ?, ?, ?, ?)",
			args: ["part-1", "lt-1", "p1", "Step IELTS", "Step IELTS note"],
		});
		await client.execute({
			sql: "INSERT INTO assignment_prompt (id, org_id, source) VALUES (?, ?, ?)",
			args: ["pr-1", "org-1", "Step IELTS"],
		});

		const initialAudit = await auditStepIelts(runner);
		expect(initialAudit.totalMatches).toBe(4);

		const plan = buildStepIeltsCleanupPlan(initialAudit);
		expect(plan.statements).toHaveLength(4);
		expect(plan.rollbackStatements).toHaveLength(4);

		const execResult = await runStepIeltsCleanup(runner, plan);
		expect(execResult.statementsExecuted).toBe(4);
		expect(execResult.verifyResult.totalMatches).toBe(0);

		// Kiểm tra giá trị trong database sau khi làm sạch: đề thi và part vẫn còn nguyên
		const ltRows = await client.execute(
			"SELECT id, title, collection, description FROM library_test WHERE id = 'lt-1'",
		);
		expect(ltRows.rows[0]?.id).toBe("lt-1");
		expect(ltRows.rows[0]?.title).toBe("Traffic Jams");
		expect(ltRows.rows[0]?.collection).toBeNull();
		expect(ltRows.rows[0]?.description).toBeNull();

		const atRows = await client.execute(
			"SELECT id, collection FROM assignment_test WHERE id = 'at-1'",
		);
		expect(atRows.rows[0]?.collection).toBeNull();

		const partRows = await client.execute(
			"SELECT id, source, note FROM library_test_part WHERE id = 'part-1'",
		);
		expect(partRows.rows[0]?.source).toBe("");
		expect(partRows.rows[0]?.note).toBe("");

		const promptRows = await client.execute(
			"SELECT id, source FROM assignment_prompt WHERE id = 'pr-1'",
		);
		expect(promptRows.rows[0]?.source).toBe("");
	});

	it("Rollback khôi phục lại chính xác các giá trị cũ", async () => {
		const { client, runner } = await setupTestDb();

		await client.execute({
			sql: "INSERT INTO library_test (id, title, collection, description) VALUES (?, ?, ?, ?)",
			args: ["lt-1", "Traffic Jams", "Step IELTS", "Từ Step IELTS"],
		});

		const initialAudit = await auditStepIelts(runner);
		const plan = buildStepIeltsCleanupPlan(initialAudit);
		await runStepIeltsCleanup(runner, plan);

		// Lúc này đã sạch
		expect((await auditStepIelts(runner)).totalMatches).toBe(0);

		// Chạy rollback statements
		await runner.run(plan.rollbackStatements);

		// Sau rollback, dữ liệu cũ trở lại
		const rolledBackAudit = await auditStepIelts(runner);
		expect(rolledBackAudit.totalMatches).toBe(1);
		expect(rolledBackAudit.libraryTests[0]?.collection).toBe("Step IELTS");
		expect(rolledBackAudit.libraryTests[0]?.description).toBe("Từ Step IELTS");
	});

	it("formatStepIeltsAuditReport in đúng format markdown", () => {
		const result = {
			libraryTests: [
				{
					id: "lt-1",
					title: "Test 1",
					collection: "Step IELTS",
					description: "Mô tả",
					matchCollection: true,
					matchDescription: false,
				},
			],
			assignmentTests: [],
			libraryTestParts: [],
			assignmentPrompts: [],
			studyPacks: [],
			materials: [],
			totalMatches: 1,
		};
		const report = formatStepIeltsAuditReport(result);
		expect(report).toContain("Tổng số dòng khớp: **1**");
		expect(report).toContain("`lt-1`");
		expect(report).toContain("`Step IELTS` ⚠️");
	});
});
