import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import {
	parseImportVocabArgs,
	runImportVocabProdCli,
} from "../../scripts/import-vocab-prod";
import {
	buildImportVocabPlan,
	classifyVocabEntryType,
	deterministicVocabUuid,
	formatWeekSkillDeckMeta,
	loadVocabImportDatasetFromXlsx,
	parseWeekSkillVocabSheet,
} from "./import-vocab";
import {
	applyPromoteVocabPlan,
	createLibsqlVocabPromoteRunner,
	formatRollbackSql,
	verifyPromotedVocab,
} from "./promote-vocab";

const SAMPLE_XLSX_PATH = resolve(
	import.meta.dirname,
	"../../../../docs/vocab-sample/IELTS_Bridge_Vocabulary.xlsx",
);

const SCHEMA_SQL = [
	`CREATE TABLE organization (
		id TEXT PRIMARY KEY NOT NULL,
		name TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE TABLE user (
		id TEXT PRIMARY KEY NOT NULL,
		name TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE,
		role TEXT DEFAULT 'teacher'
	)`,
	`CREATE TABLE membership (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id),
		org_id TEXT NOT NULL REFERENCES organization(id),
		role TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE TABLE class (
		id TEXT PRIMARY KEY NOT NULL,
		org_id TEXT NOT NULL REFERENCES organization(id),
		name TEXT NOT NULL
	)`,
	`CREATE TABLE vocab_group (
		id TEXT PRIMARY KEY NOT NULL,
		org_id TEXT NOT NULL REFERENCES organization(id),
		name TEXT NOT NULL,
		normalized_name TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	"CREATE UNIQUE INDEX vocab_group_org_normalized_name_uq ON vocab_group (org_id, normalized_name)",
	`CREATE TABLE vocab_deck (
		id TEXT PRIMARY KEY NOT NULL,
		org_id TEXT NOT NULL REFERENCES organization(id),
		class_id TEXT REFERENCES class(id),
		group_id TEXT REFERENCES vocab_group(id),
		title TEXT NOT NULL,
		lesson_number INTEGER,
		topic TEXT,
		lang TEXT NOT NULL DEFAULT 'en',
		source_library_deck_id TEXT,
		source_deck_id TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	`CREATE TABLE vocab_word (
		id TEXT PRIMARY KEY NOT NULL,
		deck_id TEXT NOT NULL REFERENCES vocab_deck(id),
		word TEXT NOT NULL,
		entry_type TEXT NOT NULL DEFAULT 'word',
		ipa TEXT,
		pos TEXT,
		translation TEXT NOT NULL DEFAULT '',
		example TEXT,
		audio_key TEXT,
		audio_url TEXT,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
];

async function createSeededTestDb(dbPath: string): Promise<Client> {
	const client = createClient({ url: `file:${dbPath}` });
	for (const stmt of SCHEMA_SQL) {
		await client.execute(stmt);
	}
	await client.execute({
		sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
		args: ["org-lead", "Lead Org", 1_700_000_000_000],
	});
	await client.execute({
		sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
		args: ["org-teacher", "Cô Mỹ", 1_700_000_001_000],
	});
	await client.execute({
		sql: "INSERT INTO user (id, name, email, role) VALUES (?, ?, ?, ?)",
		args: ["user-1", "Cô Mỹ", "msthucmy@gmail.com", "teacher"],
	});
	await client.execute({
		sql: "INSERT INTO membership (id, user_id, org_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
		args: ["mem-1", "user-1", "org-teacher", "owner", 1_700_000_001_000],
	});
	return client;
}

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	}
});

describe("import-vocab parsing", () => {
	it("classifies single-token as word and multi-token as chunk", () => {
		expect(classifyVocabEntryType("detect")).toBe("word");
		expect(classifyVocabEntryType("well-being")).toBe("word");
		expect(classifyVocabEntryType("emergency alarm")).toBe("chunk");
		expect(classifyVocabEntryType("take good care of")).toBe("chunk");
	});

	it("formats Week × Skill titles and omits generic Reading Passages from title", () => {
		expect(formatWeekSkillDeckMeta(1, "Reading", "Reading Passages")).toEqual({
			title: "Week 01 – Reading",
			topic: "Reading · Reading Passages",
		});
		expect(
			formatWeekSkillDeckMeta(1, "Writing Task 2", "Studying Abroad"),
		).toEqual({
			title: "Week 01 – Writing Task 2: Studying Abroad",
			topic: "Writing Task 2 · Studying Abroad",
		});
		expect(
			formatWeekSkillDeckMeta(8, "Listening", "Friends · Alex's Training"),
		).toEqual({
			title: "Week 08 – Listening: Friends · Alex's Training",
			topic: "Listening · Friends · Alex's Training",
		});
	});

	it("parses real IELTS_Bridge_Vocabulary.xlsx Tổng hợp into exact 32 decks / 996 words matching Thống kê", async () => {
		const dataset = await loadVocabImportDatasetFromXlsx({
			filePath: SAMPLE_XLSX_PATH,
			sheetName: "Tổng hợp",
			groupName: "IELTS BRIDGE",
		});

		expect(dataset.groupName).toBe("IELTS BRIDGE");
		expect(dataset.normalizedGroupName).toBe("ielts bridge");
		expect(dataset.sourceKey).toBe("ielts-bridge-vocabulary");
		expect(dataset.stats).toEqual({
			deckCount: 32,
			totalWords: 996,
			wordCount: 429,
			chunkCount: 567,
		});

		// Verify exact counts per (Week, Skill) matching sheet "Thống kê"
		const expectedCounts: Array<[number, string, number]> = [
			[1, "Reading", 40],
			[1, "Writing Task 2", 36],
			[1, "Speaking", 29],
			[1, "Listening", 12],
			[2, "Reading", 29],
			[2, "Writing Task 2", 34],
			[2, "Speaking", 29],
			[2, "Listening", 12],
			[3, "Reading", 41],
			[3, "Writing Task 2", 31],
			[3, "Speaking", 37],
			[3, "Listening", 12],
			[4, "Reading", 54],
			[4, "Writing Task 2", 36],
			[4, "Speaking", 31],
			[4, "Listening", 12],
			[5, "Reading", 42],
			[5, "Writing Task 2", 35],
			[5, "Speaking", 50],
			[5, "Listening", 12],
			[6, "Reading", 61],
			[6, "Writing Task 2", 30],
			[6, "Speaking", 33],
			[6, "Listening", 12],
			[7, "Reading", 19],
			[7, "Writing Task 2", 39],
			[7, "Speaking", 43],
			[7, "Listening", 12],
			[8, "Reading", 60],
			[8, "Writing Task 2", 43],
			[8, "Speaking", 18],
			[8, "Listening", 12],
		];

		expect(dataset.decks.map((d) => [d.week, d.skill, d.words.length])).toEqual(
			expectedCounts,
		);

		expect(dataset.decks[0]?.title).toBe("Week 01 – Reading");
		expect(dataset.decks[0]?.lessonNumber).toBeNull();
		expect(dataset.decks[0]?.topic).toBe("Reading · Reading Passages");
		expect(dataset.decks[1]?.title).toBe(
			"Week 01 – Writing Task 2: Studying Abroad",
		);
		expect(dataset.decks[31]?.title).toBe(
			"Week 08 – Listening: Friends · Alex's Training",
		);

		// Editorial notes must not leak into example; all IPA and translation present
		for (const deck of dataset.decks) {
			for (const w of deck.words) {
				expect(w.example).toBeNull();
				expect(w.pos).toBeNull();
				expect(w.ipa).toBeTruthy();
				expect(w.translation.length).toBeGreaterThan(0);
				expect(w.id).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
				);
			}
		}

		// Deterministic IDs across repeated parses
		const secondParse = await loadVocabImportDatasetFromXlsx({
			filePath: SAMPLE_XLSX_PATH,
			sheetName: "Tổng hợp",
			groupName: "IELTS BRIDGE",
		});
		expect(secondParse.decks.map((d) => d.id)).toEqual(
			dataset.decks.map((d) => d.id),
		);
	});

	it("fails closed on duplicate words within the same Week × Skill deck", () => {
		expect(() =>
			parseWeekSkillVocabSheet(
				[
					["Week", "Skill", "Topic", "Word / Phrase", "IPA", "Meaning (Nghĩa)"],
					[
						"1",
						"Reading",
						"Reading Passages",
						"detect",
						"/dɪˈtɛkt/",
						"phát hiện",
					],
					[
						"1",
						"Reading",
						"Reading Passages",
						"Detect",
						"/dɪˈtɛkt/",
						"phát hiện",
					],
				],
				{ groupName: "IELTS BRIDGE", sourceKey: "test" },
			),
		).toThrow(/duplicate word/i);
	});
});

describe("import-vocab DB plan, apply, idempotency, rollback, and safety gates", () => {
	it("imports all 32 decks / 996 words cleanly, is idempotent on re-run, preserves audio, and rolls back cleanly", async () => {
		const dir = await mkdtemp(join(tmpdir(), "import-vocab-test-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "test.db");
		const client = await createSeededTestDb(dbPath);
		const runner = createLibsqlVocabPromoteRunner(client);

		try {
			const dataset = await loadVocabImportDatasetFromXlsx({
				filePath: SAMPLE_XLSX_PATH,
				sheetName: "Tổng hợp",
				groupName: "IELTS BRIDGE",
			});

			// 1. Plan on empty org
			const { plan, reusedExistingGroup } = await buildImportVocabPlan(
				dataset,
				runner,
				{ targetOrgId: "org-teacher", nowMs: 1_750_000_000_000 },
			);
			expect(reusedExistingGroup).toBe(false);
			expect(plan.diff.group).toEqual({
				total: 1,
				toInsert: 1,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan.diff.deck).toEqual({
				total: 32,
				toInsert: 32,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan.diff.word).toEqual({
				total: 996,
				toInsert: 996,
				toUpdate: 0,
				unchanged: 0,
			});

			// 2. Apply & verify parity
			await applyPromoteVocabPlan(runner, plan);
			const verify = await verifyPromotedVocab(runner, plan);
			expect(verify.ok).toBe(true);
			expect(verify.counts).toEqual({
				group: { expected: 1, actual: 1 },
				deck: { expected: 32, actual: 32 },
				word: { expected: 996, actual: 996 },
			});

			// Verify snapshot display order (ORDER BY created_at ASC, id ASC) matches Week 1..8 order
			const orderedRows = await runner.queryRows(
				"SELECT title FROM vocab_deck WHERE org_id = ? ORDER BY created_at ASC, id ASC",
				["org-teacher"],
			);
			expect(orderedRows[0]?.title).toBe("Week 01 – Reading");
			expect(orderedRows[1]?.title).toBe(
				"Week 01 – Writing Task 2: Studying Abroad",
			);
			expect(orderedRows[31]?.title).toBe(
				"Week 08 – Listening: Friends · Alex's Training",
			);

			// 3. Teacher uploads audio to one word; re-run must preserve audioKey and report 0 updates
			const sampleWordId = dataset.decks[0]?.words[0]?.id ?? "";
			await client.execute({
				sql: "UPDATE vocab_word SET audio_key = ? WHERE id = ?",
				args: ["vocab/org-teacher/sample/audio.mp3", sampleWordId],
			});

			const second = await buildImportVocabPlan(dataset, runner, {
				targetOrgId: "org-teacher",
				nowMs: 1_750_001_000_000,
			});
			expect(second.reusedExistingGroup).toBe(true);
			expect(second.plan.diff.group).toEqual({
				total: 1,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 1,
			});
			expect(second.plan.diff.deck).toEqual({
				total: 32,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 32,
			});
			expect(second.plan.diff.word).toEqual({
				total: 996,
				toInsert: 0,
				toUpdate: 0,
				unchanged: 996,
			});
			const preservedWord = second.plan.targetWords.find(
				(w) => w.id === sampleWordId,
			);
			expect(preservedWord?.audioKey).toBe(
				"vocab/org-teacher/sample/audio.mp3",
			);

			// 4. Rollback statements from initial plan must restore empty state
			await runner.run(plan.rollbackStatements);
			const remainingGroups = await runner.queryRows(
				"SELECT COUNT(*) AS c FROM vocab_group",
			);
			const remainingDecks = await runner.queryRows(
				"SELECT COUNT(*) AS c FROM vocab_deck",
			);
			const remainingWords = await runner.queryRows(
				"SELECT COUNT(*) AS c FROM vocab_word",
			);
			expect(Number(remainingGroups[0]?.c)).toBe(0);
			expect(Number(remainingDecks[0]?.c)).toBe(0);
			expect(Number(remainingWords[0]?.c)).toBe(0);

			// Also ensure formatRollbackSql renders clean SQL
			const rollbackSql = formatRollbackSql(plan);
			expect(rollbackSql).toContain("DELETE FROM vocab_word WHERE id IN");
			expect(rollbackSql).toContain("DELETE FROM vocab_deck WHERE id IN");
			expect(rollbackSql).toContain("DELETE FROM vocab_group WHERE id IN");
		} finally {
			client.close();
		}
	});

	it("reuses pre-existing IELTS BRIDGE group created in UI and never touches unrelated decks on apply or rollback", async () => {
		const dir = await mkdtemp(join(tmpdir(), "import-vocab-reuse-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "test.db");
		const client = await createSeededTestDb(dbPath);
		const runner = createLibsqlVocabPromoteRunner(client);

		try {
			const preExistingGroupId = "ui-created-group-uuid-123";
			await client.execute({
				sql: "INSERT INTO vocab_group (id, org_id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				args: [
					preExistingGroupId,
					"org-teacher",
					"IELTS BRIDGE",
					"ielts bridge",
					1_740_000_000_000,
					1_740_000_000_000,
				],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, group_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, NULL, NULL, 'en', ?, ?)",
				args: [
					"unrelated-deck-1",
					"org-teacher",
					preExistingGroupId,
					"Custom Teacher Deck",
					1_740_000_000_000,
					1_740_000_000_000,
				],
			});

			const dataset = parseWeekSkillVocabSheet(
				[
					["Week", "Skill", "Topic", "Word / Phrase", "IPA", "Meaning (Nghĩa)"],
					[
						"1",
						"Reading",
						"Reading Passages",
						"detect",
						"/dɪˈtɛkt/",
						"phát hiện",
					],
				],
				{ groupName: "IELTS BRIDGE", sourceKey: "ielts-bridge-vocabulary" },
			);

			const { plan, reusedExistingGroup } = await buildImportVocabPlan(
				dataset,
				runner,
				{ targetOrgId: "org-teacher", nowMs: 1_750_000_000_000 },
			);
			expect(reusedExistingGroup).toBe(true);
			expect(plan.targetGroups[0]?.id).toBe(preExistingGroupId);
			expect(plan.targetDecks[0]?.groupId).toBe(preExistingGroupId);
			expect(plan.diff.group.unchanged).toBe(1);
			expect(plan.diff.deck.toInsert).toBe(1);

			await applyPromoteVocabPlan(runner, plan);
			const verify = await verifyPromotedVocab(runner, plan);
			expect(verify.ok).toBe(true);

			// Rollback must delete ONLY the newly imported deck/word, keeping pre-existing group and unrelated deck
			await runner.run(plan.rollbackStatements);
			const groupsAfter = await runner.queryRows(
				"SELECT id FROM vocab_group WHERE org_id = ?",
				["org-teacher"],
			);
			const decksAfter = await runner.queryRows(
				"SELECT id FROM vocab_deck WHERE org_id = ?",
				["org-teacher"],
			);
			expect(groupsAfter.map((r) => r.id)).toEqual([preExistingGroupId]);
			expect(decksAfter.map((r) => r.id)).toEqual(["unrelated-deck-1"]);
		} finally {
			client.close();
		}
	});

	it("fails closed on conflicting deck title in same group or class-bound deck", async () => {
		const dir = await mkdtemp(join(tmpdir(), "import-vocab-gates-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "test.db");
		const client = await createSeededTestDb(dbPath);
		const runner = createLibsqlVocabPromoteRunner(client);

		try {
			const groupId = "existing-group-1";
			await client.execute({
				sql: "INSERT INTO vocab_group (id, org_id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				args: [
					groupId,
					"org-teacher",
					"IELTS BRIDGE",
					"ielts bridge",
					1_740_000_000_000,
					1_740_000_000_000,
				],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, group_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, NULL, NULL, 'en', ?, ?)",
				args: [
					"manual-deck-random-id",
					"org-teacher",
					groupId,
					"Week 01 – Reading",
					1_740_000_000_000,
					1_740_000_000_000,
				],
			});

			const dataset = parseWeekSkillVocabSheet(
				[
					["Week", "Skill", "Topic", "Word / Phrase", "IPA", "Meaning (Nghĩa)"],
					[
						"1",
						"Reading",
						"Reading Passages",
						"detect",
						"/dɪˈtɛkt/",
						"phát hiện",
					],
				],
				{ groupName: "IELTS BRIDGE", sourceKey: "ielts-bridge-vocabulary" },
			);

			await expect(
				buildImportVocabPlan(dataset, runner, { targetOrgId: "org-teacher" }),
			).rejects.toThrow(
				/already exists in group "IELTS BRIDGE" under a different ID/,
			);

			// Also test class-bound deck gate
			await client.execute("DELETE FROM vocab_deck");
			await client.execute({
				sql: "INSERT INTO class (id, org_id, name) VALUES (?, ?, ?)",
				args: ["class-1", "org-teacher", "IELTS Bridge K1"],
			});
			const detDeckId =
				dataset.decks[0]?.id ?? deterministicVocabUuid("fallback");
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, group_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'en', ?, ?)",
				args: [
					detDeckId,
					"org-teacher",
					"class-1",
					groupId,
					"Week 01 – Reading",
					1_740_000_000_000,
					1_740_000_000_000,
				],
			});
			await expect(
				buildImportVocabPlan(dataset, runner, { targetOrgId: "org-teacher" }),
			).rejects.toThrow(/bound to a class/);
		} finally {
			client.close();
		}
	});
});

describe("import-vocab-prod CLI", () => {
	it("enforces --allow-prod and --confirm-prod prod when applying to D1 prod", () => {
		expect(() =>
			parseImportVocabArgs([
				"--d1",
				"--d1-stage",
				"prod",
				"--mode",
				"apply",
				"--input",
				SAMPLE_XLSX_PATH,
				"--group",
				"IELTS BRIDGE",
			]),
		).toThrow(/--allow-prod/);

		expect(() =>
			parseImportVocabArgs([
				"--d1",
				"--d1-stage",
				"prod",
				"--mode",
				"apply",
				"--allow-prod",
				"--confirm-prod",
				"wrong",
				"--input",
				SAMPLE_XLSX_PATH,
				"--group",
				"IELTS BRIDGE",
			]),
		).toThrow(/--confirm-prod prod/);
	});

	it("runs dry-run and apply via CLI against local SQLite with --public-logs redaction", async () => {
		const dir = await mkdtemp(join(tmpdir(), "import-vocab-cli-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "local.db");
		const dumpPrefix = join(dir, "backup");
		const client = await createSeededTestDb(dbPath);
		client.close();

		let dryLogs = "";
		await runImportVocabProdCli(
			[
				"--file",
				dbPath,
				"--mode",
				"dry-run",
				"--input",
				SAMPLE_XLSX_PATH,
				"--sheet",
				"Tổng hợp",
				"--group",
				"IELTS BRIDGE",
				"--public-logs",
			],
			{
				env: {
					TEACHER_EMAILS: "msthucmy@gmail.com",
					LEAD_ORG_ID: "org-lead",
				},
				writeStdout: (chunk) => {
					dryLogs += chunk;
				},
			},
		);

		expect(dryLogs).toContain("decks=32, words=996 (word=429, chunk=567)");
		expect(dryLogs).toContain("DRY-RUN complete");
		expect(dryLogs).not.toContain("org-teacher");
		expect(dryLogs).not.toContain("msthucmy@gmail.com");

		let applyLogs = "";
		await runImportVocabProdCli(
			[
				"--file",
				dbPath,
				"--mode",
				"apply",
				"--input",
				SAMPLE_XLSX_PATH,
				"--sheet",
				"Tổng hợp",
				"--group",
				"IELTS BRIDGE",
				"--dump",
				dumpPrefix,
				"--public-logs",
			],
			{
				env: {
					TEACHER_EMAILS: "msthucmy@gmail.com",
					LEAD_ORG_ID: "org-lead",
				},
				writeStdout: (chunk) => {
					applyLogs += chunk;
				},
			},
		);

		expect(applyLogs).toContain(
			"Verify parity: ok=true, groups=1/1, decks=32/32, words=996/996",
		);
		expect(applyLogs).not.toContain("org-teacher");
		const preimageRaw = await readFile(`${dumpPrefix}-preimage.json`, "utf8");
		expect(JSON.parse(preimageRaw).targetOrgId).toBe("org-teacher");
		const rollbackRaw = await readFile(`${dumpPrefix}-rollback.sql`, "utf8");
		expect(rollbackRaw).toContain("DELETE FROM vocab_word WHERE id IN");
	});
});
