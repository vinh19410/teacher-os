/**
 * Plan #413 phase 2 — migration 0043 (thư viện đề toàn hệ thống) là
 * migration thuần CỘNG THÊM: chỉ CREATE TABLE/CREATE INDEX cho
 * `library_test` + `library_test_part`, không đụng bảng cũ. Test áp toàn
 * bộ migration lên DB trống, xác nhận: chỉ có DDL tạo mới, FK cascade,
 * unique (testId, part), audio nullable, và default JSON '[]'.
 */
import { readdirSync, readFileSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function migrationFiles(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name))
		.sort();
}

function statements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter(Boolean);
}

/** Migration 0043 — file sinh bởi `pnpm db:generate` (drizzle tự đánh số). */
const LIBRARY_MIGRATION = migrationFiles().find((name) =>
	/^0043_.+\.sql$/.test(name),
);

async function applyAll(client: Client) {
	for (const fileName of migrationFiles()) {
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) {
			await client.execute(statement);
		}
	}
}

describe("library test migration (plan #413 phase 2)", () => {
	test("migration 0043 tồn tại và chỉ chứa CREATE TABLE/CREATE INDEX", () => {
		expect(LIBRARY_MIGRATION).toBeTruthy();
		const sql = readFileSync(`${MIGRATIONS_DIR}/${LIBRARY_MIGRATION}`, "utf8");
		const rawStatements = sql
			.split("--> statement-breakpoint")
			.map((part) => part.trim())
			.filter(Boolean);
		expect(rawStatements.length).toBeGreaterThan(0);
		for (const statement of rawStatements) {
			expect(/^CREATE (TABLE|UNIQUE INDEX|INDEX)/.test(statement)).toBe(true);
		}
		// Chỉ tạo đúng 2 bảng mới, không đụng bảng cũ (không ALTER/DML).
		expect(sql).toContain("CREATE TABLE `library_test`");
		expect(sql).toContain("CREATE TABLE `library_test_part`");
		for (const statement of rawStatements) {
			expect(statement).not.toMatch(/^(ALTER|DROP|UPDATE|INSERT|DELETE)\b/i);
		}
	});

	test("áp toàn bộ migration lên DB trống thành công", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);
		const tables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'library%' ORDER BY name",
		);
		expect(tables.rows.map((row) => row.name)).toEqual([
			"library_test",
			"library_test_part",
		]);
	});

	test("chèn test + part; FK cascade xóa part khi xóa test", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);

		await client.execute(
			"INSERT INTO library_test (id, title, skill, created_by) VALUES ('t1', 'Cam 15 Test 1', 'reading', 'u1')",
		);
		await client.execute(
			`INSERT INTO library_test_part (id, test_id, part, questions) VALUES ('p1', 't1', 'p1', '[{"stem":"q"}]')`,
		);

		// Default cột: status draft, time 3600, questions/optionBank '[]'.
		const test = await client.execute("SELECT * FROM library_test WHERE id = 't1'");
		expect(test.rows[0].status).toBe("draft");
		expect(Number(test.rows[0].time_limit_seconds)).toBe(3600);

		const part = await client.execute(
			"SELECT * FROM library_test_part WHERE id = 'p1'",
		);
		expect(part.rows[0].questions).toBe('[{"stem":"q"}]');
		expect(part.rows[0].option_bank).toBe("[]");
		expect(part.rows[0].audio_key).toBeNull();
		expect(part.rows[0].audio_uploaded_at).toBeNull();

		// Cascade: xóa test kéo theo part.
		await client.execute("DELETE FROM library_test WHERE id = 't1'");
		const remaining = await client.execute(
			"SELECT COUNT(*) AS n FROM library_test_part",
		);
		expect(Number(remaining.rows[0].n)).toBe(0);
	});

	test("unique (test_id, part) chặn 2 part cùng slot", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);
		await client.execute(
			"INSERT INTO library_test (id, title, skill) VALUES ('t1', 'Test', 'listening')",
		);
		await client.execute(
			"INSERT INTO library_test_part (id, test_id, part) VALUES ('p1', 't1', 's1')",
		);
		await expect(
			client.execute(
				"INSERT INTO library_test_part (id, test_id, part) VALUES ('p2', 't1', 's1')",
			),
		).rejects.toThrow();
		// Khác test thì trùng part vẫn hợp lệ.
		await client.execute(
			"INSERT INTO library_test (id, title, skill) VALUES ('t2', 'Test 2', 'listening')",
		);
		await client.execute(
			"INSERT INTO library_test_part (id, test_id, part) VALUES ('p3', 't2', 's1')",
		);
		const rows = await client.execute(
			"SELECT COUNT(*) AS n FROM library_test_part",
		);
		expect(Number(rows.rows[0].n)).toBe(2);
	});

	test("FK test_id chặn orphan; bảng cũ không bị đụng", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyAll(client);
		await expect(
			client.execute(
				"INSERT INTO library_test_part (id, test_id, part) VALUES ('x1', 'ghost', 'p1')",
			),
		).rejects.toThrow();

		// Bảng org-scoped cũ vẫn nguyên vẹn (migration không ALTER).
		await client.execute(
			"INSERT INTO organization (id, name) VALUES ('o1', 'Org1')",
		);
		await client.execute(
			"INSERT INTO assignment_prompt (id, org_id, task, genre, title, prompt) VALUES ('ap1', 'o1', 'task1', 'opinion', 'Prompt', 'prompt')",
		);
		const prompts = await client.execute(
			"SELECT COUNT(*) AS n FROM assignment_prompt",
		);
		expect(Number(prompts.rows[0].n)).toBe(1);
	});
});
