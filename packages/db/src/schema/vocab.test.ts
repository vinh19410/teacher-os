import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

const MIGRATIONS_DIR = new URL("../migrations", import.meta.url).pathname;

describe("vocab schema & migration 0038 (#363)", () => {
	it("rehearses 0038 recreate on populated DB (preserving existing decks/words/cards + indexes) and supports classId=null + vocab_suggestion unique/upsert", async () => {
		const client = createClient({ url: ":memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const pre0038 = files.filter((f) => !f.startsWith("0038_"));
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
			const tables = await client.execute(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocab_suggestion'",
			);
			expect(tables.rows).toHaveLength(1);
		} finally {
			client.close();
		}
	});
});
