/**
 * Verifies migration 0091 safely fixes the duplicated Reading title for
 * "Investment in shares versus investment in other assets - which gives the
 * greater gain?" across `library_test`, `assignment_test`,
 * `library_test_part`, and `assignment_prompt` while preserving INF-03 tenant
 * edits, provenance isolation, orphan copy cleanup, immutable snapshots
 * (`class_assignment`, `quiz_attempt`), Alchemy flat SQL execution, Drizzle
 * migrator compatibility, and HTTP Admin/Student API behavior.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { syncLibraryTestsToOrg } from "./lib/library-test-sync";
import type { SessionUser } from "./session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const OLD_TITLE =
	"Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?";
const NEW_TITLE =
	"Investment in shares versus investment in other assets - which gives the greater gain?";
const CLEAN_PASSAGE_TITLE =
	"Investment in shares versus investment in other assets";
const SAMPLE_PASSAGE = "A. It all began in 1958 with a phone call.";
const SAMPLE_QUESTIONS = JSON.stringify([
	{
		stem: "CRSP started in 1960.",
		opts: null,
		answer: "TRUE",
		alts: "",
		type: "tfng",
		pin: null,
	},
]);

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

function migration0091File(): string {
	const file = migrationFiles().find((name) => name.startsWith("0091_"));
	if (!file) throw new Error("migration 0091 not found");
	return file;
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

async function seedOrg(client: Client, id: string) {
	await client.execute({
		sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
		args: [id, `Org ${id}`],
	});
}

async function seedLibraryTest(
	client: Client,
	opts: {
		id: string;
		title: string;
		skill?: string;
		status?: string;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test (id, title, skill, status, updated_at) VALUES (?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.title,
			opts.skill ?? "reading",
			opts.status ?? "ready",
			opts.updatedAt ?? 500,
		],
	});
}

async function seedLibraryPart(
	client: Client,
	opts: {
		id: string;
		testId: string;
		part: string;
		title: string;
		passage?: string;
		questions?: string;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test_part (id, test_id, part, type, title, passage, questions, updated_at) VALUES (?, ?, ?, 'tfng', ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.testId,
			opts.part,
			opts.title,
			opts.passage ?? SAMPLE_PASSAGE,
			opts.questions ?? SAMPLE_QUESTIONS,
			opts.updatedAt ?? 500,
		],
	});
}

async function seedAssignmentTest(
	client: Client,
	opts: {
		id: string;
		orgId: string;
		title: string;
		skill?: string;
		status?: string;
		libraryRef?: string | null;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_test (id, org_id, title, skill, status, library_ref, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		args: [
			opts.id,
			opts.orgId,
			opts.title,
			opts.skill ?? "reading",
			opts.status ?? "ready",
			opts.libraryRef === undefined ? null : opts.libraryRef,
			opts.updatedAt ?? 500,
		],
	});
}

async function seedAssignmentPrompt(
	client: Client,
	opts: {
		id: string;
		orgId: string;
		title: string;
		skill?: string;
		part?: string;
		passage?: string;
		questions?: string;
		libraryRef?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, prompt, passage, questions, library_ref, status) VALUES (?, ?, 'task2', '', ?, ?, 'tfng', ?, '', ?, ?, ?, 'ready')",
		args: [
			opts.id,
			opts.orgId,
			opts.skill ?? "reading",
			opts.part ?? "p2",
			opts.title,
			opts.passage ?? SAMPLE_PASSAGE,
			opts.questions ?? SAMPLE_QUESTIONS,
			opts.libraryRef === undefined ? null : opts.libraryRef,
		],
	});
}

async function readTitle(
	client: Client,
	table:
		| "library_test"
		| "assignment_test"
		| "library_test_part"
		| "assignment_prompt"
		| "class_assignment",
	id: string,
): Promise<{ title: string; updatedAt?: number }> {
	const hasUpdatedAt =
		table === "library_test" ||
		table === "assignment_test" ||
		table === "library_test_part";
	const res = await client.execute({
		sql: hasUpdatedAt
			? `SELECT title, updated_at FROM ${table} WHERE id = ?`
			: `SELECT title FROM ${table} WHERE id = ?`,
		args: [id],
	});
	const row = res.rows[0];
	if (!row) throw new Error(`row ${id} not found in ${table}`);
	return {
		title: String(row.title),
		...(hasUpdatedAt ? { updatedAt: Number(row.updated_at) } : {}),
	};
}

describe("migration 0091: fix duplicated Reading title for Investment in shares", () => {
	test("updates all 4 tables across variants, whitespace, and real syncLibraryTestsToOrg via Alchemy executeMultiple", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0090_concerned_mach_iv.sql");

		for (const orgId of ["org-1", "org-2", "org-3", "org-sync-ws"]) {
			await seedOrg(client, orgId);
		}

		// Library tests with random-style UUIDs (ready, draft with tab/CR/LF, untrimmed sync, prefix test)
		await seedLibraryTest(client, {
			id: "lt-ready-uuid",
			title: OLD_TITLE,
			status: "ready",
		});
		await seedLibraryTest(client, {
			id: "lt-draft-uuid",
			title: `\t ${OLD_TITLE} \r\n`,
			status: "draft",
		});
		await seedLibraryTest(client, {
			id: "lt-ws-sync-uuid",
			title: `  ${OLD_TITLE}  `,
			status: "ready",
		});
		await seedLibraryTest(client, {
			id: "lt-rp-uuid",
			title: OLD_TITLE,
			status: "ready",
		});

		// Parts covering exact OLD_TITLE, P1/P2/P3 suffixes, Passage 2:, Reading Passage 2:, clean passage title, and empty title
		await seedLibraryPart(client, {
			id: "ltp-ready-p1",
			testId: "lt-ready-uuid",
			part: "p1",
			title: OLD_TITLE,
		});
		await seedLibraryPart(client, {
			id: "ltp-ready-p2",
			testId: "lt-ready-uuid",
			part: "p2",
			title: `${OLD_TITLE} — P2`,
		});
		await seedLibraryPart(client, {
			id: "ltp-ready-p3",
			testId: "lt-ready-uuid",
			part: "p3",
			title: `${OLD_TITLE} — P3`,
		});
		await seedLibraryPart(client, {
			id: "ltp-draft-p1",
			testId: "lt-draft-uuid",
			part: "p1",
			title: `${OLD_TITLE} — P1`,
		});
		await seedLibraryPart(client, {
			id: "ltp-draft-p2",
			testId: "lt-draft-uuid",
			part: "p2",
			title: `Passage 2: ${OLD_TITLE}`,
		});
		await seedLibraryPart(client, {
			id: "ltp-draft-p3",
			testId: "lt-draft-uuid",
			part: "p3",
			title: CLEAN_PASSAGE_TITLE,
		});
		await seedLibraryPart(client, {
			id: "ltp-rp-p2",
			testId: "lt-rp-uuid",
			part: "p2",
			title: `Reading Passage 2: ${OLD_TITLE}`,
		});
		await seedLibraryPart(client, {
			id: "ltp-ws-sync-p2",
			testId: "lt-ws-sync-uuid",
			part: "p2",
			title: "",
		});

		// Real pre-migration sync on org-sync-ws produces untrimmed formatLibraryPartTitle:
		// `  ${OLD_TITLE}   — P2`
		const db = drizzle(client, { schema }) as unknown as Db;
		await syncLibraryTestsToOrg(db, "org-sync-ws", "reading");
		const [syncedPromptBefore] = await db
			.select()
			.from(schema.assignmentPrompt)
			.where(
				eq(
					schema.assignmentPrompt.libraryRef,
					"library_test_part:ltp-ws-sync-p2",
				),
			);
		expect(syncedPromptBefore?.title).toBe(`  ${OLD_TITLE}   — P2`);

		// Org assignment_test copies
		await seedAssignmentTest(client, {
			id: "at-org1",
			orgId: "org-1",
			title: OLD_TITLE,
			libraryRef: "lt-ready-uuid",
		});
		await seedAssignmentTest(client, {
			id: "at-org2",
			orgId: "org-2",
			title: `\t${OLD_TITLE}\n`,
			libraryRef: "lt-draft-uuid",
			status: "draft",
		});
		await seedAssignmentTest(client, {
			id: "at-org3",
			orgId: "org-3",
			title: OLD_TITLE,
			libraryRef: "lt-rp-uuid",
		});

		// Org assignment_prompt copies across all supported title formats
		await seedAssignmentPrompt(client, {
			id: "ap-exact",
			orgId: "org-1",
			part: "p1",
			title: OLD_TITLE,
			libraryRef: "library_test_part:ltp-ready-p1",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-p1",
			orgId: "org-2",
			part: "p1",
			title: `${OLD_TITLE} — P1`,
			libraryRef: "library_test_part:ltp-draft-p1",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-p2",
			orgId: "org-1",
			part: "p2",
			title: `${OLD_TITLE} — P2`,
			libraryRef: "library_test_part:ltp-ready-p2",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-p3",
			orgId: "org-1",
			part: "p3",
			title: `${OLD_TITLE} — P3`,
			libraryRef: "library_test_part:ltp-ready-p3",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-passage2",
			orgId: "org-2",
			part: "p2",
			title: `Passage 2: ${OLD_TITLE}`,
			libraryRef: "library_test_part:ltp-draft-p2",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-reading-passage2",
			orgId: "org-3",
			part: "p2",
			title: `Reading Passage 2: ${OLD_TITLE}`,
			libraryRef: "library_test_part:ltp-rp-p2",
		});

		// Execute raw flat SQL exactly like Alchemy D1 runner.
		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0091File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		// 1. library_test
		expect(
			(await readTitle(client, "library_test", "lt-ready-uuid")).title,
		).toBe(NEW_TITLE);
		expect(
			(await readTitle(client, "library_test", "lt-draft-uuid")).title,
		).toBe(NEW_TITLE);
		expect(
			(await readTitle(client, "library_test", "lt-ws-sync-uuid")).title,
		).toBe(NEW_TITLE);
		expect((await readTitle(client, "library_test", "lt-rp-uuid")).title).toBe(
			NEW_TITLE,
		);

		// 2. assignment_test
		expect((await readTitle(client, "assignment_test", "at-org1")).title).toBe(
			NEW_TITLE,
		);
		expect((await readTitle(client, "assignment_test", "at-org2")).title).toBe(
			NEW_TITLE,
		);
		expect((await readTitle(client, "assignment_test", "at-org3")).title).toBe(
			NEW_TITLE,
		);
		const syncedTests = await db
			.select()
			.from(schema.assignmentTest)
			.where(eq(schema.assignmentTest.orgId, "org-sync-ws"));
		expect(syncedTests).toHaveLength(3);
		expect(syncedTests.every((row) => row.title === NEW_TITLE)).toBe(true);

		// 3. library_test_part
		expect(
			(await readTitle(client, "library_test_part", "ltp-ready-p1")).title,
		).toBe(NEW_TITLE);
		expect(
			(await readTitle(client, "library_test_part", "ltp-ready-p2")).title,
		).toBe(`${NEW_TITLE} — P2`);
		expect(
			(await readTitle(client, "library_test_part", "ltp-ready-p3")).title,
		).toBe(`${NEW_TITLE} — P3`);
		expect(
			(await readTitle(client, "library_test_part", "ltp-draft-p1")).title,
		).toBe(`${NEW_TITLE} — P1`);
		expect(
			(await readTitle(client, "library_test_part", "ltp-draft-p2")).title,
		).toBe(`Passage 2: ${NEW_TITLE}`);
		expect(
			(await readTitle(client, "library_test_part", "ltp-draft-p3")).title,
		).toBe(CLEAN_PASSAGE_TITLE);
		expect(
			(await readTitle(client, "library_test_part", "ltp-rp-p2")).title,
		).toBe(`Reading Passage 2: ${NEW_TITLE}`);

		// 4. assignment_prompt
		expect(
			(await readTitle(client, "assignment_prompt", "ap-exact")).title,
		).toBe(NEW_TITLE);
		expect((await readTitle(client, "assignment_prompt", "ap-p1")).title).toBe(
			`${NEW_TITLE} — P1`,
		);
		expect((await readTitle(client, "assignment_prompt", "ap-p2")).title).toBe(
			`${NEW_TITLE} — P2`,
		);
		expect((await readTitle(client, "assignment_prompt", "ap-p3")).title).toBe(
			`${NEW_TITLE} — P3`,
		);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-passage2")).title,
		).toBe(`Passage 2: ${NEW_TITLE}`);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-reading-passage2"))
				.title,
		).toBe(`Reading Passage 2: ${NEW_TITLE}`);
		const [syncedPromptAfter] = await db
			.select()
			.from(schema.assignmentPrompt)
			.where(
				eq(
					schema.assignmentPrompt.libraryRef,
					"library_test_part:ltp-ws-sync-p2",
				),
			);
		expect(syncedPromptAfter?.title).toBe(`${NEW_TITLE} — P2`);

		const fkCheck = await client.execute("PRAGMA foreign_key_check");
		expect(fkCheck.rows).toHaveLength(0);
	});

	test("enforces INF-03 tenant isolation, provenance guards, immutable snapshots, and cleans orphan copies", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0090_concerned_mach_iv.sql");

		for (let i = 1; i <= 12; i++) {
			await seedOrg(client, `org-e${i}`);
		}

		// Valid source Reading library test + part
		await seedLibraryTest(client, {
			id: "lt-shares",
			title: OLD_TITLE,
			skill: "reading",
		});
		await seedLibraryPart(client, {
			id: "ltp-shares-p2",
			testId: "lt-shares",
			part: "p2",
			title: CLEAN_PASSAGE_TITLE,
		});

		// Unrelated Reading library test + part
		await seedLibraryTest(client, {
			id: "lt-unrelated",
			title: "The History of Tea",
			skill: "reading",
		});
		await seedLibraryPart(client, {
			id: "ltp-unrelated-p2",
			testId: "lt-unrelated",
			part: "p2",
			title: OLD_TITLE,
		});

		// Listening library test + part with same corrupted title
		await seedLibraryTest(client, {
			id: "lt-listening",
			title: OLD_TITLE,
			skill: "listening",
		});
		await seedLibraryPart(client, {
			id: "ltp-listening-s1",
			testId: "lt-listening",
			part: "s1",
			title: OLD_TITLE,
		});

		// org-e1: org-created assignment_test (library_ref IS NULL)
		await seedAssignmentTest(client, {
			id: "at-e1-null",
			orgId: "org-e1",
			title: OLD_TITLE,
			libraryRef: null,
		});
		// org-e2: blank library_ref
		await seedAssignmentTest(client, {
			id: "at-e2-blank",
			orgId: "org-e2",
			title: OLD_TITLE,
			libraryRef: "   ",
		});
		// org-e3: teacher customized title
		const customTitle = `[Custom] ${OLD_TITLE}`;
		await seedAssignmentTest(client, {
			id: "at-e3-custom",
			orgId: "org-e3",
			title: customTitle,
			libraryRef: "lt-shares",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-e3-custom",
			orgId: "org-e3",
			part: "p2",
			title: customTitle,
			libraryRef: "library_test_part:ltp-shares-p2",
		});
		// org-e4: points to unrelated Reading library test
		await seedAssignmentTest(client, {
			id: "at-e4-unrelated",
			orgId: "org-e4",
			title: OLD_TITLE,
			libraryRef: "lt-unrelated",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-e4-unrelated",
			orgId: "org-e4",
			part: "p2",
			title: OLD_TITLE,
			libraryRef: "library_test_part:ltp-unrelated-p2",
		});
		// org-e5: wrong skill (listening)
		await seedAssignmentTest(client, {
			id: "at-e5-listening",
			orgId: "org-e5",
			title: OLD_TITLE,
			skill: "listening",
			libraryRef: "lt-listening",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-e5-listening",
			orgId: "org-e5",
			skill: "listening",
			part: "s1",
			title: OLD_TITLE,
			libraryRef: "library_test_part:ltp-listening-s1",
		});
		// org-e6: wildcard spoof prefix `libraryXtestYpart:`
		await seedAssignmentPrompt(client, {
			id: "ap-e6-spoof",
			orgId: "org-e6",
			part: "p2",
			title: OLD_TITLE,
			libraryRef: "libraryXtestYpart:ltp-shares-p2",
		});
		// org-e7: teacher edited passage while keeping library_ref and OLD_TITLE (INF-03)
		await seedAssignmentPrompt(client, {
			id: "ap-e7-edited-passage",
			orgId: "org-e7",
			part: "p2",
			title: OLD_TITLE,
			passage: "Teacher rewrote this passage entirely.",
			libraryRef: "library_test_part:ltp-shares-p2",
		});
		// org-e8: part slot mismatch (part = p2, title suffix = — P1)
		await seedAssignmentPrompt(client, {
			id: "ap-e8-slot-mismatch",
			orgId: "org-e8",
			part: "p2",
			title: `${OLD_TITLE} — P1`,
			libraryRef: "library_test_part:ltp-shares-p2",
		});
		// org-e9: orphan copies whose source library_test / library_test_part was deleted
		await seedAssignmentTest(client, {
			id: "at-e9-orphan",
			orgId: "org-e9",
			title: OLD_TITLE,
			status: "draft",
			libraryRef: "deleted-library-test-id",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-e9-orphan",
			orgId: "org-e9",
			part: "p2",
			title: `${OLD_TITLE} — P2`,
			libraryRef: "library_test_part:deleted-library-part-id",
		});
		// org-e10: blank library_test_part ref must not fall into orphan NOT EXISTS branch
		await seedAssignmentPrompt(client, {
			id: "ap-e10-blank-part-ref",
			orgId: "org-e10",
			part: "p2",
			title: OLD_TITLE,
			libraryRef: "library_test_part:   ",
		});
		// org-e11: org-created prompt (library_ref IS NULL) must stay untouched
		await seedAssignmentPrompt(client, {
			id: "ap-e11-null-ref",
			orgId: "org-e11",
			part: "p2",
			title: OLD_TITLE,
			libraryRef: null,
		});
		// org-e12: assignment_prompt.part !== ltp.part with exact OLD_TITLE and matching passage
		await seedAssignmentPrompt(client, {
			id: "ap-e12-part-mismatch",
			orgId: "org-e12",
			part: "p1",
			title: OLD_TITLE,
			libraryRef: "library_test_part:ltp-shares-p2",
		});

		// Immutable snapshots: class_assignment and quiz_attempt must remain untouched
		await client.execute({
			sql: "INSERT INTO class (id, org_id, name) VALUES ('cls-1', 'org-e3', 'IELTS 6.5')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO class_assignment (id, org_id, class_id, prompt_id, title, due) VALUES ('ca-1', 'org-e3', 'cls-1', 'ap-e3-custom', ?, '2026-12-01')",
			args: [OLD_TITLE],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-e9', 'org-e9', 'Lan', 'lan@test.local')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot) VALUES ('att-e9', 'org-e9', NULL, 'stu-e9', 'at-e9-orphan', 'practice', 'submitted', ?)",
			args: [SAMPLE_QUESTIONS],
		});

		await applyFile(client, migration0091File());

		// Protected rows stay untouched
		expect(
			(await readTitle(client, "library_test", "lt-listening")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "library_test_part", "ltp-listening-s1")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "library_test_part", "ltp-unrelated-p2")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_test", "at-e1-null")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_test", "at-e2-blank")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_test", "at-e3-custom")).title,
		).toBe(customTitle);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e3-custom")).title,
		).toBe(customTitle);
		expect(
			(await readTitle(client, "assignment_test", "at-e4-unrelated")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e4-unrelated")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_test", "at-e5-listening")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e5-listening")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e6-spoof")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e7-edited-passage"))
				.title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e8-slot-mismatch"))
				.title,
		).toBe(`${OLD_TITLE} — P1`);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e10-blank-part-ref"))
				.title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e11-null-ref")).title,
		).toBe(OLD_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e12-part-mismatch"))
				.title,
		).toBe(OLD_TITLE);
		expect((await readTitle(client, "class_assignment", "ca-1")).title).toBe(
			OLD_TITLE,
		);
		const attemptRow = await client.execute({
			sql: "SELECT questions_snapshot FROM quiz_attempt WHERE id = 'att-e9'",
			args: [],
		});
		expect(String(attemptRow.rows[0]?.questions_snapshot)).toBe(
			SAMPLE_QUESTIONS,
		);

		// Orphan copies ARE cleaned
		expect(
			(await readTitle(client, "assignment_test", "at-e9-orphan")).title,
		).toBe(NEW_TITLE);
		expect(
			(await readTitle(client, "assignment_prompt", "ap-e9-orphan")).title,
		).toBe(`${NEW_TITLE} — P2`);
	});

	test("is idempotent on re-run with fixed updated_at sentinels and upgrades via Drizzle migrator", async () => {
		// 1. Journal monotonicity & breakpoints check
		const journal = JSON.parse(
			readFileSync(`${MIGRATIONS_DIR}/meta/_journal.json`, "utf8"),
		) as {
			entries: Array<{
				idx: number;
				when: number;
				tag: string;
				breakpoints: boolean;
			}>;
		};
		const entry90 = journal.entries.find((e) => e.idx === 90);
		const entry91 = journal.entries.find((e) => e.idx === 91);
		expect(entry90).toBeDefined();
		expect(entry91).toBeDefined();
		expect(entry91?.tag.startsWith("0091_")).toBe(true);
		expect(entry91?.breakpoints).toBe(true);
		expect(entry91?.when ?? 0).toBeGreaterThan(entry90?.when ?? 0);

		// 2. Idempotency check with explicit updated_at = 1000 sentinel
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0090_concerned_mach_iv.sql");
		await seedOrg(client, "org-1");
		await seedLibraryTest(client, {
			id: "lt-idem",
			title: OLD_TITLE,
			updatedAt: 500,
		});
		await seedLibraryPart(client, {
			id: "ltp-idem",
			testId: "lt-idem",
			part: "p2",
			title: OLD_TITLE,
			updatedAt: 500,
		});
		await seedAssignmentTest(client, {
			id: "at-idem",
			orgId: "org-1",
			title: OLD_TITLE,
			libraryRef: "lt-idem",
			updatedAt: 500,
		});
		await seedAssignmentPrompt(client, {
			id: "ap-idem",
			orgId: "org-1",
			part: "p2",
			title: OLD_TITLE,
			libraryRef: "library_test_part:ltp-idem",
		});

		await applyFile(client, migration0091File());
		expect(
			(await readTitle(client, "library_test", "lt-idem")).updatedAt,
		).toBeGreaterThan(500);
		expect(
			(await readTitle(client, "library_test_part", "ltp-idem")).updatedAt,
		).toBeGreaterThan(500);
		expect(
			(await readTitle(client, "assignment_test", "at-idem")).updatedAt,
		).toBeGreaterThan(500);

		await client.execute(
			"UPDATE library_test SET updated_at = 1000 WHERE id = 'lt-idem'",
		);
		await client.execute(
			"UPDATE library_test_part SET updated_at = 1000 WHERE id = 'ltp-idem'",
		);
		await client.execute(
			"UPDATE assignment_test SET updated_at = 1000 WHERE id = 'at-idem'",
		);

		// Second run must match 0 rows and preserve sentinel updated_at = 1000.
		await applyFile(client, migration0091File());
		expect(await readTitle(client, "library_test", "lt-idem")).toEqual({
			title: NEW_TITLE,
			updatedAt: 1000,
		});
		expect(await readTitle(client, "library_test_part", "ltp-idem")).toEqual({
			title: NEW_TITLE,
			updatedAt: 1000,
		});
		expect(await readTitle(client, "assignment_test", "at-idem")).toEqual({
			title: NEW_TITLE,
			updatedAt: 1000,
		});
		expect(
			(await readTitle(client, "assignment_prompt", "ap-idem")).title,
		).toBe(NEW_TITLE);

		// 3. Upgrade via drizzle-orm/libsql/migrator from 0090 -> 0091
		const drizzleClient = createClient({ url: "file::memory:" });
		await applyThrough(drizzleClient, "0090_concerned_mach_iv.sql");
		await drizzleClient.execute(`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`);
		await drizzleClient.execute({
			sql: 'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
			args: ["seeded-through-0090", entry90?.when ?? 0],
		});
		await seedOrg(drizzleClient, "org-m");
		await seedLibraryTest(drizzleClient, { id: "lt-m", title: OLD_TITLE });
		await seedLibraryPart(drizzleClient, {
			id: "ltp-m",
			testId: "lt-m",
			part: "p2",
			title: `${OLD_TITLE} — P2`,
		});
		await seedAssignmentTest(drizzleClient, {
			id: "at-m",
			orgId: "org-m",
			title: OLD_TITLE,
			libraryRef: "lt-m",
		});
		await seedAssignmentPrompt(drizzleClient, {
			id: "ap-m",
			orgId: "org-m",
			part: "p2",
			title: `${OLD_TITLE} — P2`,
			libraryRef: "library_test_part:ltp-m",
		});

		const db = drizzle(drizzleClient, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		expect((await readTitle(drizzleClient, "library_test", "lt-m")).title).toBe(
			NEW_TITLE,
		);
		expect(
			(await readTitle(drizzleClient, "library_test_part", "ltp-m")).title,
		).toBe(`${NEW_TITLE} — P2`);
		expect(
			(await readTitle(drizzleClient, "assignment_test", "at-m")).title,
		).toBe(NEW_TITLE);
		expect(
			(await readTitle(drizzleClient, "assignment_prompt", "ap-m")).title,
		).toBe(`${NEW_TITLE} — P2`);
	});

	test("HTTP API returns clean title on Admin list/detail and Student catalog/quiz without recreating pre-existing org prompt", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0090_concerned_mach_iv.sql");

		await seedOrg(client, "org-existing");
		await seedOrg(client, "org-new");
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-1', 'org-existing', 'Hoa', 'hoa@test.local')",
			args: [],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-2', 'org-new', 'Hoa', 'hoa@test.local')",
			args: [],
		});

		await seedLibraryTest(client, {
			id: "lt-e2e",
			title: OLD_TITLE,
			skill: "reading",
			status: "ready",
		});
		await seedLibraryPart(client, {
			id: "ltp-e2e",
			testId: "lt-e2e",
			part: "p2",
			title: OLD_TITLE,
			passage: SAMPLE_PASSAGE,
			questions: SAMPLE_QUESTIONS,
		});

		// Complete pre-migration org graph on org-existing (assignment_test + assignment_prompt + assignment_test_part)
		await seedAssignmentTest(client, {
			id: "at-existing",
			orgId: "org-existing",
			title: OLD_TITLE,
			skill: "reading",
			status: "ready",
			libraryRef: "lt-e2e",
		});
		await seedAssignmentPrompt(client, {
			id: "ap-existing",
			orgId: "org-existing",
			title: OLD_TITLE,
			skill: "reading",
			part: "p2",
			passage: SAMPLE_PASSAGE,
			questions: SAMPLE_QUESTIONS,
			libraryRef: "library_test_part:ltp-e2e",
		});
		await client.execute({
			sql: "INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position) VALUES ('atp-existing', 'at-existing', 'ap-existing', 'p2', 1)",
			args: [],
		});

		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0091File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		const drizzleDb = drizzle(client, { schema });
		const app = buildApp({
			getDb: () => drizzleDb as unknown as Db,
			corsOrigin: ["http://localhost:8003"],
			adminEmails: ["admin@test.local"],
			adminOrigins: ["http://localhost:8004"],
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const user = headers.get("x-test-user");
				if (user === "admin") {
					return {
						userId: "u-admin",
						userName: "Admin",
						email: "admin@test.local",
						emailVerified: true,
						role: "admin",
					};
				}
				if (user === "hoa") {
					return {
						userId: "u-hoa",
						userName: "Hoa",
						email: "hoa@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});

		// 1. Admin list
		const adminListRes = await app.request(
			"/api/admin/library/tests?skill=reading",
			{ headers: { "x-test-user": "admin" } },
		);
		expect(adminListRes.status).toBe(200);
		const adminList = (await adminListRes.json()) as {
			tests: Array<{ id: string; title: string }>;
		};
		expect(adminList.tests).toHaveLength(1);
		expect(adminList.tests[0]?.title).toBe(NEW_TITLE);

		// 2. Admin detail
		const adminDetailRes = await app.request(
			"/api/admin/library/tests/lt-e2e",
			{
				headers: { "x-test-user": "admin" },
			},
		);
		expect(adminDetailRes.status).toBe(200);
		const adminDetail = (await adminDetailRes.json()) as {
			title: string;
			parts: Array<{ title: string }>;
		};
		expect(adminDetail.title).toBe(NEW_TITLE);
		expect(adminDetail.parts[0]?.title).toBe(NEW_TITLE);

		// 3. Student practice catalog (both pre-existing org and newly synced org)
		for (const orgId of ["org-existing", "org-new"]) {
			const catalogRes = await app.request(
				"/api/student/practice?skill=reading",
				{ headers: { "x-test-user": "hoa", "x-student-org-id": orgId } },
			);
			expect(catalogRes.status).toBe(200);
			const catalog = (await catalogRes.json()) as {
				items: Array<{ testId: string; title: string }>;
			};
			expect(catalog.items).toHaveLength(1);
			expect(catalog.items[0]?.title).toBe(NEW_TITLE);
		}

		// 4. Student quiz detail + confirm pre-existing assignment_prompt updated in place
		const quizRes = await app.request(
			"/api/student/practice/at-existing/quiz",
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-existing",
				},
			},
		);
		expect(quizRes.status).toBe(200);
		const quizDetail = (await quizRes.json()) as { title: string };
		expect(quizDetail.title).toBe(NEW_TITLE);

		const existingPrompts = await drizzleDb
			.select()
			.from(schema.assignmentPrompt)
			.where(eq(schema.assignmentPrompt.orgId, "org-existing"));
		expect(existingPrompts).toHaveLength(1);
		expect(existingPrompts[0]?.id).toBe("ap-existing");
		expect(existingPrompts[0]?.title).toBe(NEW_TITLE);
	});
});
