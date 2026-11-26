import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	extractAsciiPassageClue,
	loadReadingLibraryMetadata,
	normalizeReadingCollectionAndPart,
	normalizeReadingTitleKey,
} from "./reading-library";

const READING_DATA_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../../docs/reading-ielts/reading-practice",
);

const SHARES_TEST_ID = "b8927676-3e2d-441d-97a7-12199ef4f2ba";
const OLD_DUPLICATED_TITLE =
	"Investment in shares versus investment in other assets - which gives the greater Investment in shares versus investment in other assets - which gives the greater gain?";
const CLEAN_SHARES_TITLE =
	"Investment in shares versus investment in other assets - which gives the greater gain?";
const CLEAN_SHARES_FILENAME =
	"Collection-investment-in-shares-versus-investment-in-other-assets-which-gives-the-greater-gain.json";
const CLEAN_PASSAGE_TITLE =
	"Investment in shares versus investment in other assets";

interface ReadingIndexEntry {
	file: string;
	id: string;
	title: string;
	source: string;
	passage_number: number | null;
	question_count: number;
	question_types: string[];
}

interface ReadingPassageFile {
	id: string;
	url: string;
	title: string;
	source: string;
	passage_number: number | null;
	time_minutes: number;
	question_range: string;
	passage: {
		title: string;
		subtitle?: string;
		paragraphs: string[];
	};
	question_groups: Array<{
		range: string;
		type: string;
		questions: Array<{ number: number; text: string; answer: string }>;
	}>;
}

function findDuplicatedTitlePhrase(title: string): string | null {
	const norm = title.trim().toLowerCase();

	for (let len = 12; len <= Math.floor(norm.length / 2); len++) {
		const prefix = norm.slice(0, len);
		const secondIdx = norm.indexOf(prefix, len);
		if (secondIdx !== -1 && secondIdx - len <= 5) {
			return prefix;
		}
	}

	const words = norm
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	for (let i = 0; i <= words.length - 8; i++) {
		const phrase = words.slice(i, i + 4).join(" ");
		for (let j = i + 4; j <= words.length - 4; j++) {
			if (words.slice(j, j + 4).join(" ") === phrase) {
				return phrase;
			}
		}
	}

	return null;
}

function loadReadingIndex(): ReadingIndexEntry[] {
	return JSON.parse(
		readFileSync(join(READING_DATA_DIR, "_index.json"), "utf8"),
	) as ReadingIndexEntry[];
}

describe("reading-library dataset integrity", () => {
	test("findDuplicatedTitlePhrase flags duplicated title and accepts clean 86-char title", () => {
		expect(findDuplicatedTitlePhrase(OLD_DUPLICATED_TITLE)).not.toBeNull();
		expect(
			findDuplicatedTitlePhrase(
				"Study on investment in shares versus investment in shares versus bonds",
			),
		).toBe("investment in shares versus");
		expect(findDuplicatedTitlePhrase(CLEAN_SHARES_TITLE)).toBeNull();
	});

	test("_index.json matches all 351 passage JSON files on disk (file, id, title)", () => {
		const indexEntries = loadReadingIndex();
		expect(indexEntries).toHaveLength(351);

		const diskFiles = readdirSync(READING_DATA_DIR)
			.filter((name) => name.endsWith(".json") && name !== "_index.json")
			.sort();
		const indexFiles = indexEntries.map((entry) => entry.file).sort();
		expect(indexFiles).toEqual(diskFiles);

		for (const entry of indexEntries) {
			const data = JSON.parse(
				readFileSync(join(READING_DATA_DIR, entry.file), "utf8"),
			) as ReadingPassageFile;
			expect(data.id).toBe(entry.id);
			expect(data.title).toBe(entry.title);
		}
	}, 15_000);

	test("Investment in shares passage has clean filename, clean title, and intact structure", () => {
		const indexEntries = loadReadingIndex();
		const entry = indexEntries.find((item) => item.id === SHARES_TEST_ID);
		expect(entry).toBeDefined();
		expect(entry?.file).toBe(CLEAN_SHARES_FILENAME);
		expect(entry?.title).toBe(CLEAN_SHARES_TITLE);

		const data = JSON.parse(
			readFileSync(join(READING_DATA_DIR, entry?.file ?? ""), "utf8"),
		) as ReadingPassageFile;
		expect(data.id).toBe(SHARES_TEST_ID);
		expect(data.title).toBe(CLEAN_SHARES_TITLE);
		expect(data.passage_number).toBe(2);
		expect(data.time_minutes).toBe(20);
		expect(data.question_range).toBe("14-26");
		expect(data.passage.title).toBe(CLEAN_PASSAGE_TITLE);
		expect(data.passage.paragraphs).toHaveLength(11);
		for (const paragraph of data.passage.paragraphs) {
			expect(paragraph.trim().length).toBeGreaterThan(0);
		}
		for (const label of ["A.", "B.", "C.", "D.", "E.", "F.", "G."]) {
			expect(
				data.passage.paragraphs.some((paragraph) =>
					paragraph.trimStart().startsWith(label),
				),
			).toBe(true);
		}
		expect(data.question_groups).toHaveLength(3);
		const totalQuestions = data.question_groups.reduce(
			(sum, group) => sum + group.questions.length,
			0,
		);
		expect(totalQuestions).toBe(13);
	});

	test("no reading passage title across all 351 entries contains a duplicated phrase", () => {
		const indexEntries = loadReadingIndex();
		const offenders = indexEntries.flatMap((entry) => {
			const hit = findDuplicatedTitlePhrase(entry.title);
			return hit ? [{ id: entry.id, title: entry.title, hit }] : [];
		});
		expect(offenders).toEqual([]);
	});
});

describe("reading-library metadata normalization (#884)", () => {
	test("normalizeReadingTitleKey matches SQLite normalization and homoglyph mapping", () => {
		expect(
			normalizeReadingTitleKey("\t ‘This Marvellous Invention’ \r\n"),
		).toBe("'this marvellous invention'");
		expect(normalizeReadingTitleKey("The science of slee\u0440")).toBe(
			"the science of sleep",
		);
		expect(
			normalizeReadingTitleKey("The Farmers\uFF1Athe Past and the Present"),
		).toBe("the farmers:the past and the present");
		expect(normalizeReadingTitleKey("Nutmeg \u2013 a valuable spice")).toBe(
			"nutmeg - a valuable spice",
		);
		// Must match SQLite 1-arg TRIM (ASCII spaces only, not Unicode BOM \ufeff).
		expect(normalizeReadingTitleKey("\ufeffHello\u00a0")).toBe("\ufeffhello");
	});

	test("normalizeReadingCollectionAndPart maps sources, scrubs Step IELTS/Unknown, and handles null passage", () => {
		expect(normalizeReadingCollectionAndPart("C11T1", 2)).toEqual({
			collection: "Cambridge IELTS 11",
			testGroup: "Test 1",
			part: "p2",
			partSource: "Cambridge IELTS 11 Test 1 — Passage 2",
		});
		expect(normalizeReadingCollectionAndPart("C7T1", 2)).toEqual({
			collection: "Cambridge IELTS 7",
			testGroup: "Test 1",
			part: "p2",
			partSource: "Cambridge IELTS 7 Test 1 — Passage 2",
		});
		expect(normalizeReadingCollectionAndPart("Actual Test", 1)).toEqual({
			collection: "Actual Test",
			testGroup: "Passage 1",
			part: "p1",
			partSource: "Actual Test — Passage 1",
		});
		expect(normalizeReadingCollectionAndPart("Forecast Quý 2-2025", 3)).toEqual(
			{
				collection: "Forecast Quý 2-2025",
				testGroup: "Passage 3",
				part: "p3",
				partSource: "Forecast Quý 2-2025 — Passage 3",
			},
		);
		expect(normalizeReadingCollectionAndPart("Trainer", null)).toEqual({
			collection: "Trainer",
			testGroup: "Passage 1",
			part: "p1",
			partSource: "Trainer — Passage 1",
		});
		for (const raw of ["Step IELTS", "step-ielts", "Unknown", "  ", null]) {
			const res = normalizeReadingCollectionAndPart(raw, 2);
			expect(res.collection).toBe("Other sources");
			expect(res.testGroup).toBe("Passage 2");
			expect(res.part).toBe("p2");
			expect(res.partSource).toBe("Other sources — Passage 2");
		}
	});

	test("extractAsciiPassageClue matches whole words at boundaries and handles empty passages", () => {
		expect(extractAsciiPassageClue([])).toBe("");
		expect(
			extractAsciiPassageClue([
				"A. Termite mounds are impressive for their ventilation.",
			]),
		).toBe("termite mounds are impressive for");
	});

	test("loadReadingLibraryMetadata covers all 351 passages in 350 safe, deduplicated lookup rows", () => {
		const rows = loadReadingLibraryMetadata();
		expect(rows).toHaveLength(350);

		const collections = new Set(rows.map((r) => r.collection));
		expect(collections.size).toBe(17);
		expect(collections.has("Cambridge IELTS 7")).toBe(true);
		expect(collections.has("Cambridge IELTS 20")).toBe(true);
		expect(collections.has("Actual Test")).toBe(true);
		expect(collections.has("Collection")).toBe(true);
		expect(collections.has("Forecast Quý 2-2025")).toBe(true);
		expect(collections.has("Other sources")).toBe(true);
		expect(collections.has("Trainer")).toBe(true);

		expect(new Set(rows.map((r) => r.part))).toEqual(
			new Set(["p1", "p2", "p3"]),
		);

		// Coral reefs: 2 distinct entries with mutually exclusive clues.
		const coralRows = rows.filter((r) => r.normTitle === "coral reefs");
		expect(coralRows).toHaveLength(2);
		expect(coralRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					passageClue: "london zoo",
					collection: "Cambridge IELTS 20",
					testGroup: "Test 3",
					part: "p2",
				}),
				expect.objectContaining({
					passageClue: "calcium carbonate",
					collection: "Collection",
					testGroup: "Passage 1",
					part: "p1",
				}),
			]),
		);

		// 349/350 have pure ASCII lowercase word clues (10..40 chars); only ancient-rome has empty passage.
		const emptyClueRows = rows.filter((r) => r.passageClue === "");
		expect(emptyClueRows.map((r) => r.normTitle)).toEqual([
			"looking at daily life in ancient rome",
		]);

		// All 6 columns satisfy SQL safety, Zod bounds, and zero Step IELTS / Unknown leakage.
		const unsafeSqlTokensRe = /;|--|\/\*|-->/;
		const hasUnsafeSqlChars = (value: string): boolean => {
			if (unsafeSqlTokensRe.test(value)) return true;
			for (let i = 0; i < value.length; i++) {
				const code = value.charCodeAt(i);
				if (code <= 0x1f || code === 0x7f) return true;
			}
			return false;
		};
		const stepIeltsRe = /step[\s-]?ielts/i;
		for (const row of rows) {
			expect(row.collection.length).toBeGreaterThan(0);
			expect(row.collection.length).toBeLessThanOrEqual(200);
			expect(row.testGroup.length).toBeGreaterThan(0);
			expect(row.testGroup.length).toBeLessThanOrEqual(100);
			expect(row.partSource.length).toBeGreaterThan(0);
			expect(row.partSource.length).toBeLessThanOrEqual(200);
			expect(["p1", "p2", "p3"]).toContain(row.part);
			expect(row.normTitle).toBe(
				row.normTitle.replace(/[A-Z]/g, (c) => c.toLowerCase()),
			);
			if (row.passageClue) {
				expect(row.passageClue).toMatch(/^[a-z]+(?: [a-z]+)*$/);
				expect(row.passageClue.length).toBeGreaterThanOrEqual(10);
				expect(row.passageClue.length).toBeLessThanOrEqual(40);
			}
			for (const val of [
				row.normTitle,
				row.passageClue,
				row.collection,
				row.testGroup,
				row.part,
				row.partSource,
			]) {
				expect(hasUnsafeSqlChars(val), `unsafe SQL chars in ${val}`).toBe(
					false,
				);
				expect(stepIeltsRe.test(val), `Step IELTS leak in ${val}`).toBe(false);
			}
			expect(row.collection.toLowerCase()).not.toBe("unknown");
		}
	}, 15_000);

	test("migration 0094 lookup table stays in 1-to-1 parity with loadReadingLibraryMetadata() and D1 safety limits", () => {
		const migrationPath = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../migrations/0094_backfill_reading_library_collection_and_part.sql",
		);
		const sql = readFileSync(migrationPath, "utf8");

		// Must never use CREATE TEMP TABLE (D1 HTTP API may not share session state across statements).
		expect(/CREATE\s+TEMP(?:ORARY)?\s+TABLE/i.test(sql)).toBe(false);

		const stmts = sql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter(Boolean);
		expect(stmts.length).toBeGreaterThanOrEqual(20);

		for (const [idx, stmt] of stmts.entries()) {
			expect(stmt.endsWith(";"), `statement #${idx} missing semicolon`).toBe(
				true,
			);
			const byteLen = Buffer.byteLength(stmt, "utf8");
			expect(
				byteLen,
				`statement #${idx} exceeds 10_000 bytes (${byteLen} B)`,
			).toBeLessThan(10_000);
		}

		// Retry-safe DROP TABLE IF EXISTS at both start and end.
		expect(stmts[0]).toBe("DROP TABLE IF EXISTS `_tmp_blocked_prompt_0094`;");
		expect(stmts[1]).toBe("DROP TABLE IF EXISTS `_tmp_reading_meta_0094`;");
		expect(stmts.at(-2)).toBe(
			"DROP TABLE IF EXISTS `_tmp_blocked_prompt_0094`;",
		);
		expect(stmts.at(-1)).toBe("DROP TABLE IF EXISTS `_tmp_reading_meta_0094`;");

		// Parse every INSERT INTO `_tmp_reading_meta_0094` tuple cleanly (supporting '' SQL escapes).
		const insertStmts = stmts.filter((s) =>
			s.startsWith("INSERT INTO `_tmp_reading_meta_0094`"),
		);
		expect(insertStmts.length).toBeGreaterThanOrEqual(10);

		const parsedTuples: Array<{
			normTitle: string;
			passageClue: string;
			collection: string;
			testGroup: string;
			part: string;
			partSource: string;
		}> = [];

		for (const stmt of insertStmts) {
			const valuesIdx = stmt.indexOf("VALUES");
			expect(valuesIdx).toBeGreaterThan(0);
			const body = stmt.slice(valuesIdx + "VALUES".length).trim();
			let pos = 0;
			while (pos < body.length) {
				while (pos < body.length && /[\s,;]/.test(body[pos] ?? "")) pos++;
				if (pos >= body.length) break;
				expect(body[pos]).toBe("(");
				pos++;
				const fields: string[] = [];
				while (pos < body.length && body[pos] !== ")") {
					while (pos < body.length && /[\s,]/.test(body[pos] ?? "")) pos++;
					if (body[pos] === ")") break;
					expect(body[pos]).toBe("'");
					pos++;
					let value = "";
					while (pos < body.length) {
						if (body[pos] === "'") {
							if (body[pos + 1] === "'") {
								value += "'";
								pos += 2;
							} else {
								pos++;
								break;
							}
						} else {
							value += body[pos];
							pos++;
						}
					}
					fields.push(value);
					while (pos < body.length && body[pos] === " ") pos++;
					if (body[pos] === ",") pos++;
				}
				expect(body[pos]).toBe(")");
				pos++;
				expect(fields).toHaveLength(6);
				parsedTuples.push({
					normTitle: fields[0] ?? "",
					passageClue: fields[1] ?? "",
					collection: fields[2] ?? "",
					testGroup: fields[3] ?? "",
					part: fields[4] ?? "",
					partSource: fields[5] ?? "",
				});
			}
		}

		const expected = loadReadingLibraryMetadata();
		expect(parsedTuples).toHaveLength(expected.length);
		expect(parsedTuples).toEqual(expected);

		// Target INSERT values must never emit Step IELTS or Unknown.
		const stepIeltsRe = /step[\s-]?ielts/i;
		for (const tuple of parsedTuples) {
			for (const fieldVal of Object.values(tuple)) {
				expect(stepIeltsRe.test(fieldVal)).toBe(false);
			}
			expect(tuple.collection.toLowerCase()).not.toBe("unknown");
		}
	}, 15_000);
});
