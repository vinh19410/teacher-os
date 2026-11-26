/**
 * Verifies migrations 0095 (DDL) and 0096 (idempotent DML) add `target_scope`
 * to `class_assignment`, classify historical selective assignments as
 * `'selected'`, and conservatively backfill missing pre-deadline targets for
 * active students in active classes without violating org isolation or guards.
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

function findMigration(prefix: string): string {
	const file = migrationFiles().find((name) => name.startsWith(prefix));
	if (!file) throw new Error(`migration ${prefix} not found`);
	return file;
}

async function seedBase(client: Client, orgId: string) {
	await client.execute({
		sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
		args: [orgId, `Org ${orgId}`],
	});
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, prompt, status) VALUES (?, ?, 'task2', '', 'writing', 't2', 'essay', 'Prompt', 'Write essay', 'ready')",
		args: [`pr-${orgId}`, orgId],
	});
}

async function seedClass(
	client: Client,
	opts: { id: string; orgId?: string; status?: string },
) {
	await client.execute({
		sql: "INSERT INTO class (id, org_id, name, status) VALUES (?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId ?? "org-1",
			`Class ${opts.id}`,
			opts.status ?? "active",
		],
	});
}

async function seedStudent(
	client: Client,
	opts: { id: string; orgId?: string },
) {
	await client.execute({
		sql: "INSERT INTO student (id, org_id, name) VALUES (?, ?, ?)",
		args: [opts.id, opts.orgId ?? "org-1", `Student ${opts.id}`],
	});
}

async function seedEnrollment(
	client: Client,
	opts: {
		id: string;
		orgId?: string;
		classId: string;
		studentId: string;
		status?: string;
		createdAtMs: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId ?? "org-1",
			opts.classId,
			opts.studentId,
			opts.status ?? "active",
			opts.createdAtMs,
		],
	});
}

async function seedPackage(
	client: Client,
	opts: {
		id: string;
		orgId?: string;
		studentId: string;
		enrollmentId: string;
		createdAtMs: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO session_package (id, org_id, student_id, enrollment_id, total, created_at) VALUES (?, ?, ?, ?, 12, ?)",
		args: [
			opts.id,
			opts.orgId ?? "org-1",
			opts.studentId,
			opts.enrollmentId,
			opts.createdAtMs,
		],
	});
}

async function seedAssignment(
	client: Client,
	opts: {
		id: string;
		orgId?: string;
		classId: string;
		due: string;
		dueAtMs: number | null;
		createdAtMs: number;
		classStudyPackId?: string | null;
	},
) {
	const orgId = opts.orgId ?? "org-1";
	await client.execute({
		sql: "INSERT INTO class_assignment (id, org_id, class_id, prompt_id, title, due, due_at, class_study_pack_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			orgId,
			opts.classId,
			`pr-${orgId}`,
			`Assignment ${opts.id}`,
			opts.due,
			opts.dueAtMs,
			opts.classStudyPackId ?? null,
			opts.createdAtMs,
		],
	});
}

async function seedTarget(
	client: Client,
	opts: {
		id: string;
		orgId?: string;
		assignmentId: string;
		studentId: string;
		submittedAt?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO class_assignment_target (id, org_id, assignment_id, student_id, submitted_at) VALUES (?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId ?? "org-1",
			opts.assignmentId,
			opts.studentId,
			opts.submittedAt ?? null,
		],
	});
}

async function targetMap(
	client: Client,
	assignmentId: string,
): Promise<Map<string, string | null>> {
	const res = await client.execute({
		sql: "SELECT student_id, submitted_at FROM class_assignment_target WHERE assignment_id = ? ORDER BY student_id",
		args: [assignmentId],
	});
	const map = new Map<string, string | null>();
	for (const row of res.rows) {
		map.set(
			String(row.student_id),
			row.submitted_at == null ? null : String(row.submitted_at),
		);
	}
	return map;
}

async function scopeOf(client: Client, assignmentId: string): Promise<string> {
	const res = await client.execute({
		sql: "SELECT target_scope FROM class_assignment WHERE id = ?",
		args: [assignmentId],
	});
	return String(res.rows[0]?.target_scope ?? "");
}

describe("class_assignment target_scope & backfill migrations (0095 + 0096)", () => {
	test("journal entries 0095 and 0096 have strictly increasing timestamps and valid snapshot prevId chain", () => {
		const journal = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, "utf8"),
		) as { entries: Array<{ idx: number; when: number; tag: string }> };

		const entry94 = journal.entries.find((e) => e.idx === 94);
		const entry95 = journal.entries.find((e) => e.idx === 95);
		const entry96 = journal.entries.find((e) => e.idx === 96);

		expect(entry94).toBeDefined();
		expect(entry95?.tag).toBe("0095_class_assignment_target_scope");
		expect(entry96?.tag).toBe("0096_backfill_class_assignment_targets");
		expect(entry95?.when).toBeGreaterThan(entry94?.when ?? 0);
		expect(entry96?.when).toBeGreaterThan(entry95?.when ?? 0);

		const snap94 = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/0094_snapshot.json`, "utf8"),
		) as { id: string };
		const snap95 = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/0095_snapshot.json`, "utf8"),
		) as {
			id: string;
			prevId: string;
			tables: { class_assignment: { columns: Record<string, unknown> } };
		};
		const snap96 = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/0096_snapshot.json`, "utf8"),
		) as { id: string; prevId: string };

		expect(snap95.prevId).toBe(snap94.id);
		expect(snap95.tables.class_assignment.columns.target_scope).toBeDefined();
		expect(snap96.prevId).toBe(snap95.id);
	});

	test("backfills pre-deadline late enrollments and activations, protects historical selective assignments, guards, and is idempotent", async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		await applyThrough(
			client,
			"0094_backfill_reading_library_collection_and_part.sql",
		);

		await seedBase(client, "org-1");
		await seedBase(client, "org-2");

		const T_ASSIGN = Date.parse("2026-10-10T03:00:00.000Z"); // 10:00 VN
		const T_DUE = Date.parse("2026-10-15T16:59:59.999Z"); // 2026-10-15 23:59:59.999 VN
		const T_BEFORE_ASSIGN = T_ASSIGN - 3_600_000;
		const T_BEFORE_DUE = T_DUE - 3_600_000;
		const T_AFTER_DUE = T_DUE + 60_000;

		// --- Case 1, 2, 2b, 4 & guards on active class cl-main ---
		await seedClass(client, { id: "cl-main", status: "active" });
		for (const sid of [
			"st-existing",
			"st-late-active",
			"st-invited-then-active",
			"st-invited-after-due",
			"st-post-due",
			"st-still-invited",
			"demo-student:1",
		]) {
			await seedStudent(client, { id: sid });
		}

		// Already active before assignment and already targeted (with submitted_at)
		await seedEnrollment(client, {
			id: "en-existing",
			classId: "cl-main",
			studentId: "st-existing",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedPackage(client, {
			id: "pkg-existing",
			studentId: "st-existing",
			enrollmentId: "en-existing",
			createdAtMs: T_BEFORE_ASSIGN,
		});

		// Case 1: Enrolled active after assignment and before deadline
		await seedEnrollment(client, {
			id: "en-late-active",
			classId: "cl-main",
			studentId: "st-late-active",
			status: "active",
			createdAtMs: T_BEFORE_DUE,
		});

		// Case 2: Invited before assignment, activated before deadline (package created between assign and due)
		await seedEnrollment(client, {
			id: "en-invited-then-active",
			classId: "cl-main",
			studentId: "st-invited-then-active",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedPackage(client, {
			id: "pkg-invited-then-active",
			studentId: "st-invited-then-active",
			enrollmentId: "en-invited-then-active",
			createdAtMs: T_BEFORE_DUE,
		});

		// Case 2b: Invited before assignment, activated AFTER deadline -> must NOT backfill
		await seedEnrollment(client, {
			id: "en-invited-after-due",
			classId: "cl-main",
			studentId: "st-invited-after-due",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedPackage(client, {
			id: "pkg-invited-after-due",
			studentId: "st-invited-after-due",
			enrollmentId: "en-invited-after-due",
			createdAtMs: T_AFTER_DUE,
		});

		// Case 4: Joined after deadline -> must NOT backfill
		await seedEnrollment(client, {
			id: "en-post-due",
			classId: "cl-main",
			studentId: "st-post-due",
			status: "active",
			createdAtMs: T_AFTER_DUE,
		});

		// Guard: Still invited -> must NOT backfill
		await seedEnrollment(client, {
			id: "en-still-invited",
			classId: "cl-main",
			studentId: "st-still-invited",
			status: "invited",
			createdAtMs: T_BEFORE_DUE,
		});

		// Guard: demo-student:% -> must NOT backfill
		await seedEnrollment(client, {
			id: "en-demo",
			classId: "cl-main",
			studentId: "demo-student:1",
			status: "active",
			createdAtMs: T_BEFORE_DUE,
		});

		await seedAssignment(client, {
			id: "ca-main",
			classId: "cl-main",
			due: "2026-10-15",
			dueAtMs: T_DUE,
			createdAtMs: T_ASSIGN,
		});
		await seedTarget(client, {
			id: "cat-existing",
			assignmentId: "ca-main",
			studentId: "st-existing",
			submittedAt: "2026-10-12T08:00:00.000Z",
		});

		// Guard: Study pack assignment on cl-main must NOT be modified or backfilled
		await seedAssignment(client, {
			id: "ca-pack",
			classId: "cl-main",
			due: "2026-10-15",
			dueAtMs: T_DUE,
			createdAtMs: T_ASSIGN,
			classStudyPackId: "csp-1",
		});
		await seedTarget(client, {
			id: "cat-pack-existing",
			assignmentId: "ca-pack",
			studentId: "st-existing",
		});

		// --- Case 3: Legacy due_at IS NULL using VN end-of-day (23:59:59.999+07:00 = 16:59:59.999Z) ---
		await seedClass(client, { id: "cl-legacy", status: "active" });
		await seedStudent(client, { id: "st-leg-1" });
		await seedStudent(client, { id: "st-leg-on-time" });
		await seedStudent(client, { id: "st-leg-1ms-late" });
		await seedEnrollment(client, {
			id: "en-leg-1",
			classId: "cl-legacy",
			studentId: "st-leg-1",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedEnrollment(client, {
			id: "en-leg-on-time",
			classId: "cl-legacy",
			studentId: "st-leg-on-time",
			status: "active",
			createdAtMs: Date.parse("2026-10-15T16:59:59.999Z"),
		});
		await seedEnrollment(client, {
			id: "en-leg-1ms-late",
			classId: "cl-legacy",
			studentId: "st-leg-1ms-late",
			status: "active",
			createdAtMs: Date.parse("2026-10-15T17:00:00.000Z"),
		});
		await seedAssignment(client, {
			id: "ca-legacy-valid",
			classId: "cl-legacy",
			due: "2026-10-15",
			dueAtMs: null,
			createdAtMs: T_ASSIGN,
		});
		await seedTarget(client, {
			id: "cat-leg-1",
			assignmentId: "ca-legacy-valid",
			studentId: "st-leg-1",
		});
		await seedAssignment(client, {
			id: "ca-legacy-bad-date",
			classId: "cl-legacy",
			due: "2026-02-30",
			dueAtMs: null,
			createdAtMs: T_ASSIGN,
		});
		await seedTarget(client, {
			id: "cat-leg-bad",
			assignmentId: "ca-legacy-bad-date",
			studentId: "st-leg-1",
		});

		// --- Case 5: Intentional historical partial assignment -> downgraded to 'selected' ---
		await seedClass(client, { id: "cl-partial", status: "active" });
		await seedStudent(client, { id: "st-p1" });
		await seedStudent(client, { id: "st-p2-skipped" });
		await seedStudent(client, { id: "st-p3-late" });
		await seedEnrollment(client, {
			id: "en-p1",
			classId: "cl-partial",
			studentId: "st-p1",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedPackage(client, {
			id: "pkg-p1",
			studentId: "st-p1",
			enrollmentId: "en-p1",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		// Already active BEFORE assignment (package also before assignment) and skipped -> selective!
		await seedEnrollment(client, {
			id: "en-p2",
			classId: "cl-partial",
			studentId: "st-p2-skipped",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedPackage(client, {
			id: "pkg-p2",
			studentId: "st-p2-skipped",
			enrollmentId: "en-p2",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		// Joined after assignment & before deadline -> must NOT be backfilled because scope becomes 'selected'
		await seedEnrollment(client, {
			id: "en-p3",
			classId: "cl-partial",
			studentId: "st-p3-late",
			status: "active",
			createdAtMs: T_BEFORE_DUE,
		});
		await seedAssignment(client, {
			id: "ca-partial",
			classId: "cl-partial",
			due: "2026-10-15",
			dueAtMs: T_DUE,
			createdAtMs: T_ASSIGN,
		});
		await seedTarget(client, {
			id: "cat-p1",
			assignmentId: "ca-partial",
			studentId: "st-p1",
		});

		// --- Case 6: Paused class & cross-org isolation ---
		await seedClass(client, { id: "cl-paused", status: "paused" });
		await seedStudent(client, { id: "st-paused-1" });
		await seedStudent(client, { id: "st-paused-2" });
		await seedEnrollment(client, {
			id: "en-paused-1",
			classId: "cl-paused",
			studentId: "st-paused-1",
			status: "active",
			createdAtMs: T_BEFORE_ASSIGN,
		});
		await seedEnrollment(client, {
			id: "en-paused-2",
			classId: "cl-paused",
			studentId: "st-paused-2",
			status: "active",
			createdAtMs: T_BEFORE_DUE,
		});
		await seedAssignment(client, {
			id: "ca-paused",
			classId: "cl-paused",
			due: "2026-10-15",
			dueAtMs: T_DUE,
			createdAtMs: T_ASSIGN,
		});
		await seedTarget(client, {
			id: "cat-paused-1",
			assignmentId: "ca-paused",
			studentId: "st-paused-1",
		});

		await seedClass(client, {
			id: "cl-org2",
			orgId: "org-2",
			status: "active",
		});
		await seedStudent(client, { id: "st-org2-late", orgId: "org-2" });
		await seedEnrollment(client, {
			id: "en-org2-late",
			orgId: "org-2",
			classId: "cl-org2",
			studentId: "st-org2-late",
			status: "active",
			createdAtMs: T_BEFORE_DUE,
		});

		// Apply 0095 (DDL) and 0096 (DML)
		await applyFile(client, findMigration("0095_"));
		await applyFile(client, findMigration("0096_"));

		// Verify Case 1, 2, 2b, 4, guards on ca-main
		expect(await scopeOf(client, "ca-main")).toBe("class");
		const mainTargets = await targetMap(client, "ca-main");
		expect([...mainTargets.keys()].sort()).toEqual([
			"st-existing",
			"st-invited-then-active",
			"st-late-active",
		]);
		expect(mainTargets.get("st-existing")).toBe("2026-10-12T08:00:00.000Z");
		expect(mainTargets.get("st-late-active")).toBeNull();
		expect(mainTargets.get("st-invited-then-active")).toBeNull();

		// Study pack untouched
		expect([...(await targetMap(client, "ca-pack")).keys()]).toEqual([
			"st-existing",
		]);

		// Case 3: legacy due_at IS NULL boundary
		expect(
			[...(await targetMap(client, "ca-legacy-valid")).keys()].sort(),
		).toEqual(["st-leg-1", "st-leg-on-time"]);
		expect([...(await targetMap(client, "ca-legacy-bad-date")).keys()]).toEqual(
			["st-leg-1"],
		);

		// Case 5: historical selective assignment downgraded to 'selected', no backfill
		expect(await scopeOf(client, "ca-partial")).toBe("selected");
		expect([...(await targetMap(client, "ca-partial")).keys()]).toEqual([
			"st-p1",
		]);

		// Case 6: paused class untouched, no cross-org leakage
		expect([...(await targetMap(client, "ca-paused")).keys()]).toEqual([
			"st-paused-1",
		]);
		const org2Targets = await client.execute({
			sql: "SELECT id FROM class_assignment_target WHERE org_id = 'org-2'",
		});
		expect(org2Targets.rows).toHaveLength(0);

		// Idempotency: re-running 0096 produces identical state with 0 errors
		await applyFile(client, findMigration("0096_"));
		expect([...(await targetMap(client, "ca-main")).keys()].sort()).toEqual([
			"st-existing",
			"st-invited-then-active",
			"st-late-active",
		]);
		expect(await scopeOf(client, "ca-partial")).toBe("selected");

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});
});
