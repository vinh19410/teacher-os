/**
 * Verifies migration 0089 safely updates the Listening "Talking about the
 * history of bikes" Q5 blank wording in both `library_test_part` and
 * untouched `assignment_prompt` copies while preserving teacher edits,
 * malformed JSON safety, `quiz_attempt` snapshot immutability, Alchemy flat
 * SQL execution, and Drizzle migrator compatibility.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const BIKES_TEST_ID = "lib-listen-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3";
const BIKES_PART_ID = "lib-listen-part-83a7d7c9-ff79-47c3-80a2-b8bd4250a6b3-s4";
const BIKES_LIBRARY_REF = `library_test_part:${BIKES_PART_ID}`;

const OLD_CELL = "<td><p>easier and <strong>(5)</strong> ride</p></td>";
const NEW_CELL = "<td><p>easier; ride <strong>(5)</strong></p></td>";
const OLD_STEM = "easier and ____ ride";
const NEW_STEM = "easier; ride ____";

function buildBikesGroupInstruction(cellHtml: string): string {
	return (
		"<p>Complete the table below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.</p>" +
		"<h3><strong>Talking about the history of bikes</strong></h3>" +
		"<table><tbody>" +
		"<tr><td><p><strong>(3)</strong></p></td><td><p>Chain and sprocket are <strong>(4)</strong></p></td>" +
		`${cellHtml}<td><p>harder to balance</p></td></tr>` +
		"</tbody></table>"
	);
}

const MCQ_MANY_INSTRUCTION =
	"<p>Choose THREE letters, A-F, and write them next to questions 8-10. The invention of different gears on a bicycle affected which THREE of the following?</p>";

function buildBikesGroups(cellHtml = OLD_CELL) {
	return [
		{
			id: "g1",
			type: "tablecomp",
			instruction: buildBikesGroupInstruction(cellHtml),
			startIndex: 0,
			count: 7,
			optionBank: [],
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		},
		{
			id: "g2",
			type: "mcq_many",
			instruction: MCQ_MANY_INSTRUCTION,
			startIndex: 7,
			count: 3,
			optionBank: [],
			answersInline: false,
			splitContent: false,
			dragDrop: false,
		},
	];
}

function buildBikesIntro(cellHtml = OLD_CELL): string {
	return `${buildBikesGroupInstruction(cellHtml)}\n${MCQ_MANY_INSTRUCTION}`;
}

function buildBikesQuestions(
	q5Overrides?: Partial<{
		stem: unknown;
		answer: unknown;
		alts: unknown;
		type: unknown;
	}>,
) {
	const q5: Record<string, unknown> = {
		stem: OLD_STEM,
		opts: null,
		answer: "more smoothly",
		alts: "",
		type: "tablecomp",
		pin: null,
		...q5Overrides,
	};
	return [
		{
			stem: "need ____ than walking",
			opts: null,
			answer: "less effort",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		{
			stem: "quite ____",
			opts: null,
			answer: "uncomfortable",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		{
			stem: "____",
			opts: null,
			answer: "1860s",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		{
			stem: "Chain and sprocket are ____",
			opts: null,
			answer: "connected",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		q5,
		{
			stem: "use ____",
			opts: null,
			answer: "rubber wheels",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		{
			stem: "____",
			opts: null,
			answer: "safer",
			alts: "",
			type: "tablecomp",
			pin: null,
		},
		{
			stem: "Choose THREE letters, A-F.",
			opts: ["A", "B", "C", "D", "E", "F"],
			answer: "C",
			alts: "",
			type: "mcq_many",
			pin: null,
			answerSet: "set-2",
		},
		{
			stem: "Choose THREE letters, A-F.",
			opts: ["A", "B", "C", "D", "E", "F"],
			answer: "D",
			alts: "",
			type: "mcq_many",
			pin: null,
			answerSet: "set-2",
		},
		{
			stem: "Choose THREE letters, A-F.",
			opts: ["A", "B", "C", "D", "E", "F"],
			answer: "F",
			alts: "",
			type: "mcq_many",
			pin: null,
			answerSet: "set-2",
		},
	];
}

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

function migration0089File(): string {
	const file = migrationFiles().find((name) => name.startsWith("0089_"));
	if (!file) throw new Error("migration 0089 not found");
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

async function seedBikesLibrary(
	client: Client,
	opts?: {
		skill?: string;
		status?: string;
		part?: string;
		intro?: string;
		questions?: string;
		groups?: string;
		updatedAt?: number;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test (id, title, skill, status) VALUES (?, 'Talking about the history of bikes', ?, ?)",
		args: [BIKES_TEST_ID, opts?.skill ?? "listening", opts?.status ?? "ready"],
	});
	await client.execute({
		sql: "INSERT INTO library_test_part (id, test_id, part, type, title, intro, questions, groups, updated_at) VALUES (?, ?, ?, 'tablecomp', 'Section 4: Talking about the history of bikes', ?, ?, ?, ?)",
		args: [
			BIKES_PART_ID,
			BIKES_TEST_ID,
			opts?.part ?? "s4",
			opts?.intro ?? "",
			opts?.questions ?? JSON.stringify(buildBikesQuestions()),
			opts?.groups ?? JSON.stringify(buildBikesGroups()),
			opts?.updatedAt ?? 500,
		],
	});
}

async function seedBikesPrompt(
	client: Client,
	opts: {
		id: string;
		orgId: string;
		skill?: string;
		part?: string;
		intro?: string;
		questions?: string;
		groups?: string;
		libraryRef?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, prompt, intro, questions, groups, library_ref, status) VALUES (?, ?, 'task2', '', ?, ?, 'tablecomp', 'Section 4: Talking about the history of bikes', '', ?, ?, ?, ?, 'ready')",
		args: [
			opts.id,
			opts.orgId,
			opts.skill ?? "listening",
			opts.part ?? "s4",
			opts.intro ?? buildBikesIntro(),
			opts.questions ?? JSON.stringify(buildBikesQuestions()),
			opts.groups ?? JSON.stringify(buildBikesGroups()),
			opts.libraryRef === undefined ? BIKES_LIBRARY_REF : opts.libraryRef,
		],
	});
}

async function readPart(client: Client) {
	const res = await client.execute({
		sql: "SELECT intro, questions, groups, updated_at FROM library_test_part WHERE id = ?",
		args: [BIKES_PART_ID],
	});
	const row = res.rows[0];
	return {
		intro: String(row?.intro ?? ""),
		questions: String(row?.questions ?? ""),
		groups: String(row?.groups ?? ""),
		updatedAt: Number(row?.updated_at ?? 0),
	};
}

async function readPrompt(client: Client, id: string) {
	const res = await client.execute({
		sql: "SELECT intro, questions, groups FROM assignment_prompt WHERE id = ?",
		args: [id],
	});
	const row = res.rows[0];
	return {
		intro: String(row?.intro ?? ""),
		questions: String(row?.questions ?? ""),
		groups: String(row?.groups ?? ""),
	};
}

describe("listening bikes Q5 blank wording migration 0089", () => {
	test("updates library_test_part and untouched assignment_prompt rows via flat SQL execution while preserving quiz_attempt snapshot", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0088_nostalgic_arachne.sql");

		await seedOrg(client, "org-1");
		await seedOrg(client, "org-pre85");
		await seedBikesLibrary(client);

		await seedBikesPrompt(client, {
			id: "ap-grouped",
			orgId: "org-1",
		});
		await seedBikesPrompt(client, {
			id: "ap-pre85",
			orgId: "org-pre85",
			groups: "[]",
		});

		// Historical submitted practice attempt keeps frozen snapshot untouched.
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, email) VALUES ('stu-1', 'org-1', 'Minh', 'minh@test.local')",
			args: [],
		});
		const frozenSnapshot = JSON.stringify(buildBikesQuestions());
		await client.execute({
			sql: "INSERT INTO quiz_attempt (id, org_id, assignment_id, student_id, test_id, mode, status, questions_snapshot) VALUES ('att-1', 'org-1', NULL, 'stu-1', NULL, 'practice', 'submitted', ?)",
			args: [frozenSnapshot],
		});

		// Execute raw flat SQL file exactly like Cloudflare D1 / Alchemy runner.
		const rawSql = readFileSync(
			`${MIGRATIONS_DIR}/${migration0089File()}`,
			"utf8",
		);
		await client.executeMultiple(rawSql);

		const part = await readPart(client);
		const partQs = JSON.parse(part.questions) as Array<{
			stem: string;
			answer: string;
			alts: string;
		}>;
		const partGroups = JSON.parse(part.groups) as Array<{
			instruction: string;
		}>;
		expect(partQs[4]?.stem).toBe(NEW_STEM);
		expect(partQs[4]?.answer).toBe("more smoothly");
		expect(partQs[4]?.alts).toBe("");
		expect(partQs[3]?.stem).toBe("Chain and sprocket are ____");
		expect(partGroups[0]?.instruction).toContain(NEW_CELL);
		expect(partGroups[0]?.instruction).not.toContain(OLD_CELL);
		expect(partGroups[1]?.instruction).toBe(MCQ_MANY_INSTRUCTION);

		const groupedPrompt = await readPrompt(client, "ap-grouped");
		const groupedQs = JSON.parse(groupedPrompt.questions) as Array<{
			stem: string;
			answer: string;
		}>;
		const groupedGroups = JSON.parse(groupedPrompt.groups) as Array<{
			instruction: string;
		}>;
		expect(groupedQs[4]?.stem).toBe(NEW_STEM);
		expect(groupedQs[4]?.answer).toBe("more smoothly");
		expect(groupedGroups[0]?.instruction).toContain(NEW_CELL);
		expect(groupedGroups[0]?.instruction).not.toContain(OLD_CELL);
		expect(groupedPrompt.intro).toContain(NEW_CELL);
		expect(groupedPrompt.intro).not.toContain(OLD_CELL);

		const pre85Prompt = await readPrompt(client, "ap-pre85");
		const pre85Qs = JSON.parse(pre85Prompt.questions) as Array<{
			stem: string;
		}>;
		expect(pre85Qs[4]?.stem).toBe(NEW_STEM);
		expect(pre85Prompt.intro).toContain(NEW_CELL);
		expect(pre85Prompt.intro).not.toContain(OLD_CELL);
		expect(pre85Prompt.groups).toBe("[]");

		const attemptRes = await client.execute({
			sql: "SELECT questions_snapshot FROM quiz_attempt WHERE id = 'att-1'",
			args: [],
		});
		expect(String(attemptRes.rows[0]?.questions_snapshot)).toBe(frozenSnapshot);

		const fkCheck = await client.execute("PRAGMA foreign_key_check");
		expect(fkCheck.rows).toHaveLength(0);
	});

	test("respects org isolation and skips teacher-edited or admin-edited rows", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0088_nostalgic_arachne.sql");

		for (const orgId of [
			"org-2",
			"org-3",
			"org-4",
			"org-5",
			"org-6",
			"org-7",
			"org-8",
		]) {
			await seedOrg(client, orgId);
		}

		// Admin manually rewrote library_test_part.groups[0].instruction: must not split-brain.
		const adminCustomGroups = JSON.stringify([
			{
				...buildBikesGroups()[0],
				instruction: "<p>Admin custom table wording for Q5</p>",
			},
			buildBikesGroups()[1],
		]);
		await seedBikesLibrary(client, { groups: adminCustomGroups });

		// org-2: teacher added alts = "smoother"
		const altsQs = JSON.stringify(buildBikesQuestions({ alts: "smoother" }));
		await seedBikesPrompt(client, {
			id: "ap-alts",
			orgId: "org-2",
			questions: altsQs,
		});

		// org-3: teacher changed answer to "smoother"
		const ansQs = JSON.stringify(buildBikesQuestions({ answer: "smoother" }));
		await seedBikesPrompt(client, {
			id: "ap-ans",
			orgId: "org-3",
			questions: ansQs,
		});

		// org-4: teacher rewrote Q5 stem
		const stemQs = JSON.stringify(
			buildBikesQuestions({ stem: "smoother and ____ ride" }),
		);
		await seedBikesPrompt(client, {
			id: "ap-stem",
			orgId: "org-4",
			questions: stemQs,
		});

		// org-5: teacher rewrote intro with a note quoting raw string outside <td><p>...</p></td>
		const noteIntro =
			"<p>Ghi chú: bản gốc là easier and <strong>(5)</strong> ride.</p>";
		await seedBikesPrompt(client, {
			id: "ap-note-intro",
			orgId: "org-5",
			intro: noteIntro,
		});

		// org-6: teacher/custom groups[0].instruction
		await seedBikesPrompt(client, {
			id: "ap-custom-groups",
			orgId: "org-6",
			groups: adminCustomGroups,
		});

		// org-7: wildcard spoofed library_ref
		await seedBikesPrompt(client, {
			id: "ap-wildcard-ref",
			orgId: "org-7",
			libraryRef: `libraryXtestYpart:${BIKES_PART_ID}`,
		});

		// org-8: different skill
		await seedBikesPrompt(client, {
			id: "ap-wrong-skill",
			orgId: "org-8",
			skill: "reading",
		});

		await applyFile(client, migration0089File());

		// Admin-edited library_test_part stayed untouched (no split-brain).
		const part = await readPart(client);
		expect(part.questions).toContain(OLD_STEM);
		expect(part.groups).toBe(adminCustomGroups);

		// Every teacher-edited / non-matching assignment_prompt stayed untouched.
		for (const id of [
			"ap-alts",
			"ap-ans",
			"ap-stem",
			"ap-note-intro",
			"ap-custom-groups",
			"ap-wildcard-ref",
			"ap-wrong-skill",
		]) {
			const row = await readPrompt(client, id);
			expect(row.questions).not.toContain(NEW_STEM);
			expect(row.intro).not.toContain(NEW_CELL);
			expect(row.groups).not.toContain(NEW_CELL);
		}
		expect((await readPrompt(client, "ap-note-intro")).intro).toBe(noteIntro);
	});

	test("handles full and partial malformed JSON and type-affinity traps without throwing", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0088_nostalgic_arachne.sql");

		for (const orgId of [
			"org-c1",
			"org-c2",
			"org-c3",
			"org-c4",
			"org-c5",
			"org-c6",
		]) {
			await seedOrg(client, orgId);
		}

		// Library part has valid questions matching old stem, but corrupt groups JSON.
		await seedBikesLibrary(client, { groups: "{corrupt" });

		await seedBikesPrompt(client, {
			id: "ap-both-corrupt",
			orgId: "org-c1",
			questions: "{corrupt",
			groups: "{corrupt",
		});
		await seedBikesPrompt(client, {
			id: "ap-groups-corrupt",
			orgId: "org-c2",
			groups: "{corrupt",
		});
		await seedBikesPrompt(client, {
			id: "ap-groups-object",
			orgId: "org-c3",
			groups: '{"a":1}',
		});
		await seedBikesPrompt(client, {
			id: "ap-groups-scalar",
			orgId: "org-c4",
			groups: "[123]",
		});
		await seedBikesPrompt(client, {
			id: "ap-groups-no-instr",
			orgId: "org-c5",
			groups: '[{"id":"g1","type":"tablecomp"}]',
		});
		await seedBikesPrompt(client, {
			id: "ap-affinity-trap",
			orgId: "org-c6",
			questions: JSON.stringify(
				buildBikesQuestions({ answer: 123, stem: null }),
			),
		});

		await expect(
			applyFile(client, migration0089File()),
		).resolves.toBeUndefined();

		const part = await readPart(client);
		expect(part.groups).toBe("{corrupt");
		expect(part.questions).toContain(OLD_STEM);

		expect((await readPrompt(client, "ap-both-corrupt")).questions).toBe(
			"{corrupt",
		);
		expect((await readPrompt(client, "ap-groups-corrupt")).groups).toBe(
			"{corrupt",
		);
		expect((await readPrompt(client, "ap-groups-object")).groups).toBe(
			'{"a":1}',
		);
		expect((await readPrompt(client, "ap-groups-scalar")).groups).toBe("[123]");
		expect((await readPrompt(client, "ap-groups-no-instr")).groups).toBe(
			'[{"id":"g1","type":"tablecomp"}]',
		);
		expect((await readPrompt(client, "ap-affinity-trap")).intro).toContain(
			OLD_CELL,
		);
	});

	test("is idempotent on re-run with fixed updated_at sentinel and upgrades cleanly via Drizzle migrator", async () => {
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
		const entry88 = journal.entries.find((e) => e.idx === 88);
		const entry89 = journal.entries.find((e) => e.idx === 89);
		expect(entry88).toBeDefined();
		expect(entry89).toBeDefined();
		expect(entry89?.tag.startsWith("0089_")).toBe(true);
		expect(entry89?.breakpoints).toBe(true);
		expect(entry89?.when ?? 0).toBeGreaterThan(entry88?.when ?? 0);

		// 2. Idempotency check with explicit updated_at sentinel
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0088_nostalgic_arachne.sql");
		await seedOrg(client, "org-1");
		await seedBikesLibrary(client, { updatedAt: 500 });
		await seedBikesPrompt(client, { id: "ap-1", orgId: "org-1" });

		await applyFile(client, migration0089File());
		const afterFirst = await readPart(client);
		expect(afterFirst.updatedAt).toBeGreaterThan(500);

		await client.execute({
			sql: "UPDATE library_test_part SET updated_at = 1000 WHERE id = ?",
			args: [BIKES_PART_ID],
		});

		// Second run must match 0 rows and leave sentinel updated_at = 1000 intact.
		await applyFile(client, migration0089File());
		const afterSecond = await readPart(client);
		expect(afterSecond.updatedAt).toBe(1000);
		expect(afterSecond.questions).toBe(afterFirst.questions);
		expect(afterSecond.groups).toBe(afterFirst.groups);

		// 3. Upgrade via drizzle-orm/libsql/migrator from 0088 -> 0089
		const drizzleClient = createClient({ url: "file::memory:" });
		await applyThrough(drizzleClient, "0088_nostalgic_arachne.sql");
		await drizzleClient.execute(`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`);
		await drizzleClient.execute({
			sql: 'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
			args: ["seeded-through-0088", entry88?.when ?? 0],
		});
		await seedOrg(drizzleClient, "org-1");
		await seedBikesLibrary(drizzleClient);
		await seedBikesPrompt(drizzleClient, { id: "ap-migrator", orgId: "org-1" });

		const db = drizzle(drizzleClient, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		const upgradedPart = await readPart(drizzleClient);
		const upgradedPrompt = await readPrompt(drizzleClient, "ap-migrator");
		expect(upgradedPart.questions).toContain(NEW_STEM);
		expect(upgradedPart.groups).toContain(NEW_CELL);
		expect(upgradedPrompt.questions).toContain(NEW_STEM);
		expect(upgradedPrompt.groups).toContain(NEW_CELL);
		expect(upgradedPrompt.intro).toContain(NEW_CELL);
	});
});
