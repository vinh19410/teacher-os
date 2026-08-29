/**
 * Proves migration 0011 upgrades populated session_package without losing
 * money-adjacent rows (issue #104): backfill joins enrollment to fill
 * student_id, and the anti-orphan guard rejects rows whose enrollment vanished
 * (SQLite FK is not always on, so orphans are possible on real D1 data).
 * Kernel tests migrate an empty database, so they cannot catch a broken
 * backfill — this file seeds pre-0011 data by hand (raw statement execution,
 * same pattern as comment-bank-existing-data-migration.test.ts).
 */

import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
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

async function applyFile(
	client: ReturnType<typeof createClient>,
	fileName: string,
) {
	const sql = readFileSync(`${MIGRATIONS_DIR}/${fileName}`, "utf8");
	for (const statement of statements(sql)) {
		await client.execute(statement);
	}
}

async function applyThrough(
	client: ReturnType<typeof createClient>,
	maxInclusive: string,
) {
	for (const fileName of migrationFiles()) {
		if (fileName > maxInclusive) break;
		await applyFile(client, fileName);
	}
}

function first0011(): string {
	const file = migrationFiles().find((name) => name.startsWith("0011_"));
	if (!file) throw new Error("migration 0011 not found");
	return file;
}

function first0012(): string {
	const file = migrationFiles().find((name) => name.startsWith("0012_"));
	if (!file) throw new Error("migration 0012 not found");
	return file;
}

type Fixture = ReturnType<typeof createClient>;

async function seedOrgStudentClassEnrollment(
	client: Fixture,
	id: string,
	enrollmentId: string,
	studentId: string,
) {
	await client.execute(
		`INSERT INTO organization (id, name) VALUES ('org-${id}', 'fixture-org')`,
	);
	await client.execute(
		`INSERT INTO student (id, org_id, name) VALUES ('${studentId}', 'org-${id}', 'fixture-student')`,
	);
	await client.execute(
		`INSERT INTO class (id, org_id, name) VALUES ('class-${id}', 'org-${id}', 'fixture-class')`,
	);
	await client.execute(
		`INSERT INTO enrollment (id, org_id, class_id, student_id) VALUES ('${enrollmentId}', 'org-${id}', 'class-${id}', '${studentId}')`,
	);
}

/** Old-shape insert (pre-0011): no student_id column exists yet. */
async function seedPackage(
	client: Fixture,
	orgId: string,
	id: string,
	enrollmentId: string,
	total: number,
	price: number,
	mode: string,
) {
	await client.execute(
		`INSERT INTO session_package (id, org_id, enrollment_id, total, price, mode) VALUES ('${id}', '${orgId}', '${enrollmentId}', ${total}, ${price}, '${mode}')`,
	);
}

describe("session_package parked-package migration 0011/0012", () => {
	test("anti-orphan guard rejects a package whose enrollment is gone, then applies after cleanup", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0010_fantastic_karma.sql");

		await seedOrgStudentClassEnrollment(client, "orph", "enr-orph", "stu-orph");
		await seedPackage(
			client,
			"org-orph",
			"pkg-orph",
			"enr-orph",
			10,
			400000,
			"Online",
		);
		// Orphan: enrollment_id points nowhere. libsql enforces FK by default,
		// so disable it on this connection to simulate a corrupted production
		// DB (rows written with FK off / via the D1 console).
		await client.execute("PRAGMA foreign_keys = OFF");
		await client.execute(
			`INSERT INTO session_package (id, org_id, enrollment_id, total) VALUES ('pkg-lost', 'org-orph', 'enr-missing', 5)`,
		);

		await expect(applyFile(client, first0011())).rejects.toThrow();

		await client.execute("DELETE FROM session_package WHERE id = 'pkg-lost'");
		await applyFile(client, first0011());
	});

	test("backfill fills student_id from enrollment and preserves totals/price/mode", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0010_fantastic_karma.sql");

		await seedOrgStudentClassEnrollment(client, "bf1", "enr-bf1", "stu-bf1");
		await seedOrgStudentClassEnrollment(client, "bf2", "enr-bf2", "stu-bf2");
		await seedPackage(
			client,
			"org-bf1",
			"pkg-a",
			"enr-bf1",
			10,
			400000,
			"Online",
		);
		await seedPackage(
			client,
			"org-bf2",
			"pkg-b",
			"enr-bf2",
			24,
			9600000,
			"Offline",
		);

		const before = await client.execute(
			"SELECT COUNT(*) AS n FROM session_package",
		);

		await applyFile(client, first0011());
		await applyFile(client, first0012());

		const after = await client.execute(
			"SELECT COUNT(*) AS n FROM session_package",
		);
		expect(after.rows[0]?.n).toBe(before.rows[0]?.n);

		const rows = await client.execute(
			`SELECT sp.id, sp.student_id, sp.total, sp.price, sp.mode
			 FROM session_package sp ORDER BY sp.id`,
		);
		expect(rows.rows).toEqual([
			{
				id: "pkg-a",
				student_id: "stu-bf1",
				total: 10,
				price: 400000,
				mode: "Online",
			},
			{
				id: "pkg-b",
				student_id: "stu-bf2",
				total: 24,
				price: 9600000,
				mode: "Offline",
			},
		]);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});

	test("parked packages: one per student (partial unique) and old indexes recreated", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0010_fantastic_karma.sql");

		await seedOrgStudentClassEnrollment(client, "pk", "enr-pk", "stu-pk");
		await applyFile(client, first0011());
		await applyFile(client, first0012());

		const indexes = await client.execute("PRAGMA index_list(session_package)");
		const names = indexes.rows.map((row) => row.name);
		for (const expected of [
			"session_package_enrollment_uq",
			"session_package_org_idx",
			"session_package_org_student_idx",
			"session_package_parked_student_uq",
		]) {
			expect(names).toContain(expected);
		}

		// Parked package (no enrollment) is insertable…
		await client.execute(
			`INSERT INTO session_package (id, org_id, student_id, total, price, mode)
			 VALUES ('pkg-parked', 'org-pk', 'stu-pk', 10, 400000, 'Online')`,
		);
		// …but only once per student.
		await expect(
			client.execute(
				`INSERT INTO session_package (id, org_id, student_id, total, price, mode)
				 VALUES ('pkg-parked-2', 'org-pk', 'stu-pk', 5, 200000, 'Online')`,
			),
		).rejects.toThrow();

		// The old per-enrollment uniqueness still holds.
		await expect(
			client.execute(
				`INSERT INTO session_package (id, org_id, student_id, enrollment_id, total)
				 VALUES ('pkg-dup-enr', 'org-pk', 'stu-pk', 'enr-pk', 3)`,
			),
		).resolves.toBeTruthy();
		await expect(
			client.execute(
				`INSERT INTO session_package (id, org_id, student_id, enrollment_id, total)
				 VALUES ('pkg-dup-enr-2', 'org-pk', 'stu-pk', 'enr-pk', 3)`,
			),
		).rejects.toThrow();
	});
});
