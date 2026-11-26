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
	DEFAULT_DEDUP_GROUP_NAME,
	parseDedupVocabArgs,
	runDedupVocabGroupCli,
} from "../../scripts/dedup-vocab-group-prod";
import * as schema from "../schema/index";
import { normalizeVocabLabel } from "../seed/promote-vocab";
import {
	applyDedupVocabGroupPlan,
	auditDedupVocabGroup,
	buildDedupVocabGroupPlan,
	createLibsqlVocabPromoteRunner,
	formatDedupAuditReport,
	formatDedupRollbackSql,
	normalizeDeckTitleForDedup,
	verifyDedupVocabGroup,
} from "./dedup-vocab-group";

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

describe("dedup-vocab-group pipeline", () => {
	const tmpDirs: string[] = [];

	beforeAll(async () => {
		templateDir = mkdtempSync(join(tmpdir(), "dedup-vocab-template-"));
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
		const dir = mkdtempSync(join(tmpdir(), "dedup-vocab-test-"));
		tmpDirs.push(dir);
		return dir;
	}

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	async function seedBaseOrgAndGroup(db: ReturnType<typeof drizzle>) {
		await db.insert(schema.organization).values({
			id: "org-prod-1",
			name: "Ms My English",
		});
		await db.insert(schema.user).values({
			id: "usr-teacher-1",
			name: "Teacher My",
			email: "teacher@msmy.io.vn",
			emailVerified: true,
			role: "teacher",
		});
		await db.insert(schema.membership).values({
			id: "mem-1",
			userId: "usr-teacher-1",
			orgId: "org-prod-1",
			role: "owner",
		});
		await db.insert(schema.classTable).values({
			id: "cls-comm2-a",
			orgId: "org-prod-1",
			name: "Comm 2A",
			type: "communication",
			level: "Level 2",
			mode: "Online",
			sessionsTotal: 23,
			tuitionFee: 2000000,
		});
		await db.insert(schema.student).values({
			id: "stu-1",
			orgId: "org-prod-1",
			name: "Nguyen Van A",
		});
		await db.insert(schema.vocabGroup).values([
			{
				id: "grp-comm-1",
				orgId: "org-prod-1",
				name: "Communication English Level 1",
				normalizedName: normalizeVocabLabel("Communication English Level 1"),
			},
			{
				id: "grp-comm-2",
				orgId: "org-prod-1",
				name: "Communication English Level 2",
				normalizedName: normalizeVocabLabel("Communication English Level 2"),
			},
		]);
	}

	it("removes identical duplicate bank decks while keeping earliest original, class decks, other groups, and review logs, and supports exact rollback", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "prod.sqlite");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);

			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);
			const t3 = new Date(1_700_000_003_000);

			await db.insert(schema.vocabDeck).values([
				// Group 2 — original Lesson 01
				{
					id: "deck-l1-orig",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					topic: "Home & Accommodation",
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				// Group 2 — duplicate Lesson 01 (extra spaces & casing difference)
				{
					id: "deck-l1-dup-1",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "  lesson 01  –  Home & Accommodation ",
					lessonNumber: 1,
					topic: "Home & Accommodation",
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
				// Group 2 — second duplicate Lesson 01 (lessonNumber null)
				{
					id: "deck-l1-dup-2",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: null,
					topic: null,
					lang: "en",
					createdAt: t3,
					updatedAt: t3,
				},
				// Group 2 — unique Lesson 02 (untouched)
				{
					id: "deck-l2-only",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 02 – Home & Hometown",
					lessonNumber: 2,
					topic: "Home & Hometown",
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				// Group 2 — class deck cloned from deck-l1-dup-1 (must NOT be deleted; source_deck_id repointed)
				{
					id: "deck-l1-class-copy",
					orgId: "org-prod-1",
					classId: "cls-comm2-a",
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					topic: "Home & Accommodation",
					lang: "en",
					sourceDeckId: "deck-l1-dup-1",
					createdAt: t3,
					updatedAt: t3,
				},
				// Group 1 — duplicate inside Level 1 (out of scope, must remain untouched)
				{
					id: "deck-g1-a",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-1",
					title: "Lesson 01 – Friends & Introductions",
					lessonNumber: 1,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				{
					id: "deck-g1-b",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-1",
					title: "Lesson 01 – Friends & Introductions",
					lessonNumber: 1,
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
			]);

			// Words with '?' and single quotes to test rollback SQL literal escaping
			const l1Words = [
				{
					word: "apartment",
					entryType: "word" as const,
					ipa: "/əˈpɑːrtmənt/",
					pos: "n.",
					translation: "căn hộ",
					example: "Isn't this a cozy apartment?",
					sortOrder: 0,
				},
				{
					word: "move in",
					entryType: "chunk" as const,
					ipa: "/muːv ɪn/",
					pos: "phr.v.",
					translation: "chuyển vào ở",
					example: "When did you move in?",
					sortOrder: 1,
				},
			];

			await db.insert(schema.vocabWord).values([
				...l1Words.map((w, idx) => ({
					id: `w-orig-${idx}`,
					deckId: "deck-l1-orig",
					...w,
				})),
				...l1Words.map((w, idx) => ({
					id: `w-dup1-${idx}`,
					deckId: "deck-l1-dup-1",
					...w,
					// Reverse sort_order on dup1 to prove order-independent word signature match
					sortOrder: 1 - idx,
				})),
				...l1Words.map((w, idx) => ({
					id: `w-dup2-${idx}`,
					deckId: "deck-l1-dup-2",
					...w,
				})),
				{
					id: "w-l2-0",
					deckId: "deck-l2-only",
					word: "hometown",
					entryType: "word",
					translation: "quê hương",
					sortOrder: 0,
				},
				{
					id: "w-cls-0",
					deckId: "deck-l1-class-copy",
					word: "apartment",
					entryType: "word",
					translation: "căn hộ",
					sortOrder: 0,
				},
			]);

			// Historical review log referencing a deleted duplicate deck must survive
			await db.insert(schema.vocabReviewLog).values({
				id: "rlog-1",
				studentId: "stu-1",
				cardId: "old-card-1",
				deckId: "deck-l1-dup-1",
				sessionKind: "learn",
				grade: "good",
				durationMs: 1200,
				word: "apartment",
				translation: "căn hộ",
			});

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
				nowMs: 1_700_000_010_000,
			});

			expect(audit.totalBankDecks).toBe(4);
			expect(audit.totalClassDecks).toBe(1);
			expect(audit.summary.duplicateClusters).toBe(1);
			expect(audit.summary.deletableDecks).toBe(2);
			expect(audit.summary.deletableWords).toBe(4);
			expect(audit.summary.skippedDecks).toBe(0);

			// deck-l1-dup-1 has cloneRefCount=1 (class deck), so priority picks deck-l1-dup-1 as keeper!
			// Verify keeper priority strictly prefers cloneRefCount over createdAt.
			expect(audit.clusters[0]?.keeper.deck.id).toBe("deck-l1-dup-1");
			expect(
				audit.clusters[0]?.candidates.map((c) => c.inspection.deck.id).sort(),
			).toEqual(["deck-l1-dup-2", "deck-l1-orig"]);
			expect(audit.summary.repointedDecks).toBe(0);

			// Now check a pure duplicate case without clone on dup1 by moving class copy onto deck-l1-dup-2
			await client.execute({
				sql: "UPDATE vocab_deck SET source_deck_id = ? WHERE id = ?",
				args: ["deck-l1-dup-2", "deck-l1-class-copy"],
			});
			// Also add a second clone onto deck-l1-orig so deck-l1-orig wins (clones=1 vs 1, createdAt t1 < t3)
			await db.insert(schema.vocabDeck).values({
				id: "deck-l1-class-copy-2",
				orgId: "org-prod-1",
				classId: "cls-comm2-a",
				groupId: "grp-comm-2",
				title: "Lesson 01 – Home & Accommodation",
				lessonNumber: 1,
				lang: "en",
				sourceDeckId: "deck-l1-orig",
				createdAt: t3,
				updatedAt: t3,
			});

			const audit2 = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
				nowMs: 1_700_000_020_000,
			});
			expect(audit2.clusters[0]?.keeper.deck.id).toBe("deck-l1-orig");
			expect(audit2.summary.deletableDecks).toBe(2);
			expect(audit2.summary.repointedDecks).toBe(1);
			expect(audit2.repointedDecks[0]?.deckId).toBe("deck-l1-class-copy");
			expect(audit2.repointedDecks[0]?.fromSourceDeckId).toBe("deck-l1-dup-2");
			expect(audit2.repointedDecks[0]?.toSourceDeckId).toBe("deck-l1-orig");

			const plan = buildDedupVocabGroupPlan(audit2, {
				nowMs: 1_700_000_020_000,
			});
			expect(plan.deletableDeckIds).toEqual(["deck-l1-dup-1", "deck-l1-dup-2"]);
			expect(plan.deletableWordIds).toHaveLength(4);

			// Verify rendered rollback SQL safely keeps '?' and escaped quotes intact
			const rollbackSqlText = formatDedupRollbackSql(plan);
			expect(rollbackSqlText).toContain("'Isn''t this a cozy apartment?'");
			expect(rollbackSqlText).toContain("'When did you move in?'");
			expect(rollbackSqlText).not.toContain(
				"'Isn''t this a cozy apartment'căn hộ'",
			);

			const applyRes = await applyDedupVocabGroupPlan(runner, plan);
			expect(applyRes.statementsExecuted).toBeGreaterThan(0);

			// Single-use plan guard
			await expect(applyDedupVocabGroupPlan(runner, plan)).rejects.toThrow(
				/already been applied/i,
			);

			const verifyRes = await verifyDedupVocabGroup(runner, plan);
			expect(verifyRes.ok).toBe(true);
			expect(verifyRes.remainingDeletedDecks).toBe(0);
			expect(verifyRes.remainingDeletedWords).toBe(0);
			expect(verifyRes.remainingKeepers).toBe(1);
			expect(verifyRes.remainingClassDecks).toBe(2);
			expect(verifyRes.remainingDeletableAfterReaudit).toBe(0);

			// Verify Group 1 and vocab_review_log are untouched
			const g1Decks = await client.execute(
				"SELECT id FROM vocab_deck WHERE group_id = 'grp-comm-1'",
			);
			expect(g1Decks.rows).toHaveLength(2);
			const reviewLogs = await client.execute(
				"SELECT id FROM vocab_review_log",
			);
			expect(reviewLogs.rows).toHaveLength(1);

			// Verify class deck was repointed to deck-l1-orig
			const repointedRow = await client.execute(
				"SELECT source_deck_id FROM vocab_deck WHERE id = 'deck-l1-class-copy'",
			);
			expect(repointedRow.rows[0]?.source_deck_id).toBe("deck-l1-orig");

			// Rehearse exact rollback
			await runner.run(plan.rollbackStatements);

			const restoredDecks = await client.execute(
				"SELECT id, title FROM vocab_deck WHERE group_id = 'grp-comm-2' AND class_id IS NULL ORDER BY id ASC",
			);
			expect(restoredDecks.rows.map((r) => String(r.id))).toEqual([
				"deck-l1-dup-1",
				"deck-l1-dup-2",
				"deck-l1-orig",
				"deck-l2-only",
			]);
			const restoredWords = await client.execute(
				"SELECT id, example FROM vocab_word WHERE deck_id IN ('deck-l1-dup-1', 'deck-l1-dup-2') ORDER BY id ASC",
			);
			expect(restoredWords.rows).toHaveLength(4);
			expect(
				restoredWords.rows.some(
					(r) => String(r.example) === "Isn't this a cozy apartment?",
				),
			).toBe(true);

			const restoredRepoint = await client.execute(
				"SELECT source_deck_id FROM vocab_deck WHERE id = 'deck-l1-class-copy'",
			);
			expect(restoredRepoint.rows[0]?.source_deck_id).toBe("deck-l1-dup-2");
		} finally {
			client.close();
		}
	});

	it("prioritizes deck with active vocab_card/vocab_suggestion as keeper and avoids self-referential repoint", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "activity.sqlite");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);

			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);

			// Older unused deck A, newer deck B cloned from A that has student vocab_card progress
			await db.insert(schema.vocabDeck).values([
				{
					id: "deck-old-unused",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 04 – Animals & Pets",
					lessonNumber: 4,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				{
					id: "deck-new-active",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 04 – Animals & Pets",
					lessonNumber: 4,
					lang: "en",
					sourceDeckId: "deck-old-unused",
					createdAt: t2,
					updatedAt: t2,
				},
			]);
			await db.insert(schema.vocabWord).values([
				{
					id: "w-old-1",
					deckId: "deck-old-unused",
					word: "puppy",
					entryType: "word",
					translation: "chó con",
					sortOrder: 0,
				},
				{
					id: "w-new-1",
					deckId: "deck-new-active",
					word: "puppy",
					entryType: "word",
					translation: "chó con",
					sortOrder: 0,
				},
			]);
			await db.insert(schema.vocabCard).values({
				id: "card-1",
				studentId: "stu-1",
				wordId: "w-new-1",
				level: 3,
				state: "review",
				intervalDays: 7,
				dueAt: 1_700_500_000_000,
			});

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
			});

			expect(audit.clusters).toHaveLength(1);
			// Newer deck has cardCount=1 so it MUST be chosen as keeper; older unused deck is deleted
			expect(audit.clusters[0]?.keeper.deck.id).toBe("deck-new-active");
			expect(audit.clusters[0]?.candidates[0]?.action).toBe("delete");
			expect(audit.clusters[0]?.candidates[0]?.inspection.deck.id).toBe(
				"deck-old-unused",
			);
			// Keeper pointed to deck-old-unused -> must repoint to NULL (never self-reference)
			expect(audit.repointedDecks).toHaveLength(1);
			expect(audit.repointedDecks[0]?.deckId).toBe("deck-new-active");
			expect(audit.repointedDecks[0]?.toSourceDeckId).toBeNull();

			const plan = buildDedupVocabGroupPlan(audit);
			await applyDedupVocabGroupPlan(runner, plan);
			const verify = await verifyDedupVocabGroup(runner, plan);
			expect(verify.ok).toBe(true);

			// Student's vocab_card on keeper remains intact
			const cards = await client.execute("SELECT id, word_id FROM vocab_card");
			expect(cards.rows).toHaveLength(1);
			expect(cards.rows[0]?.word_id).toBe("w-new-1");

			const keeperRow = await client.execute(
				"SELECT source_deck_id FROM vocab_deck WHERE id = 'deck-new-active'",
			);
			expect(keeperRow.rows[0]?.source_deck_id).toBeNull();
		} finally {
			client.close();
		}
	});

	it("fails closed (skips) candidates with vocab_cards, vocab_suggestions, word content mismatch, unique R2 audio, or lang/lesson mismatch", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "fail-closed.sqlite");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);

			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);
			const t3 = new Date(1_700_000_003_000);
			const t4 = new Date(1_700_000_004_000);
			const t5 = new Date(1_700_000_005_000);
			const t6 = new Date(1_700_000_006_000);

			await db.insert(schema.vocabDeck).values([
				// Keeper (most cards)
				{
					id: "d-keeper",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 5,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				// Candidate 1: has vocab_card
				{
					id: "d-has-card",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 5,
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
				// Candidate 2: has vocab_suggestion
				{
					id: "d-has-sugg",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 5,
					lang: "en",
					createdAt: t3,
					updatedAt: t3,
				},
				// Candidate 3: different word content
				{
					id: "d-diff-words",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 5,
					lang: "en",
					createdAt: t4,
					updatedAt: t4,
				},
				// Candidate 4: unique audio_key not present in keeper
				{
					id: "d-unique-audio",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 5,
					lang: "en",
					createdAt: t5,
					updatedAt: t5,
				},
				// Candidate 5: conflicting lessonNumber and lang
				{
					id: "d-meta-conflict",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 05 – Wild Animals",
					lessonNumber: 9,
					lang: "vi",
					createdAt: t6,
					updatedAt: t6,
				},
			]);

			await db.insert(schema.vocabWord).values([
				{
					id: "wk-1",
					deckId: "d-keeper",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					sortOrder: 0,
				},
				{
					id: "wk-2",
					deckId: "d-keeper",
					word: "elephant",
					entryType: "word",
					translation: "con voi",
					sortOrder: 1,
				},
				{
					id: "wc-1",
					deckId: "d-has-card",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					sortOrder: 0,
				},
				{
					id: "wc-2",
					deckId: "d-has-card",
					word: "elephant",
					entryType: "word",
					translation: "con voi",
					sortOrder: 1,
				},
				{
					id: "ws-1",
					deckId: "d-has-sugg",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					sortOrder: 0,
				},
				{
					id: "ws-2",
					deckId: "d-has-sugg",
					word: "elephant",
					entryType: "word",
					translation: "con voi",
					sortOrder: 1,
				},
				{
					id: "wd-1",
					deckId: "d-diff-words",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					sortOrder: 0,
				},
				{
					id: "wa-1",
					deckId: "d-unique-audio",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					audioKey: "vocab/org-prod-1/wa-1/custom.mp3",
					sortOrder: 0,
				},
				{
					id: "wa-2",
					deckId: "d-unique-audio",
					word: "elephant",
					entryType: "word",
					translation: "con voi",
					sortOrder: 1,
				},
				{
					id: "wm-1",
					deckId: "d-meta-conflict",
					word: "tiger",
					entryType: "word",
					translation: "con hổ",
					sortOrder: 0,
				},
				{
					id: "wm-2",
					deckId: "d-meta-conflict",
					word: "elephant",
					entryType: "word",
					translation: "con voi",
					sortOrder: 1,
				},
			]);

			await db.insert(schema.vocabCard).values([
				{
					id: "c-k1",
					studentId: "stu-1",
					wordId: "wk-1",
					level: 2,
					state: "review",
					intervalDays: 3,
					dueAt: 1_700_500_000_000,
				},
				{
					id: "c-k2",
					studentId: "stu-1",
					wordId: "wk-2",
					level: 2,
					state: "review",
					intervalDays: 3,
					dueAt: 1_700_500_000_000,
				},
				{
					id: "c-cand",
					studentId: "stu-1",
					wordId: "wc-1",
					level: 1,
					state: "new",
					intervalDays: 0,
					dueAt: 1_700_500_000_000,
				},
			]);
			await db.insert(schema.vocabSuggestion).values({
				id: "sugg-1",
				orgId: "org-prod-1",
				teacherId: "usr-teacher-1",
				studentId: "stu-1",
				deckId: "d-has-sugg",
				status: "pending",
			});

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
			});

			expect(audit.clusters).toHaveLength(1);
			expect(audit.clusters[0]?.keeper.deck.id).toBe("d-keeper");
			expect(audit.summary.deletableDecks).toBe(0);
			expect(audit.summary.skippedDecks).toBe(5);

			const reasonById = new Map(
				audit.clusters[0]?.candidates.map((c) => [
					c.inspection.deck.id,
					c.skipReasons,
				]),
			);
			expect(reasonById.get("d-has-card")).toContain("has_vocab_cards");
			expect(reasonById.get("d-has-sugg")).toContain("has_vocab_suggestions");
			expect(reasonById.get("d-diff-words")).toContain("word_content_mismatch");
			expect(reasonById.get("d-unique-audio")).toContain("has_unique_audio");
			expect(reasonById.get("d-meta-conflict")).toEqual(
				expect.arrayContaining(["lang_mismatch", "lesson_number_mismatch"]),
			);

			const plan = buildDedupVocabGroupPlan(audit);
			const res = await applyDedupVocabGroupPlan(runner, plan);
			expect(res.statementsExecuted).toBe(0);
		} finally {
			client.close();
		}
	});

	it("aborts apply fail-closed when live preflight detects new vocab_card created after audit", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "race.sqlite");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);

			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);
			await db.insert(schema.vocabDeck).values([
				{
					id: "d-orig",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 06 – Computers & Technology",
					lessonNumber: 6,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				{
					id: "d-dup",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 06 – Computers & Technology",
					lessonNumber: 6,
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
			]);
			await db.insert(schema.vocabWord).values([
				{
					id: "w-orig",
					deckId: "d-orig",
					word: "laptop",
					entryType: "word",
					translation: "máy tính xách tay",
					sortOrder: 0,
				},
				{
					id: "w-dup",
					deckId: "d-dup",
					word: "laptop",
					entryType: "word",
					translation: "máy tính xách tay",
					sortOrder: 0,
				},
			]);

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
			});
			const plan = buildDedupVocabGroupPlan(audit);
			expect(plan.deletableDeckIds).toEqual(["d-dup"]);

			// Simulate a student starting the duplicate deck between audit and apply
			await db.insert(schema.vocabCard).values({
				id: "card-race",
				studentId: "stu-1",
				wordId: "w-dup",
				level: 1,
				state: "new",
				intervalDays: 0,
				dueAt: 1_700_500_000_000,
			});

			await expect(applyDedupVocabGroupPlan(runner, plan)).rejects.toThrow(
				/Preflight safety gate failed.*vocab_card/i,
			);

			// Confirm nothing was deleted
			const remaining = await client.execute(
				"SELECT id FROM vocab_deck WHERE id = 'd-dup'",
			);
			expect(remaining.rows).toHaveLength(1);
		} finally {
			client.close();
		}
	});

	it("validates CLI flags and runs dry-run/apply end-to-end with --public-logs redaction and backup files", async () => {
		expect(normalizeDeckTitleForDedup("  Lesson  01 – Home ")).toBe(
			"lesson 01 – home",
		);
		expect(parseDedupVocabArgs(["--d1"]).groupName).toBe(
			DEFAULT_DEDUP_GROUP_NAME,
		);
		expect(parseDedupVocabArgs(["--d1"]).mode).toBe("dry-run");
		expect(parseDedupVocabArgs(["--d1"]).d1Stage).toBe("prod");

		// Prod apply safety gates
		expect(() =>
			parseDedupVocabArgs(["--d1", "--d1-stage", "prod", "--mode", "apply"]),
		).toThrow(/--allow-prod/);
		expect(() =>
			parseDedupVocabArgs([
				"--d1",
				"--d1-stage",
				"prod",
				"--mode",
				"apply",
				"--allow-prod",
				"--confirm-prod",
				"staging",
			]),
		).toThrow(/--confirm-prod prod/);
		expect(() => parseDedupVocabArgs(["--file", "a.db", "--d1"])).toThrow(
			/Cannot combine/,
		);

		const dir = makeTempDir();
		const dbPath = join(dir, "cli-test.sqlite");
		const dumpPrefix = join(dir, "backup-dump");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);
			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);
			await db.insert(schema.vocabDeck).values([
				{
					id: "deck-cli-secret-uuid-1",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 09 – Daily Habits",
					lessonNumber: 9,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				{
					id: "deck-cli-secret-uuid-2",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 09 – Daily Habits",
					lessonNumber: 9,
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
			]);
			await db.insert(schema.vocabWord).values([
				{
					id: "w-cli-1",
					deckId: "deck-cli-secret-uuid-1",
					word: "routine",
					entryType: "word",
					translation: "thói quen",
					sortOrder: 0,
				},
				{
					id: "w-cli-2",
					deckId: "deck-cli-secret-uuid-2",
					word: "routine",
					entryType: "word",
					translation: "thói quen",
					sortOrder: 0,
				},
			]);
		} finally {
			client.close();
		}

		// 1. Dry-run with --public-logs must omit internal IDs & teacher email
		let dryRunOut = "";
		await runDedupVocabGroupCli(
			[
				"--file",
				dbPath,
				"--mode",
				"dry-run",
				"--group",
				"Communication English Level 2",
				"--public-logs",
			],
			{
				env: { TEACHER_EMAILS: "teacher@msmy.io.vn" },
				writeStdout: (chunk) => {
					dryRunOut += chunk;
				},
			},
		);
		expect(dryRunOut).toContain("Communication English Level 2");
		expect(dryRunOut).toContain("deletableDecks=1");
		expect(dryRunOut).toContain("DRY-RUN complete");
		expect(dryRunOut).not.toContain("org-prod-1");
		expect(dryRunOut).not.toContain("grp-comm-2");
		expect(dryRunOut).not.toContain("deck-cli-secret-uuid-1");
		expect(dryRunOut).not.toContain("deck-cli-secret-uuid-2");
		expect(dryRunOut).not.toContain("teacher@msmy.io.vn");

		// 2. Apply mode creates preimage JSON + rollback SQL and verifies
		let applyOut = "";
		await runDedupVocabGroupCli(
			[
				"--file",
				dbPath,
				"--mode",
				"apply",
				"--group",
				"Communication English Level 2",
				"--dump",
				dumpPrefix,
				"--public-logs",
			],
			{
				env: { TEACHER_EMAILS: "teacher@msmy.io.vn" },
				writeStdout: (chunk) => {
					applyOut += chunk;
				},
			},
		);
		expect(applyOut).toContain("Verify: ok=true");
		expect(applyOut).toContain("remainingDeletable=0");
		expect(applyOut).not.toContain("deck-cli-secret-uuid-2");

		const preimagePath = `${dumpPrefix}-preimage.json`;
		const rollbackPath = `${dumpPrefix}-rollback.sql`;
		expect(existsSync(preimagePath)).toBe(true);
		expect(existsSync(rollbackPath)).toBe(true);
		const preimageJson = JSON.parse(readFileSync(preimagePath, "utf8"));
		expect(preimageJson.deletedDecks).toHaveLength(1);
		expect(preimageJson.deletedDecks[0].id).toBe("deck-cli-secret-uuid-2");
		expect(preimageJson.deletedWords).toHaveLength(1);
		expect(readFileSync(rollbackPath, "utf8")).toContain(
			"INSERT INTO vocab_deck",
		);

		// 3. Re-running apply is a clean idempotent no-op
		let rerunOut = "";
		await runDedupVocabGroupCli(
			[
				"--file",
				dbPath,
				"--mode",
				"apply",
				"--group",
				"Communication English Level 2",
				"--public-logs",
			],
			{
				env: { TEACHER_EMAILS: "teacher@msmy.io.vn" },
				writeStdout: (chunk) => {
					rerunOut += chunk;
				},
			},
		);
		expect(rerunOut).toContain("No safely deletable duplicate decks found");
	});

	it("formats classDecks breakdown and ungrouped overlaps, redacting classId/className in publicLogs mode", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "report.sqlite");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedBaseOrgAndGroup(db);
			const t1 = new Date(1_700_000_001_000);
			const t2 = new Date(1_700_000_002_000);

			await db.insert(schema.vocabDeck).values([
				{
					id: "bank-l1",
					orgId: "org-prod-1",
					classId: null,
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					lang: "en",
					createdAt: t1,
					updatedAt: t1,
				},
				// Two duplicate decks inside cls-comm2-a
				{
					id: "cls-deck-1",
					orgId: "org-prod-1",
					classId: "cls-comm2-a",
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					lang: "en",
					sourceDeckId: "bank-l1",
					createdAt: t1,
					updatedAt: t1,
				},
				{
					id: "cls-deck-2",
					orgId: "org-prod-1",
					classId: "cls-comm2-a",
					groupId: "grp-comm-2",
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					lang: "en",
					sourceDeckId: "bank-l1",
					createdAt: t2,
					updatedAt: t2,
				},
				// Ungrouped bank deck with overlapping title
				{
					id: "ungrouped-l1",
					orgId: "org-prod-1",
					classId: null,
					groupId: null,
					title: "Lesson 01 – Home & Accommodation",
					lessonNumber: 1,
					lang: "en",
					createdAt: t2,
					updatedAt: t2,
				},
			]);

			await db.insert(schema.vocabWord).values([
				{
					id: "w-bank-1",
					deckId: "bank-l1",
					word: "apartment",
					entryType: "word",
					translation: "căn hộ",
					sortOrder: 0,
				},
				{
					id: "w-cls-1",
					deckId: "cls-deck-1",
					word: "apartment",
					entryType: "word",
					translation: "căn hộ",
					sortOrder: 0,
				},
				{
					id: "w-cls-2",
					deckId: "cls-deck-2",
					word: "apartment",
					entryType: "word",
					translation: "căn hộ",
					sortOrder: 0,
				},
				{
					id: "w-ungrp-1",
					deckId: "ungrouped-l1",
					word: "apartment",
					entryType: "word",
					translation: "căn hộ",
					sortOrder: 0,
				},
			]);

			await db.insert(schema.vocabCard).values({
				id: "card-cls-1",
				studentId: "stu-1",
				wordId: "w-cls-1",
				level: 2,
				state: "review",
				intervalDays: 3,
				dueAt: 1_700_500_000_000,
			});

			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditDedupVocabGroup(runner, {
				targetOrgId: "org-prod-1",
				groupName: "Communication English Level 2",
			});

			expect(audit.summary.duplicateClusters).toBe(0);
			expect(audit.summary.classesWithDecks).toBe(1);
			expect(audit.summary.classDuplicateClusters).toBe(1);
			expect(audit.summary.classExtraDecks).toBe(1);
			expect(audit.summary.ungroupedOverlapDecks).toBe(1);
			expect(audit.classBreakdowns[0]?.totalCards).toBe(1);
			expect(audit.classBreakdowns[0]?.linkedToBankSourceCount).toBe(2);
			expect(
				audit.classBreakdowns[0]?.duplicateClusters[0]?.allWordsIdentical,
			).toBe(true);

			const localReport = formatDedupAuditReport(audit, { publicLogs: false });
			expect(localReport).toContain("groupId=grp-comm-2");
			expect(localReport).toContain("orgId=org-prod-1");
			expect(localReport).toContain('id=cls-comm2-a name="Comm 2A"');
			expect(localReport).toContain("id=cls-deck-1");
			expect(localReport).toContain("id=ungrouped-l1");
			expect(localReport).toContain("không tìm thấy bộ từ vựng ngân hàng");

			const publicReport = formatDedupAuditReport(audit, { publicLogs: true });
			expect(publicReport).toContain("class#1");
			expect(publicReport).toContain("CLASS-DUP[1]");
			expect(publicReport).toContain("allWordsIdentical=true");
			expect(publicReport).toContain("cards=1");
			expect(publicReport).toContain("Ungrouped Bank Decks Overlapping Titles");
			expect(publicReport).not.toContain("cls-comm2-a");
			expect(publicReport).not.toContain("Comm 2A");
			expect(publicReport).not.toContain("cls-deck-1");
			expect(publicReport).not.toContain("ungrouped-l1");
			expect(publicReport).not.toContain("org-prod-1");
		} finally {
			client.close();
		}
	});

	it("redacts D1 credentials and database UUID when D1 REST API fails in prod dry-run", async () => {
		const fakeAccountId = "acc-secret-1234567890";
		const fakeApiToken = "cf-token-secret-xyz987654";
		const fakeDbUuid = "11111111-2222-3333-4444-555555555555";

		const mockFetch: typeof fetch = async (input) => {
			const url = String(input);
			if (url.endsWith(`/d1/database/${fakeDbUuid}`)) {
				return new Response(
					JSON.stringify({
						success: false,
						errors: [
							{
								message: `Auth failed for ${fakeAccountId} / ${fakeApiToken} on ${fakeDbUuid}`,
							},
						],
					}),
					{ status: 403, headers: { "content-type": "application/json" } },
				);
			}
			throw new Error(`Unexpected fetch URL: ${url}`);
		};

		let caughtMessage = "";
		try {
			await runDedupVocabGroupCli(
				["--d1", "--d1-stage", "prod", "--mode", "dry-run", "--public-logs"],
				{
					env: {
						CLOUDFLARE_ACCOUNT_ID: fakeAccountId,
						CLOUDFLARE_API_TOKEN: fakeApiToken,
						PROD_D1_DATABASE_ID: fakeDbUuid,
					},
					fetchImpl: mockFetch,
					writeStdout: () => {},
				},
			);
		} catch (err) {
			caughtMessage = err instanceof Error ? err.message : String(err);
		}

		expect(caughtMessage).toContain("403");
		expect(caughtMessage).not.toContain(fakeAccountId);
		expect(caughtMessage).not.toContain(fakeApiToken);
		expect(caughtMessage).not.toContain(fakeDbUuid);
	});
});
