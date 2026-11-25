import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

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
	passage_number: number;
	question_count: number;
	question_types: string[];
}

interface ReadingPassageFile {
	id: string;
	url: string;
	title: string;
	source: string;
	passage_number: number;
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
