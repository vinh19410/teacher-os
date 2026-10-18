import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "../schema/index";
import {
	EXPECTED_COUNTS,
	parseVocabLibraryCsvTexts,
	seedVocabLibrary,
	verifyCounts,
} from "./vocab-library";

const MIGRATIONS_DIR = new URL("../migrations", import.meta.url).pathname;

describe("vocab-library seed pipeline (#361)", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("parses RFC4180 quoted commas, single quotes, and preserves deterministic IDs", () => {
		const parsed = parseVocabLibraryCsvTexts({
			coursesCsv: [
				"id,courseName,courseDescription,courseTarget,order",
				'6,"IELTS CƠ BẢN","Hơn 1200 từ, cụm từ IELTS","Ôn IELTS 6.5, Reading & Listening",2',
			].join("\n"),
			lessonsCsv: [
				"id,lessonName,image,order,courseId",
				'334,"Teacher\'s Awareness, Part 1",https://example.com/img.webp,84,6',
			].join("\n"),
			lessonDetailsCsv: [
				"id,lessonDetailId,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId",
				'44753,345,implement,/ˈɪmplɪment/,v,"Thực hiện, thể hiện","Họ thực hiện kế hoạch, dự án.","They implement the plan\'s goals.",https://example.com/pic.png,https://mochien3.1-api.mochidemy.com/public/audios/question/implement.mp3,334,6',
			].join("\n"),
		});

		expect(parsed.courses).toEqual([
			{
				id: "libcourse-6",
				name: "IELTS CƠ BẢN",
				description: "Hơn 1200 từ, cụm từ IELTS",
				target: "Ôn IELTS 6.5, Reading & Listening",
				sortOrder: 2,
			},
		]);
		expect(parsed.decks).toEqual([
			{
				id: "libdeck-334",
				courseId: "libcourse-6",
				title: "Teacher's Awareness, Part 1",
				imageUrl: "https://example.com/img.webp",
				sortOrder: 84,
			},
		]);
		expect(parsed.words).toEqual([
			{
				id: "libword-44753",
				deckId: "libdeck-334",
				word: "implement",
				ipa: "/ˈɪmplɪment/",
				pos: "v",
				translation: "Thực hiện, thể hiện",
				sentenceVi: "Họ thực hiện kế hoạch, dự án.",
				sentenceEn: "They implement the plan's goals.",
				pictureUrl: "https://example.com/pic.png",
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/public/audios/question/implement.mp3",
				sortOrder: 0,
			},
		]);
	});

	it("throws clear error on missing required column or duplicate key id", () => {
		expect(() =>
			parseVocabLibraryCsvTexts({
				coursesCsv: "id,courseName,courseDescription\n1,Course 1,Desc",
				lessonsCsv: "id,lessonName,image,order,courseId\n10,Lesson 1,,1,1",
				lessonDetailsCsv:
					"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,word,/w/,n,t,sv,se,,https://a.mp3,10,1",
			}),
		).toThrow(/\[courses\.csv\] missing required column "courseTarget"/);

		expect(() =>
			parseVocabLibraryCsvTexts({
				coursesCsv:
					"id,courseName,courseDescription,courseTarget,order\n1,C1,D,T,1\n1,C2,D,T,2",
				lessonsCsv: "id,lessonName,image,order,courseId\n10,Lesson 1,,1,1",
				lessonDetailsCsv:
					"id,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId\n100,word,/w/,n,t,sv,se,,https://a.mp3,10,1",
			}),
		).toThrow(/\[courses\.csv\] duplicate key column "id" value "1"/);
	});

	it("seeds all 20/968/10160 rows idempotently on libsql and verifies exact id-sets", async () => {
		const dir = mkdtempSync(join(tmpdir(), "vocab-lib-seed-test-"));
		tmpDirs.push(dir);
		const dbFile = join(dir, "test.db");

		const client = createClient({ url: `file:${dbFile}` });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

			const firstRun = await seedVocabLibrary(client);
			expect(firstRun.counts).toEqual(EXPECTED_COUNTS);

			const secondRun = await seedVocabLibrary(client);
			expect(secondRun.counts).toEqual(EXPECTED_COUNTS);

			const verification = await verifyCounts(client);
			expect(verification.ok).toBe(true);
			expect(verification.tables.course).toEqual({
				expected: EXPECTED_COUNTS.course,
				actual: EXPECTED_COUNTS.course,
				missing: 0,
				extra: 0,
				match: true,
			});
			expect(verification.tables.deck).toEqual({
				expected: EXPECTED_COUNTS.deck,
				actual: EXPECTED_COUNTS.deck,
				missing: 0,
				extra: 0,
				match: true,
			});
			expect(verification.tables.word).toEqual({
				expected: EXPECTED_COUNTS.word,
				actual: EXPECTED_COUNTS.word,
				missing: 0,
				extra: 0,
				match: true,
			});

			const sampleWord = await client.execute(
				"SELECT id FROM vocab_library_word LIMIT 1",
			);
			expect(String(sampleWord.rows[0]?.id)).toMatch(/^libword-\d+$/);

			// Swap one leaf word ID so total row count stays 10160, proving verifyCounts checks id-set rather than count only.
			await client.execute(
				"UPDATE vocab_library_word SET id = 'libword-999999' WHERE id = 'libword-44753'",
			);
			const swappedVerification = await verifyCounts(client);
			expect(swappedVerification.ok).toBe(false);
			expect(swappedVerification.tables.word.actual).toBe(EXPECTED_COUNTS.word);
			expect(swappedVerification.tables.word.missing).toBe(1);
			expect(swappedVerification.tables.word.extra).toBe(1);
			expect(swappedVerification.tables.word.match).toBe(false);
		} finally {
			client.close();
		}
	}, 30_000);
});
