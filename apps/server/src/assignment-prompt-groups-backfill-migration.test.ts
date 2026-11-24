/**
 * Verifies migration 0087 safely backfills `assignment_prompt.groups` from
 * `library_test_part.groups` for pre-0085 library-cloned prompts while
 * protecting INF-03 org isolation, draft tests, and malformed/corrupt JSON.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const TEA_GROUPS = [
	{
		id: "grp-tea-1",
		type: "sent",
		instruction:
			"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.",
		startIndex: 0,
		count: 7,
		optionBank: [],
		answersInline: false,
		splitContent: false,
		dragDrop: false,
	},
	{
		id: "grp-tea-2",
		type: "tfng",
		instruction:
			"Do the following statements agree with the information given in Reading Passage 1?\nWrite\nTRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this",
		startIndex: 7,
		count: 6,
		optionBank: [],
		answersInline: false,
		splitContent: false,
		dragDrop: false,
	},
];

const TEA_QUESTIONS = [
	...Array.from({ length: 7 }, (_, i) => ({
		stem: `Sentence ${i + 1} ____.`,
		opts: null,
		answer: i === 2 ? "monks" : `word${i + 1}`,
		alts: "",
		type: "sent",
	})),
	...Array.from({ length: 6 }, (_, i) => ({
		stem: `Statement ${i + 8}.`,
		opts: null,
		answer: "TRUE",
		alts: "",
		type: "tfng",
	})),
];

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

function migration0087(): string {
	const file = migrationFiles().find((name) => name.startsWith("0087_"));
	if (!file) throw new Error("migration 0087 not found");
	return file;
}

async function seedOrg(client: Client, id = "org-1") {
	await client.execute({
		sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
		args: [id, `Org ${id}`],
	});
}

async function seedLibraryTestAndPart(
	client: Client,
	opts: {
		testId: string;
		partId: string;
		status?: string;
		skill?: string;
		part?: string;
		passage?: string;
		questions?: string;
		groups?: string;
	},
) {
	await client.execute({
		sql: "INSERT INTO library_test (id, title, skill, status) VALUES (?, ?, ?, ?)",
		args: [
			opts.testId,
			`Test ${opts.testId}`,
			opts.skill ?? "reading",
			opts.status ?? "ready",
		],
	});
	await client.execute({
		sql: "INSERT INTO library_test_part (id, test_id, part, type, title, passage, questions, groups) VALUES (?, ?, ?, 'sent', 'Passage 1', ?, ?, ?)",
		args: [
			opts.partId,
			opts.testId,
			opts.part ?? "p1",
			opts.passage ?? "<p>The story of tea begins in China.</p>",
			opts.questions ?? JSON.stringify(TEA_QUESTIONS),
			opts.groups ?? JSON.stringify(TEA_GROUPS),
		],
	});
}

async function seedPrompt(
	client: Client,
	opts: {
		id: string;
		orgId?: string;
		skill?: string;
		part?: string;
		passage?: string;
		questions?: string;
		groups?: string;
		libraryRef?: string | null;
	},
) {
	await client.execute({
		sql: "INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, prompt, passage, questions, groups, library_ref, status) VALUES (?, ?, 'task2', '', ?, ?, 'sent', 'The History of Tea', '', ?, ?, ?, ?, 'ready')",
		args: [
			opts.id,
			opts.orgId ?? "org-1",
			opts.skill ?? "reading",
			opts.part ?? "p1",
			opts.passage ?? "<p>The story of tea begins in China.</p>",
			opts.questions ?? JSON.stringify(TEA_QUESTIONS),
			opts.groups ?? "[]",
			opts.libraryRef === undefined ? null : opts.libraryRef,
		],
	});
}

async function groupsOf(client: Client, promptId: string): Promise<string> {
	const result = await client.execute({
		sql: "SELECT groups FROM assignment_prompt WHERE id = ?",
		args: [promptId],
	});
	return String(result.rows[0]?.groups ?? "");
}

describe("assignment_prompt groups backfill migration 0087", () => {
	test("backfills pre-0085 empty groups ('[]', '', '[ ]') from ready library_test_part and is idempotent", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0086_class_opening_email.sql");
		await seedOrg(client, "org-1");
		await seedOrg(client, "org-2");
		await seedOrg(client, "org-3");
		await seedLibraryTestAndPart(client, {
			testId: "lt-tea",
			partId: "ltp-tea-p1",
		});

		await seedPrompt(client, {
			id: "ap-empty-array",
			orgId: "org-1",
			groups: "[]",
			libraryRef: "library_test_part:ltp-tea-p1",
		});
		await seedPrompt(client, {
			id: "ap-empty-str",
			orgId: "org-2",
			groups: "",
			libraryRef: "library_test_part:ltp-tea-p1",
		});
		await seedPrompt(client, {
			id: "ap-spaced-array",
			orgId: "org-3",
			groups: "[ ]",
			libraryRef: "library_test_part:ltp-tea-p1",
		});

		await applyFile(client, migration0087());

		const expected = JSON.stringify(TEA_GROUPS);
		expect(await groupsOf(client, "ap-empty-array")).toBe(expected);
		expect(await groupsOf(client, "ap-empty-str")).toBe(expected);
		expect(await groupsOf(client, "ap-spaced-array")).toBe(expected);

		// Idempotent re-run
		await applyFile(client, migration0087());
		expect(await groupsOf(client, "ap-empty-array")).toBe(expected);

		const fk = await client.execute("PRAGMA foreign_key_check");
		expect(fk.rows).toEqual([]);
	});

	test("preserves existing groups, skips draft tests, edited/drifted prompts, non-matching refs, and wildcard spoofs", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0086_class_opening_email.sql");
		await seedOrg(client, "org-1");
		await seedOrg(client, "org-2");
		await seedOrg(client, "org-3");
		await seedOrg(client, "org-4");
		await seedOrg(client, "org-5");
		await seedOrg(client, "org-6");

		await seedLibraryTestAndPart(client, {
			testId: "lt-ready",
			partId: "ltp-ready",
			status: "ready",
		});
		await seedLibraryTestAndPart(client, {
			testId: "lt-draft",
			partId: "ltp-draft",
			status: "draft",
		});

		const customGroups = JSON.stringify([
			{
				id: "custom-1",
				type: "sent",
				instruction: "Custom org instruction",
				startIndex: 0,
				count: 13,
				optionBank: [],
			},
		]);

		// 1. Existing non-empty groups must not be overwritten
		await seedPrompt(client, {
			id: "ap-existing",
			orgId: "org-1",
			groups: customGroups,
			libraryRef: "library_test_part:ltp-ready",
		});
		// 2. Draft library test must be skipped
		await seedPrompt(client, {
			id: "ap-draft",
			orgId: "org-1",
			groups: "[]",
			libraryRef: "library_test_part:ltp-draft",
		});
		// 3. Teacher edited passage (INF-03) -> skipped
		await seedPrompt(client, {
			id: "ap-edited-passage",
			orgId: "org-2",
			passage: "<p>Teacher edited passage</p>",
			groups: "[]",
			libraryRef: "library_test_part:ltp-ready",
		});
		// 4. Question count mismatch -> skipped
		await seedPrompt(client, {
			id: "ap-count-mismatch",
			orgId: "org-3",
			questions: JSON.stringify(TEA_QUESTIONS.slice(0, 10)),
			groups: "[]",
			libraryRef: "library_test_part:ltp-ready",
		});
		// 5. Same question count (13) but drifted question.type -> skipped
		const driftedQuestions = TEA_QUESTIONS.map((q, i) =>
			i === 6 ? { ...q, type: "tfng" } : q,
		);
		await seedPrompt(client, {
			id: "ap-type-drift",
			orgId: "org-4",
			questions: JSON.stringify(driftedQuestions),
			groups: "[]",
			libraryRef: "library_test_part:ltp-ready",
		});
		// 6. library_exercise and NULL library_ref -> skipped
		await seedPrompt(client, {
			id: "ap-exercise",
			orgId: "org-5",
			groups: "[]",
			libraryRef: "library_exercise:lex-1",
		});
		await seedPrompt(client, {
			id: "ap-null-ref",
			orgId: "org-5",
			groups: "[]",
			libraryRef: null,
		});
		// 7. SQLite LIKE '_' wildcard spoof -> skipped
		await seedPrompt(client, {
			id: "ap-wildcard-spoof",
			orgId: "org-6",
			groups: "[]",
			libraryRef: "libraryXtestYpart:ltp-ready",
		});

		await applyFile(client, migration0087());

		expect(await groupsOf(client, "ap-existing")).toBe(customGroups);
		expect(await groupsOf(client, "ap-draft")).toBe("[]");
		expect(await groupsOf(client, "ap-edited-passage")).toBe("[]");
		expect(await groupsOf(client, "ap-count-mismatch")).toBe("[]");
		expect(await groupsOf(client, "ap-type-drift")).toBe("[]");
		expect(await groupsOf(client, "ap-exercise")).toBe("[]");
		expect(await groupsOf(client, "ap-null-ref")).toBe("[]");
		expect(await groupsOf(client, "ap-wildcard-spoof")).toBe("[]");
	});

	test("safely skips malformed JSON, non-arrays, corrupt shapes, SQLite type affinity traps, overlapping groups, and over-cap groups without throwing", async () => {
		const client = createClient({ url: "file::memory:" });
		await applyThrough(client, "0086_class_opening_email.sql");
		await seedOrg(client, "org-1");
		await seedOrg(client, "org-2");

		// 1. Malformed JSON in ltp.groups
		await seedLibraryTestAndPart(client, {
			testId: "lt-malformed",
			partId: "ltp-malformed",
			groups: "{corrupt",
		});
		await seedPrompt(client, {
			id: "ap-malformed",
			libraryRef: "library_test_part:ltp-malformed",
		});

		// 2. Non-array JSON in ltp.groups
		await seedLibraryTestAndPart(client, {
			testId: "lt-non-array",
			partId: "ltp-non-array",
			groups: '{"type":"sent"}',
		});
		await seedPrompt(client, {
			id: "ap-non-array",
			libraryRef: "library_test_part:ltp-non-array",
		});

		// 3. Corrupt shape (string startIndex SQLite affinity trap + missing instruction)
		await seedLibraryTestAndPart(client, {
			testId: "lt-affinity",
			partId: "ltp-affinity",
			groups: JSON.stringify([
				{ id: "g1", type: "sent", startIndex: "abc", count: 13 },
			]),
		});
		await seedPrompt(client, {
			id: "ap-affinity",
			libraryRef: "library_test_part:ltp-affinity",
		});

		// 4. Overlapping / non-contiguous groups with MIN=0, MAX=13, SUM=13
		await seedLibraryTestAndPart(client, {
			testId: "lt-overlap",
			partId: "ltp-overlap",
			groups: JSON.stringify([
				{ id: "g1", type: "sent", instruction: "A", startIndex: 0, count: 5 },
				{ id: "g2", type: "sent", instruction: "B", startIndex: 0, count: 2 },
				{ id: "g3", type: "tfng", instruction: "C", startIndex: 7, count: 6 },
			]),
		});
		await seedPrompt(client, {
			id: "ap-overlap",
			libraryRef: "library_test_part:ltp-overlap",
		});

		// 5. Over-cap (> 20 groups)
		const q21 = Array.from({ length: 21 }, (_, i) => ({
			stem: `Q${i + 1}`,
			opts: null,
			answer: "a",
			alts: "",
			type: "sent",
		}));
		const g21 = Array.from({ length: 21 }, (_, i) => ({
			id: `g-${i}`,
			type: "sent",
			instruction: "",
			startIndex: i,
			count: 1,
			optionBank: [],
		}));
		await seedLibraryTestAndPart(client, {
			testId: "lt-overcap",
			partId: "ltp-overcap",
			questions: JSON.stringify(q21),
			groups: JSON.stringify(g21),
		});
		await seedPrompt(client, {
			id: "ap-overcap",
			questions: JSON.stringify(q21),
			libraryRef: "library_test_part:ltp-overcap",
		});

		// 6. Malformed JSON in assignment_prompt.questions & assignment_prompt.groups
		await seedLibraryTestAndPart(client, {
			testId: "lt-good",
			partId: "ltp-good",
		});
		await seedPrompt(client, {
			id: "ap-bad-q",
			questions: "{bad-json",
			libraryRef: "library_test_part:ltp-good",
		});
		await seedPrompt(client, {
			id: "ap-bad-groups",
			orgId: "org-2",
			groups: "{corrupt",
			libraryRef: "library_test_part:ltp-good",
		});

		// 7. Missing required group keys individually (SQLite NULL 3-valued logic traps)
		const missingKeyCases: Array<{ id: string; groups: unknown[] }> = [
			{
				id: "missing-id",
				groups: [
					{
						type: "sent",
						instruction: "A",
						startIndex: 0,
						count: 13,
						optionBank: [],
					},
				],
			},
			{
				id: "missing-type",
				groups: [
					{
						id: "g1",
						instruction: "A",
						startIndex: 0,
						count: 13,
						optionBank: [],
					},
				],
			},
			{
				id: "missing-instruction",
				groups: [
					{ id: "g1", type: "sent", startIndex: 0, count: 13, optionBank: [] },
				],
			},
			{
				id: "missing-start",
				groups: [
					{
						id: "g1",
						type: "sent",
						instruction: "A",
						count: 13,
						optionBank: [],
					},
				],
			},
			{
				id: "missing-count",
				groups: [
					{
						id: "g1",
						type: "sent",
						instruction: "A",
						startIndex: 0,
						optionBank: [],
					},
				],
			},
		];
		for (const item of missingKeyCases) {
			await seedLibraryTestAndPart(client, {
				testId: `lt-${item.id}`,
				partId: `ltp-${item.id}`,
				groups: JSON.stringify(item.groups),
			});
			await seedPrompt(client, {
				id: `ap-${item.id}`,
				libraryRef: `library_test_part:ltp-${item.id}`,
			});
		}

		await applyFile(client, migration0087());

		expect(await groupsOf(client, "ap-malformed")).toBe("[]");
		expect(await groupsOf(client, "ap-non-array")).toBe("[]");
		expect(await groupsOf(client, "ap-affinity")).toBe("[]");
		expect(await groupsOf(client, "ap-overlap")).toBe("[]");
		expect(await groupsOf(client, "ap-overcap")).toBe("[]");
		expect(await groupsOf(client, "ap-bad-q")).toBe("[]");
		expect(await groupsOf(client, "ap-bad-groups")).toBe("{corrupt");
		for (const item of missingKeyCases) {
			expect(await groupsOf(client, `ap-${item.id}`)).toBe("[]");
		}
	});
});
