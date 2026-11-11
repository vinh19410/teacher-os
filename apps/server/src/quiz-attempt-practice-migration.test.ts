/**
 * Proves migration 0041 (#378 phase 10) keeps legacy quiz_attempt data and
 * — quan trọng nhất — KHÔNG xoá sạch quiz_attempt_annotation qua cascade
 * khi rebuild bảng. Trên D1 `PRAGMA foreign_keys` là no-op (FK luôn ON) nên
 * DROP TABLE quiz_attempt sinh ra bởi drizzle-kit có thể cascade xoá toàn
 * bộ highlight chấm bài; migration phải backup + restore thủ công.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function statements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((part) => part.trim())
		.filter(Boolean);
}

async function applyThrough(client: Client, maxInclusive: string) {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((name) => /^\d{4}_.+\.sql$/.test(name))
		.sort();
	for (const fileName of files) {
		if (fileName > maxInclusive) break;
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) await client.execute(statement);
	}
}

async function applyFile(client: Client, fileName: string) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) await client.execute(statement);
}

/** Migrate 0040 rồi seed đúng dữ liệu cũ: 1 attempt gắn lượt giao + 2
 * highlight annotation + 1 attempt đã chấm (grade_scores). */
async function seedLegacyData(): Promise<Client> {
	const client = createClient({ url: "file::memory:" });
	await applyThrough(client, "0040_deep_oracle.sql");
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('org-1', 'Academy')",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name) VALUES ('class-1', 'org-1', 'IELTS A')",
	);
	await client.execute(
		`INSERT INTO student (id, org_id, name, email) VALUES
			('student-1', 'org-1', 'Hoa', 'hoa@test.local')`,
	);
	await client.execute(
		`INSERT INTO assignment_prompt (id, org_id, task, genre, title, prompt)
			VALUES ('prompt-1', 'org-1', 'task2', 'opinion', 'Writing task', 'Write an essay.')`,
	);
	await client.execute(
		`INSERT INTO class_assignment (id, org_id, class_id, prompt_id, title, due)
			VALUES ('ca-1', 'org-1', 'class-1', 'prompt-1', 'Bài Writing tuần 3', '2026-09-01')`,
	);
	await client.execute(
		`INSERT INTO quiz_attempt (
				id, org_id, assignment_id, student_id, status, questions_snapshot,
				answers, essay, correct_count, grade_scores, grade_feedback, graded_at
			) VALUES (
				'attempt-1', 'org-1', 'ca-1', 'student-1', 'submitted', '[{"stem":"q1","opts":null,"answer":"TRUE","alts":"","type":null,"pin":null}]',
				'{"0":"TRUE"}', 'Bài viết của Hoa.', 1, '{"task":6,"coherence":6,"lexical":5.5,"grammar":6}',
				'Bài ổn.', 1792000000000
			)`,
	);
	await client.execute(
		`INSERT INTO quiz_attempt_annotation (id, org_id, attempt_id, start_offset, end_offset, note, created_at, updated_at)
			VALUES
			('ann-1', 'org-1', 'attempt-1', 0, 10, 'Câu mở chưa mạch lạc', 1792000000000, 1792000000000),
			('ann-2', 'org-1', 'attempt-1', 20, 35, 'Dùng tốt linking words', 1792000000001, 1792000000001)`,
	);
	return client;
}

describe("quiz_attempt practice migration 0041", () => {
	test("attempt cũ còn nguyên, mode='assignment', test_id NULL, annotation không mất", async () => {
		const client = await seedLegacyData();

		await applyFile(client, "0041_known_ink.sql");

		const attempts = await client.execute(
			"SELECT id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot, answers, essay, correct_count, grade_scores, grade_feedback, graded_at FROM quiz_attempt",
		);
		expect(attempts.rows).toHaveLength(1);
		const row = attempts.rows[0] as Record<string, unknown>;
		expect(row.id).toBe("attempt-1");
		expect(row.assignment_id).toBe("ca-1");
		expect(row.student_id).toBe("student-1");
		expect(row.test_id).toBeNull();
		expect(row.mode).toBe("assignment");
		expect(row.status).toBe("submitted");
		expect(row.correct_count).toBe(1);
		expect(row.grade_scores).toBe(
			'{"task":6,"coherence":6,"lexical":5.5,"grammar":6}',
		);
		expect(row.grade_feedback).toBe("Bài ổn.");

		const annotations = await client.execute(
			"SELECT id, note, start_offset, end_offset FROM quiz_attempt_annotation ORDER BY start_offset",
		);
		expect(annotations.rows).toEqual([
			{
				id: "ann-1",
				note: "Câu mở chưa mạch lạc",
				start_offset: 0,
				end_offset: 10,
			},
			{
				id: "ann-2",
				note: "Dùng tốt linking words",
				start_offset: 20,
				end_offset: 35,
			},
		]);

		// Bảng backup tạm phải được dọn sạch sau migration.
		const leftovers = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%mig_backup%'",
		);
		expect(leftovers.rows).toEqual([]);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});

	test("annotation sống sót kể cả khi FK cascade chạy (mô phỏng D1 foreign_keys=ON)", async () => {
		const client = await seedLegacyData();
		// Ép kịch bản D1: PRAGMA foreign_keys=OFF trong file migration bị bỏ
		// qua, DROP TABLE quiz_attempt cascade xoá annotation. Mô phỏng bằng
		// cách xoá annotation ngay trước DROP như cascade từng làm, rồi
		// migration (đã patch tay) phải khôi phục từ bảng backup.
		await client.execute(
			"INSERT INTO assignment_test (id, org_id, title, skill) VALUES ('test-1', 'org-1', 'Reading mini', 'reading')",
		);
		const sql = readFileSync(`${MIGRATIONS_DIR}/0041_known_ink.sql`, "utf8");
		const steps = statements(sql);
		for (const statement of steps) {
			if (statement === "DROP TABLE `quiz_attempt`") {
				// Cascade wipe — chính xác điều D1 làm khi FK bật.
				await client.execute("DELETE FROM quiz_attempt_annotation");
			}
			await client.execute(statement);
		}

		const annotations = await client.execute(
			"SELECT id FROM quiz_attempt_annotation ORDER BY id",
		);
		expect(annotations.rows.map((r) => r.id)).toEqual(["ann-1", "ann-2"]);
	});

	test("CHECK ràng buộc mode: assignment cần assignment_id; practice KHÔNG có CHECK test_id", async () => {
		const client = await seedLegacyData();
		await applyFile(client, "0041_known_ink.sql");
		await client.execute(
			"INSERT INTO assignment_test (id, org_id, title, skill) VALUES ('test-1', 'org-1', 'Reading mini', 'reading')",
		);

		// assignment thiếu assignment_id → từ chối.
		await expect(
			client.execute(
				`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, mode, questions_snapshot)
					VALUES ('p-2', 'org-1', NULL, 'student-1', 'assignment', '[]')`,
			),
		).rejects.toThrow();

		// Practice thiếu test_id: DB CHO PHÉP (không có CHECK — kongming:
		// CHECK "practice ⇒ test_id" mâu thuẫn FK ON DELETE SET NULL, làm
		// xoá đề có attempt practice lỗi 500). Ngữ nghĩa do route bảo vệ;
		// DB chỉ cần nhận row để ON DELETE SET NULL chạy được (test dưới).
		const practiceRows0 = await client.execute(
			`SELECT COUNT(*) AS n FROM quiz_attempt WHERE mode='practice' AND test_id IS NULL`,
		);
		expect(practiceRows0.rows[0]?.n).toBe(0);

		// Practice đủ test_id → chấp nhận; NHIỀU lượt cùng test (unique coi
		// NULL khác nhau) → làm lại được.
		for (const id of ["p-3", "p-4"]) {
			await client.execute(
				`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, questions_snapshot)
					VALUES ('${id}', 'org-1', NULL, 'student-1', 'test-1', 'practice', '[]')`,
			);
		}
		const practiceRows = await client.execute(
			"SELECT COUNT(*) AS n FROM quiz_attempt WHERE mode='practice'",
		);
		expect(practiceRows.rows[0]?.n).toBe(2);
	});

	test("xoá đề có attempt practice với FK=ON: SET NULL chạy, không 500 (kongming post-impl)", async () => {
		const client = await seedLegacyData();
		await applyFile(client, "0041_known_ink.sql");
		// FK bật như D1 — libsql/libsql client mặc định OFF, phải bật tường minh.
		await client.execute("PRAGMA foreign_keys = ON");
		await client.execute(
			"INSERT INTO assignment_test (id, org_id, title, skill) VALUES ('test-del', 'org-1', 'Reading xoá được', 'reading')",
		);
		await client.execute(
			`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot)
				VALUES ('pd-1', 'org-1', NULL, 'student-1', 'test-del', 'practice', 'submitted', '[]')`,
		);

		// Trước fix: CHECK "practice ⇒ test_id" chặn SET NULL → DELETE lỗi 19.
		await client.execute("DELETE FROM assignment_test WHERE id = 'test-del'");

		const attempt = await client.execute(
			"SELECT test_id, mode, status FROM quiz_attempt WHERE id = 'pd-1'",
		);
		expect(attempt.rows[0]).toEqual({
			test_id: null,
			mode: "practice",
			status: "submitted",
		});
	});

	test("unique (assignment_id, student_id) vẫn chặn trùng lượt giao sau rebuild", async () => {
		const client = await seedLegacyData();
		await applyFile(client, "0041_known_ink.sql");
		await expect(
			client.execute(
				`INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, questions_snapshot)
					VALUES ('dup-1', 'org-1', 'ca-1', 'student-1', '[]')`,
			),
		).rejects.toThrow();
	});
});
