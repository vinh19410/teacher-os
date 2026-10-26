/**
 * TOS-7 (issue #440) — migration 0045 là migration thuần CỘNG THÊM: chỉ
 * `ALTER TABLE lesson ADD COLUMN` × 2 (attendance, attendance_note, đều
 * nullable, không backfill). Kernel tests migrate DB rỗng nên không bắt
 * được lớp lỗi "code mới + DB cũ"; test này áp migration lên DB có sẵn
 * dòng `lesson` cũ và xác nhận 2 cột mới NULL, reader cũ không đổi.
 * Rollback hướng ngược (revert code, cột thừa) không cần test — cột thừa
 * không ảnh hưởng reader cũ.
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

/** Migration 0045 — file sinh bởi `pnpm db:generate` (drizzle tự đánh số). */
const ATTENDANCE_MIGRATION = migrationFiles().find((name) =>
	/^0045_.+\.sql$/.test(name),
);

async function applyRange(client: Client, files: string[]) {
	for (const fileName of files) {
		const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
		for (const statement of statements(sql)) {
			await client.execute(statement);
		}
	}
}

/** Dữ liệu cũ đúng shape trước 0045: đủ FK org → class → enrollment → lesson. */
async function seedLegacyLesson(client: Client) {
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('o1', 'Trung tâm')",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name) VALUES ('c1', 'o1', 'IELTS 5.0')",
	);
	await client.execute(
		"INSERT INTO student (id, org_id, name) VALUES ('s1', 'o1', 'Nguyễn Văn A')",
	);
	await client.execute(
		"INSERT INTO enrollment (id, org_id, student_id, class_id) VALUES ('e1', 'o1', 's1', 'c1')",
	);
	await client.execute(
		"INSERT INTO lesson (id, org_id, class_id, enrollment_id, day, time, dur, date, status) VALUES ('l1', 'o1', 'c1', 'e1', 1, '17:00', 120, '2026-10-19', 'completed')",
	);
}

describe("lesson attendance columns migration (TOS-7 #440)", () => {
	test("migration 0045 tồn tại và chỉ chứa ALTER TABLE lesson ADD COLUMN", () => {
		expect(ATTENDANCE_MIGRATION).toBeTruthy();
		const sql = readFileSync(
			`${MIGRATIONS_DIR}/${ATTENDANCE_MIGRATION}`,
			"utf8",
		);
		const rawStatements = statements(sql);
		expect(rawStatements).toHaveLength(2);
		for (const statement of rawStatements) {
			expect(statement).toMatch(/^ALTER TABLE `lesson` ADD `\w+` text;$/);
		}
		expect(sql).toContain("ADD `attendance` text");
		expect(sql).toContain("ADD `attendance_note` text");
	});

	test("áp toàn bộ migration lên DB trống: 2 cột nullable xuất hiện", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyRange(client, migrationFiles());
		const cols = await client.execute(
			"SELECT name FROM pragma_table_info('lesson') WHERE name IN ('attendance', 'attendance_note') ORDER BY name",
		);
		expect(cols.rows.map((row) => row.name)).toEqual([
			"attendance",
			"attendance_note",
		]);
		const notnull = await client.execute(
			"SELECT name, \"notnull\" AS nn FROM pragma_table_info('lesson') WHERE name IN ('attendance', 'attendance_note')",
		);
		for (const row of notnull.rows) {
			expect(Number(row.nn)).toBe(0);
		}
	});

	test("DB có sẵn dòng lesson cũ: cột mới NULL, reader cũ không đổi", async () => {
		const client = createClient({ url: "file::memory:" });
		const before = migrationFiles().filter((name) => !name.startsWith("0045_"));
		await applyRange(client, before);
		await seedLegacyLesson(client);

		// Áp 0045 lên DB đã có dữ liệu — không được lỗi, không backfill.
		await applyRange(
			client,
			migrationFiles().filter((name) => name.startsWith("0045_")),
		);

		const row = await client.execute(
			"SELECT id, status, attendance, attendance_note FROM lesson WHERE id = 'l1'",
		);
		expect(row.rows).toHaveLength(1);
		expect(row.rows[0]?.status).toBe("completed");
		expect(row.rows[0]?.attendance).toBeNull();
		expect(row.rows[0]?.attendance_note).toBeNull();

		// Reader cũ theo invariant 6 (đếm completed) vẫn chạy đúng.
		const done = await client.execute(
			"SELECT COUNT(*) AS n FROM lesson WHERE enrollment_id = 'e1' AND status = 'completed'",
		);
		expect(Number(done.rows[0]?.n)).toBe(1);
	});
});
