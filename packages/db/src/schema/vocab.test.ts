import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { buildVocabLibraryUpsertStatements } from "../seed/vocab-library";
import * as schema from "./index";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

describe("vocab schema & migration 0038 (#363)", () => {
	it("rehearses 0038 recreate on populated DB (preserving existing decks/words/cards + indexes) and supports classId=null + vocab_suggestion unique/upsert", async () => {
		const client = createClient({ url: ":memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const pre0038 = files.filter((f) => f < "0038_");
			const file0038 = files.find((f) => f.startsWith("0038_"));
			expect(file0038).toBeDefined();

			for (const file of pre0038) {
				const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				const statements = sqlText
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean);
				for (const stmt of statements) {
					await client.execute(stmt);
				}
			}

			// Seed populated state prior to 0038
			await client.execute({
				sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
				args: ["org-1", "Org 1"],
			});
			await client.execute({
				sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 1000, 1000)",
				args: ["teacher-1", "Teacher 1", "t1@example.com"],
			});
			await client.execute({
				sql: "INSERT INTO class (id, org_id, name) VALUES (?, ?, ?)",
				args: ["class-1", "org-1", "IELTS A1"],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name) VALUES (?, ?, ?)",
				args: ["student-1", "org-1", "Student 1"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lang, source_library_deck_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1700000000000, 1700000000000)",
				args: [
					"deck-existing",
					"org-1",
					"class-1",
					"Existing Class Deck",
					"en",
					"libdeck-1",
				],
			});
			await client.execute({
				sql: "INSERT INTO vocab_word (id, deck_id, word, translation, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1700000000000, 1700000000000)",
				args: ["word-1", "deck-existing", "resilient", "kiên cường"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_card (id, student_id, word_id, level, is_warning, state, interval_days, due_at, lapses, created_at, updated_at) VALUES (?, ?, ?, 2, 0, 'review', 3, 1700000000000, 0, 1700000000000, 1700000000000)",
				args: ["card-1", "student-1", "word-1"],
			});

			// Apply 0038 migration
			const sql0038 = readFileSync(
				join(MIGRATIONS_DIR, file0038 as string),
				"utf8",
			);
			for (const stmt of sql0038
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			const db = drizzle(client, { schema });

			// 1. Existing deck, word, card preserved (query columns that existed at 0038)
			const [existingDeck] = await db
				.select({
					id: schema.vocabDeck.id,
					orgId: schema.vocabDeck.orgId,
					classId: schema.vocabDeck.classId,
					title: schema.vocabDeck.title,
					lang: schema.vocabDeck.lang,
					sourceLibraryDeckId: schema.vocabDeck.sourceLibraryDeckId,
				})
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-existing"));
			expect(existingDeck).toMatchObject({
				id: "deck-existing",
				orgId: "org-1",
				classId: "class-1",
				title: "Existing Class Deck",
				lang: "en",
				sourceLibraryDeckId: "libdeck-1",
			});

			const [existingWord] = await db
				.select({
					id: schema.vocabWord.id,
					word: schema.vocabWord.word,
				})
				.from(schema.vocabWord)
				.where(eq(schema.vocabWord.id, "word-1"));
			expect(existingWord?.word).toBe("resilient");

			const [existingCard] = await db
				.select()
				.from(schema.vocabCard)
				.where(eq(schema.vocabCard.id, "card-1"));
			expect(existingCard?.level).toBe(2);

			// 2. Verify all 3 vocab_deck indexes and 3 vocab_suggestion indexes exist
			const idxRows = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('vocab_deck', 'vocab_suggestion')",
			);
			const idxNames = idxRows.rows.map((r) => String(r.name));
			expect(idxNames).toEqual(
				expect.arrayContaining([
					"vocab_deck_org_idx",
					"vocab_deck_class_idx",
					"vocab_deck_source_library_idx",
					"vocab_suggestion_org_idx",
					"vocab_suggestion_student_status_idx",
					"vocab_suggestion_student_deck_uq",
				]),
			);

			// 3. Insert independent deck with classId = null (at 0038 schema columns)
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 1700000000000, 1700000000000)",
				args: ["deck-independent", "org-1", "Independent TOEIC Deck", "en"],
			});
			const [indepDeck] = await db
				.select({
					id: schema.vocabDeck.id,
					classId: schema.vocabDeck.classId,
				})
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-independent"));
			expect(indepDeck?.classId).toBeNull();

			// 4. Insert vocab_suggestion and test UNIQUE(student_id, deck_id) + upsert flip
			await db.insert(schema.vocabSuggestion).values({
				id: "sug-1",
				orgId: "org-1",
				teacherId: "teacher-1",
				studentId: "student-1",
				deckId: "deck-independent",
				note: "Ôn trước thứ 7",
				status: "dismissed",
				respondedAt: new Date(1700000005000),
			});

			await expect(
				db.insert(schema.vocabSuggestion).values({
					id: "sug-2",
					orgId: "org-1",
					teacherId: "teacher-1",
					studentId: "student-1",
					deckId: "deck-independent",
					status: "pending",
				}),
			).rejects.toThrow();

			// Upsert flip back to pending
			await db
				.insert(schema.vocabSuggestion)
				.values({
					id: "sug-2",
					orgId: "org-1",
					teacherId: "teacher-1",
					studentId: "student-1",
					deckId: "deck-independent",
					note: "Gợi ý lại nhé",
					status: "pending",
				})
				.onConflictDoUpdate({
					target: [
						schema.vocabSuggestion.studentId,
						schema.vocabSuggestion.deckId,
					],
					set: {
						status: "pending",
						note: "Gợi ý lại nhé",
						teacherId: "teacher-1",
					},
				});

			const [flipped] = await db
				.select()
				.from(schema.vocabSuggestion)
				.where(eq(schema.vocabSuggestion.id, "sug-1"));
			expect(flipped?.status).toBe("pending");
			expect(flipped?.note).toBe("Gợi ý lại nhé");
		} finally {
			client.close();
		}
	});

	it("migrates cleanly via drizzle migrator from scratch", async () => {
		const client = createClient({ url: ":memory:" });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
			await client.execute("PRAGMA foreign_keys = ON;");
			const fkCheck = await client.execute("PRAGMA foreign_keys;");
			expect(Number(fkCheck.rows[0]?.foreign_keys)).toBe(1);
			const tables = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocab_suggestion'",
			);
			expect(tables.rows).toHaveLength(1);
		} finally {
			client.close();
		}
	});
});

describe("vocab_card polymorphic word_id & migration 0039 (#366)", () => {
	it("rehearses 0039 recreate on populated DB, enforces PRAGMA foreign_keys = ON for student_id while allowing libword-* in vocab_card, and prunes orphan libword-* cards on seed prune", async () => {
		const client = createClient({ url: ":memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const pre0039 = files.filter((f) => f < "0039_");
			const file0039 = files.find((f) => f.startsWith("0039_"));
			expect(file0039).toBeDefined();

			for (const file of pre0039) {
				const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				const statements = sqlText
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean);
				for (const stmt of statements) {
					await client.execute(stmt);
				}
			}

			// Populate existing data before 0039
			await client.execute({
				sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
				args: ["org-1", "Org 1"],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name) VALUES (?, ?, ?)",
				args: ["student-1", "org-1", "Student 1"],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name) VALUES (?, ?, ?)",
				args: ["student-2", "org-1", "Student 2"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, 'en', 1700000000000, 1700000000000)",
				args: ["deck-1", "org-1", "Org Deck"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_word (id, deck_id, word, translation, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1700000000000, 1700000000000)",
				args: ["word-1", "deck-1", "ubiquitous", "phổ biến"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_card (id, student_id, word_id, level, is_warning, state, interval_days, due_at, lapses, created_at, updated_at) VALUES (?, ?, ?, 3, 0, 'review', 7, 1700000500000, 1, 1700000000000, 1700000000000)",
				args: ["card-org-1", "student-1", "word-1"],
			});

			// Apply 0039 migration
			const sql0039 = readFileSync(
				join(MIGRATIONS_DIR, file0039 as string),
				"utf8",
			);
			for (const stmt of sql0039
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			// Apply 0040 migration (vocab_library_deck.description)
			const file0040 = files.find((f) => f.startsWith("0040_"));
			expect(file0040).toBeDefined();
			const sql0040 = readFileSync(
				join(MIGRATIONS_DIR, file0040 as string),
				"utf8",
			);
			for (const stmt of sql0040
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			// Explicitly enable FK outside transaction (reflecting Cloudflare D1)
			await client.execute("PRAGMA foreign_keys = ON;");
			const fkRes = await client.execute("PRAGMA foreign_keys;");
			expect(Number(fkRes.rows[0]?.foreign_keys)).toBe(1);

			const db = drizzle(client, { schema });

			// 1. Existing card survived 0039
			const [preservedCard] = await db
				.select()
				.from(schema.vocabCard)
				.where(eq(schema.vocabCard.id, "card-org-1"));
			expect(preservedCard).toMatchObject({
				id: "card-org-1",
				studentId: "student-1",
				wordId: "word-1",
				level: 3,
				state: "review",
				intervalDays: 7,
				lapses: 1,
			});

			// 2. All 3 indexes on vocab_card preserved
			const idxRows = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'vocab_card'",
			);
			const idxNames = idxRows.rows.map((r) => String(r.name));
			expect(idxNames).toEqual(
				expect.arrayContaining([
					"vocab_card_student_word_uq",
					"vocab_card_student_due_idx",
					"vocab_card_word_idx",
				]),
			);

			// 3. Seed library course/deck/words & insert vocab_card with libword-* while PRAGMA foreign_keys = ON
			const initialLibraryStatements = buildVocabLibraryUpsertStatements({
				courses: [
					{
						id: "libcourse-1",
						name: "1000 Từ Cơ Bản",
						description: "Mô tả",
						target: "Mất gốc",
						sortOrder: 0,
					},
				],
				decks: [
					{
						id: "libdeck-1",
						courseId: "libcourse-1",
						title: "Bài 1",
						description: "1.Trường học",
						imageUrl: null,
						sortOrder: 0,
					},
				],
				words: [
					{
						id: "libword-1",
						deckId: "libdeck-1",
						word: "hello",
						ipa: "/həˈləʊ/",
						pos: "interjection",
						translation: "xin chào",
						sentenceVi: "Xin chào bạn",
						sentenceEn: "Hello friend",
						pictureUrl: null,
						audioUrl: "https://example.com/hello.mp3",
						sortOrder: 0,
					},
					{
						id: "libword-removed",
						deckId: "libdeck-1",
						word: "obsolete",
						ipa: null,
						pos: "adj",
						translation: "lỗi thời",
						sentenceVi: null,
						sentenceEn: null,
						pictureUrl: null,
						audioUrl: null,
						sortOrder: 1,
					},
				],
			});
			await client.batch(initialLibraryStatements, "write");

			await db.insert(schema.vocabCard).values([
				{
					id: "card-lib-1",
					studentId: "student-1",
					wordId: "libword-1",
					level: 2,
					state: "review",
					intervalDays: 3,
					dueAt: 1700000100000,
				},
				{
					id: "card-lib-removed",
					studentId: "student-1",
					wordId: "libword-removed",
					level: 1,
					state: "review",
					intervalDays: 1,
					dueAt: 1700000100000,
				},
				{
					id: "card-student-2",
					studentId: "student-2",
					wordId: "libword-1",
					level: 1,
					state: "new",
					intervalDays: 0,
					dueAt: 1700000000000,
				},
			]);

			// Duplicate (studentId, wordId) rejected by unique index
			await expect(
				db.insert(schema.vocabCard).values({
					id: "card-lib-dup",
					studentId: "student-1",
					wordId: "libword-1",
					dueAt: 1700000000000,
				}),
			).rejects.toThrow();

			// Nonexistent studentId rejected by student FK
			await expect(
				db.insert(schema.vocabCard).values({
					id: "card-ghost-student",
					studentId: "student-nonexistent",
					wordId: "libword-1",
					dueAt: 1700000000000,
				}),
			).rejects.toThrow();

			// Deleting student-2 cascades to card-student-2
			await db.delete(schema.student).where(eq(schema.student.id, "student-2"));
			const student2Cards = await db
				.select()
				.from(schema.vocabCard)
				.where(eq(schema.vocabCard.studentId, "student-2"));
			expect(student2Cards).toHaveLength(0);

			// 4. Re-running seed with prune: true preserves card-lib-1 & card-org-1, removes card-lib-removed
			const prunedStatements = buildVocabLibraryUpsertStatements(
				{
					courses: [
						{
							id: "libcourse-1",
							name: "1000 Từ Cơ Bản",
							description: "Mô tả",
							target: "Mất gốc",
							sortOrder: 0,
						},
					],
					decks: [
						{
							id: "libdeck-1",
							courseId: "libcourse-1",
							title: "Bài 1",
							description: null,
							imageUrl: null,
							sortOrder: 0,
						},
					],
					words: [
						{
							id: "libword-1",
							deckId: "libdeck-1",
							word: "hello",
							ipa: "/həˈləʊ/",
							pos: "interjection",
							translation: "xin chào",
							sentenceVi: "Xin chào bạn",
							sentenceEn: "Hello friend",
							pictureUrl: null,
							audioUrl: "https://example.com/hello.mp3",
							sortOrder: 0,
						},
					],
				},
				{ prune: true },
			);
			await client.batch(prunedStatements, "write");

			const remainingCards = await db
				.select()
				.from(schema.vocabCard)
				.where(eq(schema.vocabCard.studentId, "student-1"));
			expect(remainingCards.map((c) => c.id).sort()).toEqual([
				"card-lib-1",
				"card-org-1",
			]);
		} finally {
			client.close();
		}
	});

	it("rehearses 0077 additive migration on populated vocab_deck/vocab_word rows and supports lessonNumber/topic/entryType/pos/example", async () => {
		const client = createClient({ url: "file::memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR).filter((f) =>
				f.endsWith(".sql"),
			);
			files.sort();
			const idx0077 = files.findIndex((f) => f.startsWith("0077_"));
			expect(idx0077).toBeGreaterThan(0);

			for (const file of files.slice(0, idx0077)) {
				const rawSql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				for (const stmt of rawSql
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean)) {
					await client.execute(stmt);
				}
			}

			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1700000000000)",
				args: ["org-legacy", "Legacy Org"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, 'en', 1700000000000, 1700000000000)",
				args: ["deck-legacy", "org-legacy", "Legacy Deck"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_word (id, deck_id, word, ipa, translation, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1700000000000, 1700000000000)",
				args: [
					"word-legacy",
					"deck-legacy",
					"resilient",
					"/rɪˈzɪl.i.ənt/",
					"kiên cường",
				],
			});

			const file0077 = files[idx0077] as string;
			const sql0077 = readFileSync(join(MIGRATIONS_DIR, file0077), "utf8");
			for (const stmt of sql0077
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			const db = drizzle(client, { schema });
			const [legacyDeck] = await db
				.select({
					id: schema.vocabDeck.id,
					orgId: schema.vocabDeck.orgId,
					classId: schema.vocabDeck.classId,
					title: schema.vocabDeck.title,
					lessonNumber: schema.vocabDeck.lessonNumber,
					topic: schema.vocabDeck.topic,
					lang: schema.vocabDeck.lang,
					sourceLibraryDeckId: schema.vocabDeck.sourceLibraryDeckId,
				})
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-legacy"));
			expect(legacyDeck).toMatchObject({
				id: "deck-legacy",
				title: "Legacy Deck",
				lessonNumber: null,
				topic: null,
			});

			const [legacyWord] = await db
				.select()
				.from(schema.vocabWord)
				.where(eq(schema.vocabWord.id, "word-legacy"));
			expect(legacyWord).toMatchObject({
				id: "word-legacy",
				word: "resilient",
				entryType: "word",
				pos: null,
				example: null,
			});

			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 1700000000000, 1700000000000)",
				args: [
					"deck-lesson-1",
					"org-legacy",
					"Lesson 01 – Friends & Introductions",
					1,
					"Friends & Introductions",
					"en",
				],
			});
			await db.insert(schema.vocabWord).values({
				id: "chunk-1",
				deckId: "deck-lesson-1",
				word: "be from + (city / country)",
				entryType: "chunk",
				ipa: null,
				pos: null,
				translation: "đến từ …",
				example: "I'm from Hue, in the centre of Vietnam.",
				sortOrder: 0,
			});

			const [chunkRow] = await db
				.select()
				.from(schema.vocabWord)
				.where(eq(schema.vocabWord.id, "chunk-1"));
			expect(chunkRow).toMatchObject({
				entryType: "chunk",
				pos: null,
				example: "I'm from Hue, in the centre of Vietnam.",
			});
		} finally {
			client.close();
		}
	});

	it("rehearses 0079 additive migration on populated vocab_deck rows and preserves cloned decks when source deck is deleted", async () => {
		const client = createClient({ url: "file::memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const idx0079 = files.findIndex((f) => f.startsWith("0079_"));
			expect(idx0079).toBeGreaterThan(0);

			for (const file of files.slice(0, idx0079)) {
				const rawSql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				for (const stmt of rawSql
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean)) {
					await client.execute(stmt);
				}
			}

			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1700000000000)",
				args: ["org-clone", "Clone Org"],
			});
			await client.execute({
				sql: "INSERT INTO class (id, org_id, name) VALUES (?, ?, ?)",
				args: ["class-clone", "org-clone", "IELTS 6.0"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, ?, 'en', 1700000000000, 1700000000000)",
				args: ["deck-source", "org-clone", "Hub Source Deck", "Travel"],
			});

			const file0079 = files[idx0079] as string;
			const sql0079 = readFileSync(join(MIGRATIONS_DIR, file0079), "utf8");
			for (const stmt of sql0079
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			await client.execute("PRAGMA foreign_keys = ON;");

			const db = drizzle(client, { schema });

			// 1. Existing row preserved with sourceDeckId = null (query columns that existed at 0079)
			const [existingDeck] = await db
				.select({
					id: schema.vocabDeck.id,
					orgId: schema.vocabDeck.orgId,
					classId: schema.vocabDeck.classId,
					title: schema.vocabDeck.title,
					lessonNumber: schema.vocabDeck.lessonNumber,
					topic: schema.vocabDeck.topic,
					sourceDeckId: schema.vocabDeck.sourceDeckId,
				})
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-source"));
			expect(existingDeck).toMatchObject({
				id: "deck-source",
				orgId: "org-clone",
				classId: null,
				title: "Hub Source Deck",
				lessonNumber: 1,
				topic: "Travel",
				sourceDeckId: null,
			});

			// 2. Verify vocab_deck_source_deck_idx exists
			const idxRows = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'vocab_deck'",
			);
			const idxNames = idxRows.rows.map((r) => String(r.name));
			expect(idxNames).toContain("vocab_deck_source_deck_idx");

			// 3. New row can store sourceDeckId and survives when source deck is deleted (0079 schema columns)
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, source_deck_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 'en', ?, 1700000000000, 1700000000000)",
				args: [
					"deck-cloned",
					"org-clone",
					"class-clone",
					"Hub Source Deck",
					"Travel",
					"deck-source",
				],
			});

			await db
				.delete(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-source"));

			const [survivingClone] = await db
				.select({
					id: schema.vocabDeck.id,
					classId: schema.vocabDeck.classId,
					title: schema.vocabDeck.title,
					sourceDeckId: schema.vocabDeck.sourceDeckId,
				})
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-cloned"));
			expect(survivingClone).toMatchObject({
				id: "deck-cloned",
				classId: "class-clone",
				title: "Hub Source Deck",
				sourceDeckId: "deck-source",
			});
		} finally {
			client.close();
		}
	});

	it("rehearses 0080 additive migration on populated vocab_deck rows, enforces per-org unique normalized_name on vocab_group, and clears group_id on group delete", async () => {
		const client = createClient({ url: "file::memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const idx0080 = files.findIndex((f) => f.startsWith("0080_"));
			expect(idx0080).toBeGreaterThan(0);

			for (const file of files.slice(0, idx0080)) {
				const rawSql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				for (const stmt of rawSql
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean)) {
					await client.execute(stmt);
				}
			}

			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1700000000000)",
				args: ["org-a", "Org A"],
			});
			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1700000000000)",
				args: ["org-b", "Org B"],
			});
			await client.execute({
				sql: "INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, ?, 'en', 1700000000000, 1700000000000)",
				args: ["deck-pre-group", "org-a", "Pre-group Deck", "Daily"],
			});

			const file0080 = files[idx0080] as string;
			const sql0080 = readFileSync(join(MIGRATIONS_DIR, file0080), "utf8");
			for (const stmt of sql0080
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			await client.execute("PRAGMA foreign_keys = ON;");

			const db = drizzle(client, { schema });

			// 1. Existing vocab_deck row preserved with groupId = null
			const [existingDeck] = await db
				.select()
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-pre-group"));
			expect(existingDeck).toMatchObject({
				id: "deck-pre-group",
				orgId: "org-a",
				title: "Pre-group Deck",
				groupId: null,
			});

			// 2. Verify vocab_group table and indexes on vocab_group & vocab_deck exist
			const tableRows = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocab_group'",
			);
			expect(tableRows.rows).toHaveLength(1);

			const idxRows = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('vocab_group', 'vocab_deck')",
			);
			const idxNames = idxRows.rows.map((r) => String(r.name));
			expect(idxNames).toEqual(
				expect.arrayContaining([
					"vocab_group_org_idx",
					"vocab_group_org_normalized_name_uq",
					"vocab_deck_group_idx",
				]),
			);

			// 3. Unique (org_id, normalized_name) blocks duplicates in same org, allows across orgs
			await db.insert(schema.vocabGroup).values({
				id: "grp-a1",
				orgId: "org-a",
				name: "Giao Tiếp",
				normalizedName: "giao tiếp",
			});

			await expect(
				db.insert(schema.vocabGroup).values({
					id: "grp-a2",
					orgId: "org-a",
					name: "giao tiếp",
					normalizedName: "giao tiếp",
				}),
			).rejects.toThrow();

			await db.insert(schema.vocabGroup).values({
				id: "grp-b1",
				orgId: "org-b",
				name: "Giao Tiếp",
				normalizedName: "giao tiếp",
			});

			// 4. Deck referencing vocab_group gets groupId = null when group is deleted (ON DELETE SET NULL)
			await db
				.update(schema.vocabDeck)
				.set({ groupId: "grp-a1" })
				.where(eq(schema.vocabDeck.id, "deck-pre-group"));

			const [groupedDeck] = await db
				.select()
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-pre-group"));
			expect(groupedDeck?.groupId).toBe("grp-a1");

			await db
				.delete(schema.vocabGroup)
				.where(eq(schema.vocabGroup.id, "grp-a1"));

			const [ungroupedDeck] = await db
				.select()
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.id, "deck-pre-group"));
			expect(ungroupedDeck).toMatchObject({
				id: "deck-pre-group",
				groupId: null,
			});
		} finally {
			client.close();
		}
	});
});
