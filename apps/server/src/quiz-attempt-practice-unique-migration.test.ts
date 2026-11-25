/**
 * Proves migration 0090 deduplicates pre-existing in_progress practice attempts
 * safely on SQLite/D1 (preserving richest student work, Speaking R2 media, and
 * MIN(started_at) strictly across in_progress rows, tolerating malformed JSON)
 * and enforces quiz_attempt_practice_in_progress_uq.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);
const TARGET_MIGRATION = "0090_concerned_mach_iv.sql";

function statements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter(Boolean);
}

async function applyBeforeTarget(client: Client) {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name))
		.sort();
	for (const fileName of files) {
		if (fileName >= TARGET_MIGRATION) break;
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) await client.execute(statement);
	}
}

async function applyTarget(client: Client) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${TARGET_MIGRATION}`, "utf8");
	for (const statement of statements(sql)) await client.execute(statement);
}

async function seedBase(): Promise<Client> {
	const client = createClient({ url: "file::memory:" });
	await applyBeforeTarget(client);
	await client.execute("PRAGMA foreign_keys = ON");
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy')",
	);
	await client.execute(
		"INSERT INTO student (id, org_id, name, email) VALUES ('student-1', 'org-1', 'Hoa', 'hoa@test.local')",
	);
	await client.execute(
		`INSERT INTO assignment_test (id, org_id, title, skill, time_limit_seconds, status) VALUES
			('test-a', 'org-1', 'Reading A', 'reading', 1200, 'ready'),
			('test-b', 'org-1', 'Reading B', 'reading', 1200, 'ready'),
			('test-c', 'org-1', 'Reading C', 'reading', 1200, 'ready'),
			('test-d', 'org-1', 'Speaking D', 'speaking', 600, 'ready'),
			('test-e', 'org-1', 'Reading E', 'reading', 1200, 'ready'),
			('test-mal', 'org-1', 'Malformed F', 'reading', 1200, 'ready')`,
	);
	return client;
}

describe("quiz_attempt practice in_progress unique migration 0090", () => {
	test("deduplicates by content richness, preserves MIN(started_at) strictly over in_progress rows, handles malformed JSON, and enforces uniqueness", async () => {
		const client = await seedBase();

		// Case A: Row 1 earlier + empty {} vs Row 2 later + real answer → Row 2 wins with Row 1's started_at
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at) VALUES
				('a-1', 'org-1', NULL, 'student-1', 'test-a', 'practice', 'in_progress', '[]', '{}', '', 1000000),
				('a-2', 'org-1', NULL, 'student-1', 'test-a', 'practice', 'in_progress', '[]', '{"0":"TRUE"}', '', 1180000)`,
		);

		// Case B: Row 1 earlier + 2 real answers vs Row 2 later + cleared answer {"0":""} / whitespace "{ }" → Row 1 wins
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at) VALUES
				('b-1', 'org-1', NULL, 'student-1', 'test-b', 'practice', 'in_progress', '[]', '{"0":"A","1":"B"}', '', 2000000),
				('b-2', 'org-1', NULL, 'student-1', 'test-b', 'practice', 'in_progress', '[]', '{"0":""}', '', 2050000),
				('b-3', 'org-1', NULL, 'student-1', 'test-b', 'practice', 'in_progress', '[]', '{ }', '', 2090000)`,
		);

		// Case C: Row 1 earlier + 2 real answers vs Row 2 later + 1 real answer → Row 1 wins (richer work)
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at) VALUES
				('c-1', 'org-1', NULL, 'student-1', 'test-c', 'practice', 'in_progress', '[]', '{"0":"TRUE","1":"FALSE"}', '', 3000000),
				('c-2', 'org-1', NULL, 'student-1', 'test-c', 'practice', 'in_progress', '[]', '{"0":"TRUE"}', '', 3060000)`,
		);

		// Case D: Row 1 earlier + uploaded Speaking R2 media_key vs Row 2 later + empty → Row 1 wins (no R2 orphan)
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, media_key, started_at) VALUES
				('d-1', 'org-1', NULL, 'student-1', 'test-d', 'practice', 'in_progress', '[]', '{}', '', 'speaking/org-1/d-1.webm', 4000000),
				('d-2', 'org-1', NULL, 'student-1', 'test-d', 'practice', 'in_progress', '[]', '{"0":"ignored"}', 'short', NULL, 4050000)`,
		);

		// Case E: Older submitted practice attempt stays untouched and must NOT pull MIN(started_at) backward
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at, submitted_at) VALUES
				('e-sub', 'org-1', NULL, 'student-1', 'test-e', 'practice', 'submitted', '[]', '{"0":"A"}', '', 500000, 600000),
				('e-1', 'org-1', NULL, 'student-1', 'test-e', 'practice', 'in_progress', '[]', '{}', '', 5000000, NULL),
				('e-2', 'org-1', NULL, 'student-1', 'test-e', 'practice', 'in_progress', '[]', '{"0":"B"}', '', 5120000, NULL)`,
		);

		// Case Malformed: broken JSON answers '{bad' must NOT throw malformed JSON error
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at) VALUES
				('m-1', 'org-1', NULL, 'student-1', 'test-mal', 'practice', 'in_progress', '[]', '{bad', 'Draft essay text', 6000000),
				('m-2', 'org-1', NULL, 'student-1', 'test-mal', 'practice', 'in_progress', '[]', '[]', '', 6050000)`,
		);

		// Case F: in_progress practice row with test_id IS NULL (deleted test) stays untouched
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, started_at) VALUES
				('null-1', 'org-1', NULL, 'student-1', NULL, 'practice', 'in_progress', '[]', '{}', '', 7000000),
				('null-2', 'org-1', NULL, 'student-1', NULL, 'practice', 'in_progress', '[]', '{}', '', 7050000)`,
		);

		await applyTarget(client);

		const rows = await client.execute(
			"SELECT id, test_id, status, answers, essay, media_key, started_at FROM quiz_attempt ORDER BY id",
		);
		const byId = new Map(
			rows.rows.map((r) => [String(r.id), r as Record<string, unknown>]),
		);

		// Case A
		expect(byId.has("a-1")).toBe(false);
		expect(byId.get("a-2")?.started_at).toBe(1000000);
		expect(byId.get("a-2")?.answers).toBe('{"0":"TRUE"}');

		// Case B
		expect(byId.has("b-1")).toBe(true);
		expect(byId.has("b-2")).toBe(false);
		expect(byId.has("b-3")).toBe(false);
		expect(byId.get("b-1")?.started_at).toBe(2000000);

		// Case C
		expect(byId.has("c-1")).toBe(true);
		expect(byId.has("c-2")).toBe(false);
		expect(byId.get("c-1")?.started_at).toBe(3000000);

		// Case D
		expect(byId.has("d-1")).toBe(true);
		expect(byId.has("d-2")).toBe(false);
		expect(byId.get("d-1")?.media_key).toBe("speaking/org-1/d-1.webm");

		// Case E: submitted attempt untouched; e-2 inherits 5000000 (NOT 500000 from e-sub!)
		expect(byId.get("e-sub")?.status).toBe("submitted");
		expect(byId.get("e-sub")?.started_at).toBe(500000);
		expect(byId.has("e-1")).toBe(false);
		expect(byId.get("e-2")?.started_at).toBe(5000000);

		// Case Malformed: m-1 wins on essay_len without throwing JSON1 error
		expect(byId.has("m-1")).toBe(true);
		expect(byId.has("m-2")).toBe(false);
		expect(byId.get("m-1")?.started_at).toBe(6000000);

		// Case F: test_id IS NULL rows both untouched
		expect(byId.has("null-1")).toBe(true);
		expect(byId.has("null-2")).toBe(true);

		// Re-running migration is idempotent
		await applyTarget(client);

		// Second in_progress row for same (org_id, student_id, test_id) throws UNIQUE constraint error
		await expect(
			client.execute(
				`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, started_at)
					VALUES ('a-dup', 'org-1', NULL, 'student-1', 'test-a', 'practice', 'in_progress', '[]', '{}', 1200000)`,
			),
		).rejects.toThrow(/UNIQUE/i);

		// Multiple submitted practice rows for same test succeed (retake allowed)
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, started_at, submitted_at)
				VALUES ('e-sub-2', 'org-1', NULL, 'student-1', 'test-e', 'practice', 'submitted', '[]', '{}', 5200000, 5300000)`,
		);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});
});
