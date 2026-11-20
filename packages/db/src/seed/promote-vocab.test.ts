import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	parsePromoteVocabArgs,
	runPromoteVocabProdCli,
	splitDelimitedList,
} from "../../scripts/promote-vocab-prod";
import * as schema from "../schema/index";
import {
	applyPromoteVocabPlan,
	auditStagingVocab,
	buildPromoteVocabPlan,
	createLibsqlVocabPromoteRunner,
	formatRollbackSql,
	formatStagingVocabAuditReport,
	loadSelectedStagingVocab,
	normalizeVocabLabel,
	remapVocabAudioKey,
	resolveMediaR2BucketName,
	resolveTargetTeacherOrgId,
	resolveVocabD1Database,
	syncVocabAudioToR2,
	verifyPromotedVocab,
} from "./promote-vocab";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

let templateDir = "";
let templateDbPath = "";

async function openMigratedDb(dbPath: string) {
	copyFileSync(templateDbPath, dbPath);
	const client = createClient({ url: `file:${dbPath}` });
	const db = drizzle(client, { schema });
	return { client, db };
}

describe("promote-vocab staging -> prod pipeline", () => {
	const tmpDirs: string[] = [];

	beforeAll(async () => {
		templateDir = mkdtempSync(join(tmpdir(), "promote-vocab-template-"));
		templateDbPath = join(templateDir, "template.sqlite");
		const client = createClient({ url: `file:${templateDbPath}` });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		} finally {
			client.close();
		}
	}, 30_000);

	afterAll(() => {
		if (templateDir) {
			rmSync(templateDir, { recursive: true, force: true });
		}
	});

	function makeTempDir(): string {
		const dir = mkdtempSync(join(tmpdir(), "promote-vocab-test-"));
		tmpDirs.push(dir);
		return dir;
	}

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("audits staging groups & bank decks, excludes class decks by default, and redacts IDs in publicLogs mode", async () => {
		const dir = makeTempDir();
		const stagingPath = join(dir, "staging.sqlite");
		const { client, db } = await openMigratedDb(stagingPath);
		try {
			await db.insert(schema.organization).values({
				id: "org-staging-1",
				name: "Staging Org",
			});
			await db.insert(schema.classTable).values({
				id: "cls-1",
				orgId: "org-staging-1",
				name: "GT1-A",
				type: "communication",
				level: "Level 1",
				mode: "Online",
				sessionsTotal: 20,
				tuitionFee: 1000000,
			});
			await db.insert(schema.vocabGroup).values([
				{
					id: "grp-gt1",
					orgId: "org-staging-1",
					name: "Giao tiếp Level 1",
					normalizedName: normalizeVocabLabel("Giao tiếp Level 1"),
				},
				{
					id: "grp-gt2",
					orgId: "org-staging-1",
					name: "Giao tiếp Level 2",
					normalizedName: normalizeVocabLabel("Giao tiếp Level 2"),
				},
			]);
			await db.insert(schema.vocabDeck).values([
				{
					id: "deck-gt1-1",
					orgId: "org-staging-1",
					classId: null,
					groupId: "grp-gt1",
					title: "Lesson 01 – Friends & Introductions",
					lessonNumber: 1,
					topic: "Friends",
					lang: "en",
				},
				{
					id: "deck-gt1-class-copy",
					orgId: "org-staging-1",
					classId: "cls-1",
					groupId: "grp-gt1",
					title: "Lesson 01 (Class Copy)",
					lessonNumber: 1,
					topic: "Friends",
					lang: "en",
				},
				{
					id: "deck-gt2-1",
					orgId: "org-staging-1",
					classId: null,
					groupId: "grp-gt2",
					title: "Lesson 01 – Daily Routines",
					lessonNumber: 1,
					topic: "Daily Life",
					lang: "en",
				},
				{
					id: "deck-ungrouped",
					orgId: "org-staging-1",
					classId: null,
					groupId: null,
					title: "Standalone Bonus",
					lang: "en",
				},
			]);
			await db.insert(schema.vocabWord).values([
				{
					id: "w-1",
					deckId: "deck-gt1-1",
					word: "introduce",
					entryType: "word",
					ipa: "/ˌɪntrəˈdjuːs/",
					pos: "v.",
					translation: "giới thiệu",
					example: "Can I introduce my friend?",
					audioKey: "vocab/org-staging-1/w-1/abc.mp3",
					sortOrder: 0,
				},
				{
					id: "w-2",
					deckId: "deck-gt2-1",
					word: "commute",
					entryType: "word",
					translation: "đi làm hàng ngày",
					sortOrder: 0,
				},
			]);

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditStagingVocab(runner);
			expect(audit.totalGroups).toBe(2);
			expect(audit.totalBankDecks).toBe(3);
			expect(audit.totalClassDecks).toBe(1);
			expect(audit.totalBankWords).toBe(2);
			expect(audit.totalBankAudioKeys).toBe(1);
			expect(audit.ungroupedBankDecks.map((d) => d.title)).toEqual([
				"Standalone Bonus",
			]);

			const publicReport = formatStagingVocabAuditReport(audit, {
				publicLogs: true,
			});
			expect(publicReport).toContain("Giao tiếp Level 1");
			expect(publicReport).toContain("Giao tiếp Level 2");
			expect(publicReport).not.toContain("grp-gt1");
			expect(publicReport).not.toContain("org-staging-1");
		} finally {
			client.close();
		}
	});

	it("promotes 2 groups end-to-end, verifies parity, supports idempotent re-run, preserves student cards, and executes exact rollback", async () => {
		const dir = makeTempDir();
		const stagingPath = join(dir, "staging.sqlite");
		const prodPath = join(dir, "prod.sqlite");
		const staging = await openMigratedDb(stagingPath);
		const prod = await openMigratedDb(prodPath);

		try {
			// Seed staging org + 2 target groups + 1 unrelated group + 1 class-bound deck
			await staging.db.insert(schema.organization).values({
				id: "org-stg",
				name: "Staging Org",
			});
			await staging.db.insert(schema.classTable).values({
				id: "cls-stg",
				orgId: "org-stg",
				name: "Staging Class",
				type: "communication",
				level: "L1",
				mode: "Online",
				sessionsTotal: 10,
				tuitionFee: 500000,
			});
			await staging.db.insert(schema.vocabGroup).values([
				{
					id: "grp-1",
					orgId: "org-stg",
					name: "Giao tiếp Level 1",
					normalizedName: normalizeVocabLabel("Giao tiếp Level 1"),
				},
				{
					id: "grp-2",
					orgId: "org-stg",
					name: "Giao tiếp Level 2",
					normalizedName: normalizeVocabLabel("Giao tiếp Level 2"),
				},
				{
					id: "grp-other",
					orgId: "org-stg",
					name: "IELTS Speaking",
					normalizedName: normalizeVocabLabel("IELTS Speaking"),
				},
			]);
			await staging.db.insert(schema.vocabDeck).values([
				{
					id: "deck-1",
					orgId: "org-stg",
					classId: null,
					groupId: "grp-1",
					title: "Lesson 01 – Greetings",
					lessonNumber: 1,
					topic: "Greetings",
					lang: "en",
				},
				{
					id: "deck-1-cls",
					orgId: "org-stg",
					classId: "cls-stg",
					groupId: "grp-1",
					title: "Class Copy Should Not Migrate",
					lang: "en",
				},
				{
					id: "deck-2",
					orgId: "org-stg",
					classId: null,
					groupId: "grp-2",
					title: "Lesson 01 – Workplace",
					lessonNumber: 1,
					topic: "Work",
					lang: "en",
					sourceDeckId: "deck-1",
				},
				{
					id: "deck-other",
					orgId: "org-stg",
					classId: null,
					groupId: "grp-other",
					title: "Unrelated IELTS Deck",
					lang: "en",
				},
			]);
			await staging.db.insert(schema.vocabWord).values([
				{
					id: "word-1",
					deckId: "deck-1",
					word: "introduce",
					entryType: "word",
					ipa: "/ˌɪntrəˈdjuːs/",
					pos: "v.",
					translation: "giới thiệu",
					example: "Let me introduce myself.",
					audioKey: "vocab/org-stg/word-1/u1.mp3",
					sortOrder: 0,
				},
				{
					id: "word-2",
					deckId: "deck-1",
					word: "stay in touch",
					entryType: "chunk",
					translation: "giữ liên lạc",
					sortOrder: 1,
				},
				{
					id: "word-3",
					deckId: "deck-2",
					word: "deadline",
					entryType: "word",
					ipa: "/ˈdedlaɪn/",
					pos: "n.",
					translation: "hạn chót",
					sortOrder: 0,
				},
				{
					id: "word-other",
					deckId: "deck-other",
					word: "ubiquitous",
					entryType: "word",
					translation: "phổ biến",
					sortOrder: 0,
				},
			]);

			// Seed production org + unrelated prod deck + student vocab_card
			await prod.db.insert(schema.organization).values({
				id: "org-prod",
				name: "Cô Mỹ Prod Org",
			});
			await prod.db.insert(schema.student).values({
				id: "stu-prod-1",
				orgId: "org-prod",
				name: "Học viên A",
			});
			await prod.db.insert(schema.vocabDeck).values({
				id: "deck-prod-existing",
				orgId: "org-prod",
				classId: null,
				title: "Prod Existing Deck",
				lang: "en",
			});
			await prod.db.insert(schema.vocabWord).values({
				id: "word-prod-existing",
				deckId: "deck-prod-existing",
				word: "hello",
				entryType: "word",
				translation: "xin chào",
				sortOrder: 0,
			});
			await prod.db.insert(schema.vocabCard).values({
				id: "card-prod-1",
				studentId: "stu-prod-1",
				wordId: "word-prod-existing",
				level: 3,
				state: "review",
				dueAt: 1_700_000_000_000,
			});

			const stgRunner = createLibsqlVocabPromoteRunner(staging.client);
			const prodRunner = createLibsqlVocabPromoteRunner(prod.client);

			// 1. Select by Vietnamese case-insensitive group names
			const selected = await loadSelectedStagingVocab(stgRunner, {
				groupNames: ["giao tiếp level 1", "GIAO TIẾP LEVEL 2"],
			});
			expect(selected.groups.map((g) => g.id)).toEqual(["grp-1", "grp-2"]);
			expect(selected.decks.map((d) => d.id)).toEqual(["deck-1", "deck-2"]);
			expect(selected.words.map((w) => w.id)).toEqual([
				"word-1",
				"word-2",
				"word-3",
			]);

			// 2. Build plan & check diff + remapped audio key
			const plan1 = await buildPromoteVocabPlan(selected, prodRunner, {
				targetOrgId: "org-prod",
				nowMs: 1_800_000_000_000,
			});
			expect(plan1.diff.group).toEqual({
				total: 2,
				toInsert: 2,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan1.diff.deck).toEqual({
				total: 2,
				toInsert: 2,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan1.diff.word).toEqual({
				total: 3,
				toInsert: 3,
				toUpdate: 0,
				unchanged: 0,
			});
			expect(plan1.audioTransfers).toEqual([
				{
					wordId: "word-1",
					sourceKey: "vocab/org-stg/word-1/u1.mp3",
					targetKey: "vocab/org-prod/word-1/u1.mp3",
				},
			]);

			// 3. Apply & verify parity
			await applyPromoteVocabPlan(prodRunner, plan1);
			await expect(applyPromoteVocabPlan(prodRunner, plan1)).rejects.toThrow(
				/already been applied/i,
			);
			const verify1 = await verifyPromotedVocab(prodRunner, plan1);
			expect(verify1.ok).toBe(true);
			expect(verify1.counts).toEqual({
				group: { expected: 2, actual: 2 },
				deck: { expected: 2, actual: 2 },
				word: { expected: 3, actual: 3 },
			});

			// Unrelated prod data & student card remain completely untouched
			const prodCards = await prodRunner.queryRows("SELECT id FROM vocab_card");
			expect(prodCards).toHaveLength(1);
			const allProdDecks = await prodRunner.queryRows(
				"SELECT id FROM vocab_deck ORDER BY id ASC",
			);
			expect(allProdDecks.map((r) => r.id)).toEqual([
				"deck-1",
				"deck-2",
				"deck-prod-existing",
			]);

			// 4. Idempotent re-run reports unchanged = all
			const plan2 = await buildPromoteVocabPlan(selected, prodRunner, {
				targetOrgId: "org-prod",
				nowMs: 1_800_000_001_000,
			});
			expect(plan2.diff.group.unchanged).toBe(2);
			expect(plan2.diff.deck.unchanged).toBe(2);
			expect(plan2.diff.word.unchanged).toBe(3);

			// 5. Update staging word + add new word -> apply -> then execute rollbackStatements to restore exact prior state
			await staging.client.execute({
				sql: "UPDATE vocab_word SET translation = ? WHERE id = ?",
				args: ["giới thiệu (cập nhật)", "word-1"],
			});
			await staging.db.insert(schema.vocabWord).values({
				id: "word-4-new",
				deckId: "deck-2",
				word: "schedule",
				entryType: "word",
				translation: "lịch trình",
				sortOrder: 1,
			});

			const selectedUpdated = await loadSelectedStagingVocab(stgRunner, {
				groupNames: ["Giao tiếp Level 1", "Giao tiếp Level 2"],
			});
			const plan3 = await buildPromoteVocabPlan(selectedUpdated, prodRunner, {
				targetOrgId: "org-prod",
				nowMs: 1_800_000_002_000,
			});
			expect(plan3.diff.word).toEqual({
				total: 4,
				toInsert: 1,
				toUpdate: 1,
				unchanged: 2,
			});
			expect(formatRollbackSql(plan3)).toContain("DELETE FROM vocab_word");
			expect(formatRollbackSql(plan3)).toContain("UPDATE vocab_word SET");

			await applyPromoteVocabPlan(prodRunner, plan3);
			const verify3 = await verifyPromotedVocab(prodRunner, plan3);
			expect(verify3.ok).toBe(true);

			// Execute rollback statements from plan3 -> restores word-1 & removes word-4-new
			await prodRunner.run(plan3.rollbackStatements);
			const afterRollbackWords = await prodRunner.queryRows(
				"SELECT id, translation FROM vocab_word WHERE deck_id IN ('deck-1', 'deck-2') ORDER BY id ASC",
			);
			expect(afterRollbackWords).toEqual([
				{ id: "word-1", translation: "giới thiệu" },
				{ id: "word-2", translation: "giữ liên lạc" },
				{ id: "word-3", translation: "hạn chót" },
			]);

			// Execute rollback from plan1 -> removes all promoted groups/decks/words, keeping prod existing data intact
			await prodRunner.run(plan1.rollbackStatements);
			const remainingDecks = await prodRunner.queryRows(
				"SELECT id FROM vocab_deck ORDER BY id ASC",
			);
			expect(remainingDecks.map((r) => r.id)).toEqual(["deck-prod-existing"]);
			const remainingGroups = await prodRunner.queryRows(
				"SELECT id FROM vocab_group",
			);
			expect(remainingGroups).toHaveLength(0);
		} finally {
			staging.client.close();
			prod.client.close();
		}
	});

	it("fails closed on group name collision, cross-org ID collision, class-bound deck collision, and missing target org", async () => {
		const dir = makeTempDir();
		const stagingPath = join(dir, "staging.sqlite");
		const prodPath = join(dir, "prod.sqlite");
		const staging = await openMigratedDb(stagingPath);
		const prod = await openMigratedDb(prodPath);

		try {
			await staging.db.insert(schema.organization).values({
				id: "org-stg",
				name: "Staging",
			});
			await staging.db.insert(schema.vocabGroup).values({
				id: "grp-1",
				orgId: "org-stg",
				name: "Giao tiếp Level 1",
				normalizedName: normalizeVocabLabel("Giao tiếp Level 1"),
			});
			await staging.db.insert(schema.vocabDeck).values({
				id: "deck-1",
				orgId: "org-stg",
				classId: null,
				groupId: "grp-1",
				title: "Lesson 1",
				lang: "en",
			});

			const stgRunner = createLibsqlVocabPromoteRunner(staging.client);
			const prodRunner = createLibsqlVocabPromoteRunner(prod.client);
			const selected = await loadSelectedStagingVocab(stgRunner, {
				groupNames: ["Giao tiếp Level 1"],
			});

			// 1. Missing target org
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-missing",
				}),
			).rejects.toThrow(/does not exist in production/i);

			// 2. Group normalized_name collision with a different ID in target org
			await prod.db.insert(schema.organization).values([
				{ id: "org-prod", name: "Prod" },
				{ id: "org-other", name: "Other" },
			]);
			await prod.db.insert(schema.vocabGroup).values({
				id: "grp-different-id",
				orgId: "org-prod",
				name: "GIAO TIẾP LEVEL 1",
				normalizedName: normalizeVocabLabel("GIAO TIẾP LEVEL 1"),
			});
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-prod",
				}),
			).rejects.toThrow(/already exists in target production organization/i);

			// Remove name conflict, test cross-org group ID collision
			await prod.client.execute("DELETE FROM vocab_group");
			await prod.db.insert(schema.vocabGroup).values({
				id: "grp-1",
				orgId: "org-other",
				name: "Other Org Group",
				normalizedName: "other org group",
			});
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-prod",
				}),
			).rejects.toThrow(/under a different organization/i);

			// Remove group conflict, test class-bound deck collision
			await prod.client.execute("DELETE FROM vocab_group");
			await prod.db.insert(schema.classTable).values({
				id: "cls-prod",
				orgId: "org-prod",
				name: "Active Class",
				type: "communication",
				level: "L1",
				mode: "Online",
				sessionsTotal: 12,
				tuitionFee: 1000000,
			});
			await prod.db.insert(schema.vocabDeck).values({
				id: "deck-1",
				orgId: "org-prod",
				classId: "cls-prod",
				title: "Existing Class Deck",
				lang: "en",
			});
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-prod",
				}),
			).rejects.toThrow(/bound to a class/i);
		} finally {
			staging.client.close();
			prod.client.close();
		}
	});

	it("runs CLI end-to-end on local SQLite files and writes preimage JSON + rollback SQL", async () => {
		const dir = makeTempDir();
		const stagingPath = join(dir, "staging.sqlite");
		const prodPath = join(dir, "prod.sqlite");
		const dumpPrefix = join(dir, "backup", "vocab-promote");
		const staging = await openMigratedDb(stagingPath);
		const prod = await openMigratedDb(prodPath);

		try {
			await staging.db
				.insert(schema.organization)
				.values({ id: "org-stg", name: "Stg" });
			await staging.db.insert(schema.vocabGroup).values({
				id: "grp-1",
				orgId: "org-stg",
				name: "Giao tiếp Level 1",
				normalizedName: normalizeVocabLabel("Giao tiếp Level 1"),
			});
			await staging.db.insert(schema.vocabDeck).values({
				id: "deck-1",
				orgId: "org-stg",
				classId: null,
				groupId: "grp-1",
				title: "Lesson 1",
				lang: "en",
			});
			await staging.db.insert(schema.vocabWord).values({
				id: "w-1",
				deckId: "deck-1",
				word: "hello",
				entryType: "word",
				translation: "xin chào",
				sortOrder: 0,
			});
			await prod.db
				.insert(schema.organization)
				.values({ id: "org-prod", name: "Prod" });
		} finally {
			staging.client.close();
			prod.client.close();
		}

		const logs: string[] = [];
		await runPromoteVocabProdCli(
			[
				"--staging-file",
				stagingPath,
				"--prod-file",
				prodPath,
				"--mode",
				"apply",
				"--group",
				"Giao tiếp Level 1",
				"--target-org-id",
				"org-prod",
				"--dump",
				dumpPrefix,
			],
			{ writeStdout: (s) => logs.push(s) },
		);

		const joined = logs.join("");
		expect(joined).toContain("Verify parity: ok=true");
		expect(existsSync(`${dumpPrefix}-preimage.json`)).toBe(true);
		expect(existsSync(`${dumpPrefix}-rollback.sql`)).toBe(true);
		const rollbackText = readFileSync(`${dumpPrefix}-rollback.sql`, "utf8");
		expect(rollbackText).toContain(
			"DELETE FROM vocab_word WHERE id IN ('w-1')",
		);
		expect(rollbackText).toContain(
			"DELETE FROM vocab_deck WHERE id IN ('deck-1')",
		);
		expect(rollbackText).toContain(
			"DELETE FROM vocab_group WHERE id IN ('grp-1')",
		);
	});

	it("enforces CLI safety gates for --d1 apply and parses delimited lists", () => {
		expect(
			splitDelimitedList("Giao tiếp Level 1; Giao tiếp Level 2\n  "),
		).toEqual(["Giao tiếp Level 1", "Giao tiếp Level 2"]);

		expect(() =>
			parsePromoteVocabArgs([
				"--d1",
				"--mode",
				"apply",
				"--group",
				"Giao tiếp Level 1",
			]),
		).toThrow(/requires --allow-prod/i);

		expect(() =>
			parsePromoteVocabArgs([
				"--d1",
				"--mode",
				"apply",
				"--allow-prod",
				"--confirm-prod",
				"staging",
				"--group",
				"Giao tiếp Level 1",
			]),
		).toThrow(/requires --confirm-prod prod/i);

		const valid = parsePromoteVocabArgs([
			"--d1",
			"--mode",
			"apply",
			"--allow-prod",
			"--confirm-prod",
			"prod",
			"--group-names",
			"Giao tiếp Level 1; Giao tiếp Level 2",
			"--public-logs",
		]);
		expect(valid.groupNames).toEqual([
			"Giao tiếp Level 1",
			"Giao tiếp Level 2",
		]);
		expect(valid.publicLogs).toBe(true);
	});

	it("remaps vocab audio keys and syncs missing R2 audio objects from staging to prod", async () => {
		expect(
			remapVocabAudioKey("vocab/org-stg/word-1/uuid-1", "org-stg", "org-prod"),
		).toBe("vocab/org-prod/word-1/uuid-1");
		expect(remapVocabAudioKey(null, "org-stg", "org-prod")).toBeNull();

		const prodObjects = new Map<string, { bytes: Uint8Array; ct: string }>();
		const stagingObjects = new Map<string, { bytes: Uint8Array; ct: string }>([
			[
				"vocab/org-stg/w-1/u1",
				{ bytes: new Uint8Array([1, 2, 3, 4]), ct: "audio/mp4" },
			],
		]);

		const fetchMock: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			const matchBucketList = url.pathname.match(/\/r2\/buckets$/);
			if (matchBucketList) {
				const contains = url.searchParams.get("name_contains") ?? "";
				const bucketName = contains.includes("staging")
					? "teacher-os-media-staging-abcdefghijklmnop"
					: "teacher-os-media-prod-abcdefghijklmnop";
				return new Response(
					JSON.stringify({
						success: true,
						result: { buckets: [{ name: bucketName }] },
					}),
					{ status: 200 },
				);
			}

			const objListMatch = url.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects$/,
			);
			if (objListMatch && method === "GET") {
				const bucket = decodeURIComponent(objListMatch[1] ?? "");
				const prefix = url.searchParams.get("prefix") ?? "";
				const store = bucket.includes("staging") ? stagingObjects : prodObjects;
				const entry = store.get(prefix);
				return new Response(
					JSON.stringify({
						success: true,
						result: entry
							? [{ key: prefix, size: entry.bytes.byteLength }]
							: [],
					}),
					{ status: 200 },
				);
			}

			const objMatch = url.pathname.match(
				/\/r2\/buckets\/([^/]+)\/objects\/(.+)$/,
			);
			if (objMatch) {
				const bucket = decodeURIComponent(objMatch[1] ?? "");
				const key = (objMatch[2] ?? "")
					.split("/")
					.map((s) => decodeURIComponent(s))
					.join("/");
				const store = bucket.includes("staging") ? stagingObjects : prodObjects;
				if (method === "GET") {
					const entry = store.get(key);
					if (!entry) return new Response("not found", { status: 404 });
					return new Response(Buffer.from(entry.bytes), {
						status: 200,
						headers: { "content-type": entry.ct },
					});
				}
				if (method === "PUT") {
					const bodyBytes = new Uint8Array(
						await new Response(init?.body).arrayBuffer(),
					);
					const ct =
						(init?.headers as Record<string, string>)?.["content-type"] ??
						"audio/mpeg";
					store.set(key, { bytes: bodyBytes, ct });
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
					});
				}
			}

			return new Response("unexpected", { status: 404 });
		};

		const stgBucket = await resolveMediaR2BucketName({
			stage: "staging",
			accountId: "acc-1",
			apiToken: "tok-1",
			fetchImpl: fetchMock,
		});
		const prodBucket = await resolveMediaR2BucketName({
			stage: "prod",
			accountId: "acc-1",
			apiToken: "tok-1",
			fetchImpl: fetchMock,
		});
		expect(stgBucket).toBe("teacher-os-media-staging-abcdefghijklmnop");
		expect(prodBucket).toBe("teacher-os-media-prod-abcdefghijklmnop");

		const syncRes = await syncVocabAudioToR2({
			accountId: "acc-1",
			apiToken: "tok-1",
			sourceBucket: stgBucket,
			targetBucket: prodBucket,
			transfers: [
				{
					wordId: "w-1",
					sourceKey: "vocab/org-stg/w-1/u1",
					targetKey: "vocab/org-prod/w-1/u1",
				},
			],
			fetchImpl: fetchMock,
		});
		expect(syncRes).toEqual({
			total: 1,
			existing: 0,
			copied: 1,
			missingOnSource: 0,
			missingOnTarget: 0,
			verified: 1,
		});
		expect(prodObjects.get("vocab/org-prod/w-1/u1")?.ct).toBe("audio/mp4");
	});

	it("resolves staging and prod D1 databases fail-closed and blocks stage mismatches", async () => {
		const stgUuid = "11111111-1111-1111-1111-111111111111";
		const prodUuid = "22222222-2222-2222-2222-222222222222";
		const fetchMock: typeof fetch = async (input) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("/d1/database")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: [
							{
								uuid: stgUuid,
								name: "teacher-os-database-staging-abcdefghijklmnop",
							},
							{
								uuid: prodUuid,
								name: "teacher-os-database-prod-abcdefghijklmnop",
							},
						],
						result_info: { total_pages: 1 },
					}),
					{ status: 200 },
				);
			}
			if (url.pathname.endsWith(`/d1/database/${stgUuid}`)) {
				return new Response(
					JSON.stringify({
						success: true,
						result: {
							uuid: stgUuid,
							name: "teacher-os-database-staging-abcdefghijklmnop",
						},
					}),
					{ status: 200 },
				);
			}
			if (url.pathname.endsWith("/query")) {
				return new Response(
					JSON.stringify({
						success: true,
						result: [
							{
								success: true,
								results: [
									{ name: "organization" },
									{ name: "vocab_group" },
									{ name: "vocab_deck" },
									{ name: "vocab_word" },
								],
							},
						],
					}),
					{ status: 200 },
				);
			}
			return new Response("not found", { status: 404 });
		};

		const stg = await resolveVocabD1Database({
			stage: "staging",
			accountId: "acc",
			apiToken: "tok",
			fetchImpl: fetchMock,
		});
		expect(stg.id).toBe(stgUuid);

		const prod = await resolveVocabD1Database({
			stage: "prod",
			accountId: "acc",
			apiToken: "tok",
			fetchImpl: fetchMock,
		});
		expect(prod.id).toBe(prodUuid);

		// Explicit staging UUID passed for prod stage must fail closed
		await expect(
			resolveVocabD1Database({
				stage: "prod",
				accountId: "acc",
				apiToken: "tok",
				explicitDatabaseId: stgUuid,
				fetchImpl: fetchMock,
			}),
		).rejects.toThrow(/Refusing staging-like D1 database/i);
	});

	it("resolves active teacher org via TEACHER_EMAILS over LEAD_ORG_ID and relocates misplaced rows cleanly with exact rollback", async () => {
		const dir = makeTempDir();
		const stagingPath = join(dir, "staging.sqlite");
		const prodPath = join(dir, "prod.sqlite");
		const staging = await openMigratedDb(stagingPath);
		const prod = await openMigratedDb(prodPath);

		try {
			await staging.db
				.insert(schema.organization)
				.values({ id: "org-stg", name: "Stg" });
			await staging.db.insert(schema.vocabGroup).values({
				id: "grp-ce1",
				orgId: "org-stg",
				name: "Communication English Level 1",
				normalizedName: normalizeVocabLabel("Communication English Level 1"),
			});
			await staging.db.insert(schema.vocabDeck).values({
				id: "deck-ce1-1",
				orgId: "org-stg",
				classId: null,
				groupId: "grp-ce1",
				title: "Lesson 01 – Friends",
				lessonNumber: 1,
				lang: "en",
			});
			await staging.db.insert(schema.vocabWord).values({
				id: "word-ce1-1",
				deckId: "deck-ce1-1",
				word: "introduce",
				entryType: "word",
				translation: "giới thiệu",
				sortOrder: 0,
			});

			// Prod has an older lead org (where rows were initially promoted) AND the active teacher's real org
			await prod.db.insert(schema.organization).values([
				{ id: "org-lead-old", name: "Old QA Lead Org" },
				{ id: "org-teacher-real", name: "Ms My Active Org" },
				{ id: "org-third-party", name: "Unrelated Org" },
			]);
			await prod.db.insert(schema.user).values([
				{
					id: "u-teacher",
					name: "Ms My",
					email: "msthucmy@gmail.com",
					emailVerified: true,
					role: "teacher",
				},
				{
					id: "u-student",
					name: "Student Same Email",
					email: "student@example.com",
					emailVerified: true,
					role: "student",
				},
			]);
			await prod.db.insert(schema.membership).values([
				{
					id: "mem-1",
					orgId: "org-teacher-real",
					userId: "u-teacher",
					role: "teacher",
				},
				{
					id: "mem-2",
					orgId: "org-third-party",
					userId: "u-student",
					role: "teacher",
				},
			]);

			const prodRunner = createLibsqlVocabPromoteRunner(prod.client);
			const stgRunner = createLibsqlVocabPromoteRunner(staging.client);

			// 1. resolveTargetTeacherOrgId prefers active teacher membership over LEAD_ORG_ID
			const resolved = await resolveTargetTeacherOrgId(prodRunner, {
				teacherEmails: "msthucmy@gmail.com",
				leadOrgId: "org-lead-old",
			});
			expect(resolved).toEqual({
				orgId: "org-teacher-real",
				resolvedVia: "teacher_emails",
				sameAsLeadOrg: false,
			});

			// Student user role is ignored even if email passed -> falls back to LEAD_ORG_ID
			const fallback = await resolveTargetTeacherOrgId(prodRunner, {
				teacherEmails: "student@example.com",
				leadOrgId: "org-lead-old",
			});
			expect(fallback).toEqual({
				orgId: "org-lead-old",
				resolvedVia: "lead_org_fallback",
				sameAsLeadOrg: true,
			});

			// 2. First apply into org-lead-old (simulating previous misplaced run)
			const selected = await loadSelectedStagingVocab(stgRunner, {
				groupNames: ["Communication English Level 1"],
			});
			const initialPlan = await buildPromoteVocabPlan(selected, prodRunner, {
				targetOrgId: "org-lead-old",
			});
			await applyPromoteVocabPlan(prodRunner, initialPlan);

			// Without relocateFromOrgId, promoting into org-teacher-real fails closed
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-teacher-real",
				}),
			).rejects.toThrow(/under a different organization/i);

			// Relocating from the wrong org (org-third-party) still fails closed
			await expect(
				buildPromoteVocabPlan(selected, prodRunner, {
					targetOrgId: "org-teacher-real",
					relocateFromOrgId: "org-third-party",
				}),
			).rejects.toThrow(/under a different organization/i);

			// 3. Relocating from org-lead-old -> org-teacher-real via CLI with empty TARGET_ORG_ID=""
			const logs: string[] = [];
			await runPromoteVocabProdCli(
				[
					"--staging-file",
					stagingPath,
					"--prod-file",
					prodPath,
					"--mode",
					"apply",
					"--group",
					"Communication English Level 1",
					"--relocate-from-org",
					"org-lead-old",
					"--dump",
					join(dir, "relocate-backup"),
					"--public-logs",
				],
				{
					env: {
						TARGET_ORG_ID: "",
						TEACHER_EMAILS: "msthucmy@gmail.com",
						LEAD_ORG_ID: "org-lead-old",
					},
					writeStdout: (s) => logs.push(s),
				},
			);
			const out = logs.join("");
			expect(out).toContain("resolved via=teacher_emails, sameAsLeadOrg=false");
			expect(out).toContain("Verify parity: ok=true");
			expect(out).not.toContain("org-teacher-real");
			expect(out).not.toContain("msthucmy@gmail.com");

			// Verify DB rows now belong to org-teacher-real, and org-lead-old has 0 groups/decks
			const groupsAfter = await prodRunner.queryRows(
				"SELECT id, org_id FROM vocab_group",
			);
			expect(groupsAfter).toEqual([
				{ id: "grp-ce1", org_id: "org-teacher-real" },
			]);
			const decksAfter = await prodRunner.queryRows(
				"SELECT id, org_id FROM vocab_deck",
			);
			expect(decksAfter).toEqual([
				{ id: "deck-ce1-1", org_id: "org-teacher-real" },
			]);

			// Rollback SQL restores org_id back to org-lead-old
			const rollbackSql = readFileSync(
				join(dir, "relocate-backup-rollback.sql"),
				"utf8",
			);
			expect(rollbackSql).toContain(
				"UPDATE vocab_group SET org_id = 'org-lead-old'",
			);
			expect(rollbackSql).toContain(
				"UPDATE vocab_deck SET org_id = 'org-lead-old'",
			);
		} finally {
			staging.client.close();
			prod.client.close();
		}
	});
});
