/**
 * Proves migration 0042 (syllabus class-pointer reconcile, issue #394)
 * heals `class.syllabus_id` toward the copy found by `syllabus.class_id`
 * (the source of truth): same-org copy with a null/foreign pointer gets
 * re-pointed, correct pointers and orphan/cross-org pointers are left
 * untouched, no row is lost, and the whole file replays idempotently.
 *
 * Kernel tests migrate an empty database, so they cannot catch reconcile
 * bugs — same pattern as syllabus-template-migration.test.ts (0009).
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

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

async function applyFile(client: Client, fileName: string) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) {
		await client.execute(statement);
	}
}

async function applyThrough(client: Client, maxInclusive: string) {
	for (const fileName of migrationFiles()) {
		if (fileName > maxInclusive) break;
		await applyFile(client, fileName);
	}
}

/**
 * Seed on top of 0041 (post-template-discriminator schema):
 * - t1: shared template of org o1 (class_id NULL)
 * - cA (o1): copy sA exists, pointer NULL → 0042 must point it at sA
 * - cB (o1): copy sB exists, pointer at template t1 → must point at sB
 * - cC (o1): copy sC exists, pointer already at sC → unchanged
 * - cD (o1): pointer at t1, NO copy (orphan) → unchanged (no NULL-ing:
 *   the measured prod decision for Q1b is "không")
 * - cE (o2): copy sE carries class_id 'cE' but org o1 (cross-org) →
 *   the same-org EXISTS predicate must skip it (pointer stays at sE)
 */
async function seedReconcile(client: Client) {
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('o1', 'Org1')",
	);
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('o2', 'Org2')",
	);
	await client.execute(
		"INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons) VALUES ('t1', 'o1', 'Template T1', '', 'ielts', '[]', '', 0)",
	);
	for (const c of ["cA", "cB", "cC", "cD", "cE"]) {
		await client.execute(
			`INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('${c}', '${c === "cE" ? "o2" : "o1"}', 'Lớp ${c}', NULL)`,
		);
	}
	for (const [copyId, classId, templateId] of [
		["sA", "cA", "t1"],
		["sB", "cB", "t1"],
		["sC", "cC", "t1"],
		["sE", "cE", "t1"],
	] as const) {
		// sE cố tình mang org o1 (khác org với lớp cE thuộc o2).
		const orgId = "o1";
		await client.execute(
			`INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons, class_id, source_template_id) VALUES ('${copyId}', '${orgId}', 'Copy ${copyId}', '', 'ielts', '[]', '', 0, '${classId}', '${templateId}')`,
		);
		await client.execute(
			`INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position) VALUES ('m-${copyId}', '${orgId}', '${copyId}', 'Module ${copyId}', '', 0)`,
		);
		await client.execute(
			`INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, kind, status, position) VALUES ('l-${copyId}', '${orgId}', 'm-${copyId}', 'Lesson ${copyId}', '', '', 'lesson', 'upcoming', 0)`,
		);
	}
	// Legacy pointers set after every row exists (FK stays ON throughout).
	await client.execute(
		"UPDATE class SET syllabus_id = 't1' WHERE id IN ('cB', 'cD')",
	);
	await client.execute("UPDATE class SET syllabus_id = 'sC' WHERE id = 'cC'");
	await client.execute("UPDATE class SET syllabus_id = 'sE' WHERE id = 'cE'");
}

async function pointerMap(client: Client) {
	const res = await client.execute(
		"SELECT id, syllabus_id FROM class ORDER BY id",
	);
	return Object.fromEntries(
		res.rows.map((row) => [String(row.id), row.syllabus_id]),
	);
}

async function rowCounts(client: Client) {
	async function count(table: string) {
		const res = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`);
		return Number(res.rows[0]?.n);
	}
	return {
		syllabus: await count("syllabus"),
		syllabus_module: await count("syllabus_module"),
		syllabus_lesson: await count("syllabus_lesson"),
		class: await count("class"),
	};
}

describe("migration 0042: syllabus class pointer reconcile", () => {
	test("trỏ lớp về copy cùng org, giữ con trỏ mồ côi/khác org, idempotent, không mất dòng", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0041_known_ink.sql");
		await seedReconcile(client);

		const beforeCounts = await rowCounts(client);
		const file42 = migrationFiles().find((name) => name.startsWith("0042_"));
		expect(file42).toBeDefined();

		await applyFile(client, file42 as string);
		const afterFirst = await pointerMap(client);
		expect(afterFirst.cA).toBe("sA");
		expect(afterFirst.cB).toBe("sB");
		// Đã đúng từ trước: không đổi.
		expect(afterFirst.cC).toBe("sC");
		// Con trỏ mồ côi (không có copy): giữ nguyên — user chưa đồng ý NULL hoá.
		expect(afterFirst.cD).toBe("t1");
		// Copy khác org với lớp: EXISTS cùng org không khớp → không đổi.
		expect(afterFirst.cE).toBe("sE");

		// Không xoá/cộng thêm dòng nào.
		expect(await rowCounts(client)).toEqual(beforeCounts);

		// Chạy lại: idempotent tuyệt đối.
		await applyFile(client, file42 as string);
		expect(await pointerMap(client)).toEqual(afterFirst);
	});
});
