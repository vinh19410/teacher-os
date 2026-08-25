/**
 * Proves migration 0009 (syllabus template discriminator + backfill
 * copy-on-import, issue #79) upgrades a pilot-like populated database:
 * same-org classes each get exactly one deep copy (status/position
 * preserved), the shared template tree resets to `upcoming`, pointers
 * move to the copies, orphan/cross-org pointers are left untouched, and
 * the whole file replays idempotently at any statement boundary.
 *
 * Kernel tests migrate an empty database, so they cannot catch backfill
 * bugs — same reason comment-bank 0006 has this pattern.
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
 * Pilot-like seed applied on top of 0008 (pre-0009 schema):
 * - org o1 shares template t1 across classes c1, c2
 * - org o2 has its own template t2 used by class c6
 * - c3 has no pointer, c4 points cross-org at t2, c5 points at a ghost id
 * - lessons cover all three statuses
 */
async function seedPilotLike(client: Client) {
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('o1', 'Org1')",
	);
	await client.execute(
		"INSERT INTO organization (id, name) VALUES ('o2', 'Org2')",
	);
	await client.execute(
		"INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons) VALUES ('t1', 'o1', 'IELTS Prep', '6.0', 'ielts', '[\"Writing\"]', 'desc', 3)",
	);
	await client.execute(
		"INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons) VALUES ('t2', 'o2', 'Speaking Club', '', 'communication', '[]', '', 1)",
	);
	await client.execute(
		"INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position) VALUES ('m1', 'o1', 't1', 'Module 1', '', 0)",
	);
	await client.execute(
		"INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position) VALUES ('m2', 'o1', 't1', 'Module 2', '', 1)",
	);
	await client.execute(
		"INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position) VALUES ('m3', 'o2', 't2', 'Module A', '', 0)",
	);
	await client.execute(
		"INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, status, position) VALUES ('l1', 'o1', 'm1', 'Lesson 1', '', '', 'done', 0)",
	);
	await client.execute(
		"INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, status, position) VALUES ('l2', 'o1', 'm1', 'Lesson 2', '', '', 'current', 1)",
	);
	await client.execute(
		"INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, status, position) VALUES ('l3', 'o1', 'm2', 'Lesson 3', '', '', 'upcoming', 0)",
	);
	await client.execute(
		"INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, status, position) VALUES ('l4', 'o2', 'm3', 'Lesson A', '', '', 'done', 0)",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c1', 'o1', 'Class 1', 't1')",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c2', 'o1', 'Class 2', 't1')",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c3', 'o1', 'Class 3', NULL)",
	);
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c4', 'o1', 'Class 4', 't2')",
	);
	// Orphan pointer: FK is enforced by libsql, so simulate the dirty-data
	// legacy row the backfill must tolerate (never nulled, never copied).
	await client.execute("PRAGMA foreign_keys = OFF");
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c5', 'o1', 'Class 5', 'ghost-syllabus')",
	);
	await client.execute("PRAGMA foreign_keys = ON");
	await client.execute(
		"INSERT INTO class (id, org_id, name, syllabus_id) VALUES ('c6', 'o2', 'Class 6', 't2')",
	);
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Runs the pilot-like seed, applies 0009, and returns assertion helpers. */
async function migratedFixture() {
	const client = createClient({ url: "file::memory:" });
	await applyThrough(client, "0008_syllabus_type_skills.sql");
	await seedPilotLike(client);
	await applyFile(client, "0009_syllabus_template_discriminator.sql");
	return client;
}

describe("syllabus template migration 0009 (issue #79)", () => {
	test("unique partial index exists; structural columns added", async () => {
		const client = await migratedFixture();
		const info = await client.execute("PRAGMA table_info(syllabus)");
		const cols = info.rows.map((row) => row.name);
		expect(cols).toContain("class_id");
		expect(cols).toContain("source_template_id");

		const indexes = await client.execute(
			"SELECT sql FROM sqlite_master WHERE type='index' AND name='syllabus_class_unique'",
		);
		expect(indexes.rows[0]?.sql).toContain("WHERE class_id IS NOT NULL");
	});

	test("scenario 1: exactly one copy per same-org class with pointer; provenance set", async () => {
		const client = await migratedFixture();
		const copies = await client.execute(
			"SELECT class_id, source_template_id, org_id FROM syllabus WHERE class_id IS NOT NULL ORDER BY class_id",
		);
		expect(copies.rows).toEqual([
			{ class_id: "c1", source_template_id: "t1", org_id: "o1" },
			{ class_id: "c2", source_template_id: "t1", org_id: "o1" },
			{ class_id: "c6", source_template_id: "t2", org_id: "o2" },
		]);
	});

	test("scenario 2: copy tree full depth — modules and lessons per copy", async () => {
		const client = await migratedFixture();
		for (const [classId, templateId, expectedModules] of [
			["c1", "t1", 2],
			["c2", "t1", 2],
			["c6", "t2", 1],
		] as const) {
			const modules = await client.execute(
				`SELECT count(*) AS n FROM syllabus_module m JOIN syllabus s ON s.id = m.syllabus_id WHERE s.class_id = '${classId}'`,
			);
			expect(Number(modules.rows[0]?.n)).toBe(expectedModules);
			const lessons = await client.execute(
				`SELECT count(*) AS n FROM syllabus_lesson l JOIN syllabus_module m ON m.id = l.module_id JOIN syllabus s ON s.id = m.syllabus_id WHERE s.class_id = '${classId}'`,
			);
			expect(Number(lessons.rows[0]?.n)).toBe(templateId === "t1" ? 3 : 1);
		}
		// copy rows are new rows, originals still present
		const originals = await client.execute(
			"SELECT id FROM syllabus_module WHERE id IN ('m1','m2','m3')",
		);
		expect(originals.rows.length).toBe(3);
	});

	test("scenario 3: lesson statuses preserved on the copy", async () => {
		const client = await migratedFixture();
		const statuses = await client.execute(
			`SELECT l.status, count(*) AS n FROM syllabus_lesson l
			 JOIN syllabus_module m ON m.id = l.module_id
			 JOIN syllabus s ON s.id = m.syllabus_id
			 WHERE s.class_id = 'c1' GROUP BY l.status ORDER BY l.status`,
		);
		expect(statuses.rows).toEqual([
			{ status: "current", n: 1 },
			{ status: "done", n: 1 },
			{ status: "upcoming", n: 1 },
		]);
	});

	test("scenario 4: positions preserved on modules and lessons", async () => {
		const client = await migratedFixture();
		const modulePositions = await client.execute(
			`SELECT m.position, count(*) AS n FROM syllabus_module m
			 JOIN syllabus s ON s.id = m.syllabus_id WHERE s.class_id = 'c1' GROUP BY m.position ORDER BY m.position`,
		);
		expect(modulePositions.rows).toEqual([
			{ position: 0, n: 1 },
			{ position: 1, n: 1 },
		]);
		const lessonPositions = await client.execute(
			`SELECT m.position AS module_position, l.position, l.status FROM syllabus_lesson l
			 JOIN syllabus_module m ON m.id = l.module_id
			 JOIN syllabus s ON s.id = m.syllabus_id
			 WHERE s.class_id = 'c2' ORDER BY m.position, l.position`,
		);
		expect(lessonPositions.rows).toEqual([
			{ module_position: 0, position: 0, status: "done" },
			{ module_position: 0, position: 1, status: "current" },
			{ module_position: 1, position: 0, status: "upcoming" },
		]);
	});

	test("scenario 5: no-pointer class gets no copy; orphan/cross-org pointers untouched", async () => {
		const client = await migratedFixture();
		const c3copy = await client.execute(
			"SELECT count(*) AS n FROM syllabus WHERE class_id = 'c3'",
		);
		expect(Number(c3copy.rows[0]?.n)).toBe(0);
		const c4copy = await client.execute(
			"SELECT count(*) AS n FROM syllabus WHERE class_id = 'c4'",
		);
		expect(Number(c4copy.rows[0]?.n)).toBe(0);
		const pointers = await client.execute(
			"SELECT id, syllabus_id FROM class WHERE id IN ('c3','c4','c5') ORDER BY id",
		);
		expect(pointers.rows).toEqual([
			{ id: "c3", syllabus_id: null },
			{ id: "c4", syllabus_id: "t2" },
			{ id: "c5", syllabus_id: "ghost-syllabus" },
		]);
	});

	test("scenario 6: original template tree intact and templates keep class_id NULL", async () => {
		const client = await migratedFixture();
		const templates = await client.execute(
			"SELECT id, class_id FROM syllabus WHERE id IN ('t1','t2') ORDER BY id",
		);
		expect(templates.rows).toEqual([
			{ id: "t1", class_id: null },
			{ id: "t2", class_id: null },
		]);
		const templateModules = await client.execute(
			"SELECT count(*) AS n FROM syllabus_module WHERE syllabus_id IN ('t1','t2')",
		);
		expect(Number(templateModules.rows[0]?.n)).toBe(3);
		const templateLessons = await client.execute(
			`SELECT count(*) AS n FROM syllabus_lesson l
			 JOIN syllabus_module m ON m.id = l.module_id
			 WHERE m.syllabus_id IN ('t1','t2')`,
		);
		expect(Number(templateLessons.rows[0]?.n)).toBe(4);
	});

	test("scenario 7: every pointer targets a same-org copy, never a template", async () => {
		const client = await migratedFixture();
		const joined = await client.execute(
			`SELECT c.id, c.org_id AS class_org, s.org_id AS syllabus_org, s.class_id
			 FROM class c LEFT JOIN syllabus s ON s.id = c.syllabus_id
			 WHERE c.id IN ('c1','c2','c6') ORDER BY c.id`,
		);
		for (const row of joined.rows) {
			expect(row.class_org).toBe(row.syllabus_org);
			expect(row.class_id).toBe(row.id);
		}
		const templatePointers = await client.execute(
			`SELECT count(*) AS n FROM class c JOIN syllabus s ON s.id = c.syllabus_id
			 WHERE s.class_id IS NULL AND c.id IN ('c1','c2','c6')`,
		);
		expect(Number(templatePointers.rows[0]?.n)).toBe(0);
	});

	test("scenario 8: no stray helper tables left behind", async () => {
		const client = await migratedFixture();
		const tables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tmp%'",
		);
		expect(tables.rows).toEqual([]);
	});

	test("scenario 9: template tree fully reset to upcoming", async () => {
		const client = await migratedFixture();
		const nonUpcoming = await client.execute(
			`SELECT count(*) AS n FROM syllabus_lesson l
			 JOIN syllabus_module m ON m.id = l.module_id
			 JOIN syllabus s ON s.id = m.syllabus_id
			 WHERE s.class_id IS NULL AND l.status <> 'upcoming'`,
		);
		expect(Number(nonUpcoming.rows[0]?.n)).toBe(0);
	});

	test("scenario 10: every backfill id is a dashed 36-char UUID", async () => {
		const client = await migratedFixture();
		const ids = await client.execute(
			`SELECT s.id AS sid, m.id AS mid, l.id AS lid
			 FROM syllabus s
			 LEFT JOIN syllabus_module m ON m.syllabus_id = s.id
			 LEFT JOIN syllabus_lesson l ON l.module_id = m.id
			 WHERE s.class_id IS NOT NULL`,
		);
		expect(ids.rows.length).toBeGreaterThan(0);
		for (const row of ids.rows) {
			expect(String(row.sid)).toMatch(UUID_RE);
			if (row.mid != null) expect(String(row.mid)).toMatch(UUID_RE);
			if (row.lid != null) expect(String(row.lid)).toMatch(UUID_RE);
		}
	});

	test("scenario 11: replaying the backfill block changes nothing (idempotent)", async () => {
		const client = await migratedFixture();
		// Full-file replay is prevented by the migration ledger in production
		// (SQLite has no ALTER ADD COLUMN IF NOT EXISTS — same as 0006-0008).
		// The data-carrying backfill block must be replay-safe on its own.
		const sql = readFileSync(
			`${MIGRATIONS_DIR}/0009_syllabus_template_discriminator.sql`,
			"utf8",
		);
		for (const statement of statements(sql).slice(3)) {
			await client.execute(statement);
		}

		const counts = await client.execute(
			`SELECT
			 (SELECT count(*) FROM syllabus WHERE class_id IS NOT NULL) AS copies,
			 (SELECT count(*) FROM syllabus) AS syllabi,
			 (SELECT count(*) FROM syllabus_module) AS modules,
			 (SELECT count(*) FROM syllabus_lesson) AS lessons,
			 (SELECT count(*) FROM syllabus_lesson l JOIN syllabus_module m ON m.id = l.module_id JOIN syllabus s ON s.id = m.syllabus_id WHERE s.class_id IS NOT NULL AND l.status <> 'upcoming') AS copy_active_statuses`,
		);
		const row = counts.rows[0];
		expect(Number(row?.copies)).toBe(3);
		expect(Number(row?.syllabi)).toBe(5);
		expect(Number(row?.modules)).toBe(8); // 3 template + (2+2+1) copy modules
		expect(Number(row?.lessons)).toBe(11); // 4 template + (3+3+1) copy lessons
		expect(Number(row?.copy_active_statuses)).toBe(5); // preserved statuses survive replay
		const pointers = await client.execute(
			"SELECT syllabus_id FROM class WHERE id = 'c4'",
		);
		expect(pointers.rows[0]?.syllabus_id).toBe("t2");
	});

	test("scenario 11b: backfill heals from a crash at every internal statement boundary", async () => {
		const sql = readFileSync(
			`${MIGRATIONS_DIR}/0009_syllabus_template_discriminator.sql`,
			"utf8",
		);
		const parts = statements(sql);
		// Structural statements (0-2) are atomic single statements; the crash
		// windows that matter are inside the backfill block (index 3+).
		for (let cut = 3; cut <= parts.length; cut++) {
			const client = createClient({ url: "file::memory:" });
			await applyThrough(client, "0008_syllabus_type_skills.sql");
			await seedPilotLike(client);
			for (const statement of parts.slice(0, 3)) {
				await client.execute(statement);
			}
			// simulate a crash after `cut - 3` backfill statements…
			for (const statement of parts.slice(3, cut)) {
				await client.execute(statement);
			}
			// …then heal by replaying the complete backfill block
			for (const statement of parts.slice(3)) {
				await client.execute(statement);
			}
			const counts = await client.execute(
				`SELECT
				 (SELECT count(*) FROM syllabus WHERE class_id IS NOT NULL) AS copies,
				 (SELECT count(*) FROM syllabus_module) AS modules,
				 (SELECT count(*) FROM syllabus_lesson) AS lessons`,
			);
			const row = counts.rows[0];
			expect(Number(row?.copies)).toBe(3);
			expect(Number(row?.modules)).toBe(8);
			expect(Number(row?.lessons)).toBe(11);
		}
	});
});
