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

			// 1. Existing deck, word, card preserved
			const [existingDeck] = await db
				.select()
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
				.select()
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

			// 3. Insert independent deck with classId = null
			await db.insert(schema.vocabDeck).values({
				id: "deck-independent",
				orgId: "org-1",
				classId: null,
				title: "Independent TOEIC Deck",
				lang: "en",
			});
			const [indepDeck] = await db
				.select()
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
});
