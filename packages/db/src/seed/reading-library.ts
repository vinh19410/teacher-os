import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_READING_DATA_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../../docs/reading-ielts/reading-practice",
);

const STEP_IELTS_RE = /step[\s-]?ielts/i;
const CAMBRIDGE_SOURCE_RE = /^C(\d+)T(\d+)$/i;

/**
 * Disambiguation clues for titles that appear more than once with distinct
 * metadata (collection/test_group/part). Each clue is pure lowercase ASCII
 * words verified at load time to be mutually exclusive across sibling passages.
 */
const DUPLICATE_TITLE_CLUES: Readonly<
	Record<string, Readonly<Record<string, string>>>
> = {
	"coral reefs": {
		C20T3: "london zoo",
		Collection: "calcium carbonate",
	},
};

export interface ReadingLibraryMetaEntry {
	normTitle: string;
	passageClue: string;
	collection: string;
	testGroup: string;
	part: "p1" | "p2" | "p3";
	partSource: string;
}

interface RawReadingIndexEntry {
	file: string;
	id: string;
	title: string;
	source: string;
	passage_number: number | null;
}

interface RawReadingPassageFile {
	id: string;
	title: string;
	source: string;
	passage_number: number | null;
	passage?: {
		title?: string;
		subtitle?: string;
		paragraphs?: string[];
	};
}

/**
 * Normalize a Reading test title identically to SQLite `NORM_TITLE(x)` in
 * migration 0094: replace tab/CR/LF/NBSP with ASCII space, fold curly quotes,
 * en/em dashes, full-width colon (U+FF1A), and Cyrillic small er (U+0440),
 * trim ASCII spaces only (matching 1-arg SQLite TRIM), and lowercase ASCII A-Z.
 */
export function normalizeReadingTitleKey(title: string): string {
	return title
		.replace(/[\t\r\n\u00a0]/g, " ")
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u2013\u2014]/g, "-")
		.replace(/\uFF1A/g, ":")
		.replace(/\u0440/g, "p")
		.replace(/^ +| +$/g, "")
		.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
}

/**
 * Normalize Reading `source` + `passage_number` using the same collection/group
 * taxonomy as Listening (`listening-library.ts`), scrubbing Step IELTS / Unknown
 * / blank sources into `"Other sources"` and mapping `null` passage to `p1`.
 */
export function normalizeReadingCollectionAndPart(
	rawSource: string | null | undefined,
	passageNumber: number | null | undefined,
): {
	collection: string;
	testGroup: string;
	part: "p1" | "p2" | "p3";
	partSource: string;
} {
	const passageNum =
		passageNumber === 2 || passageNumber === 3 ? passageNumber : 1;
	const part: "p1" | "p2" | "p3" =
		passageNum === 2 ? "p2" : passageNum === 3 ? "p3" : "p1";

	const trimmed = (rawSource ?? "").trim();
	const source =
		!trimmed || /^unknown$/i.test(trimmed) || STEP_IELTS_RE.test(trimmed)
			? "Other sources"
			: trimmed;

	const cambridge = CAMBRIDGE_SOURCE_RE.exec(source);
	if (cambridge) {
		const book = cambridge[1];
		const testNum = cambridge[2];
		return {
			collection: `Cambridge IELTS ${book}`,
			testGroup: `Test ${testNum}`,
			part,
			partSource: `Cambridge IELTS ${book} Test ${testNum} — Passage ${passageNum}`,
		};
	}

	return {
		collection: source,
		testGroup: `Passage ${passageNum}`,
		part,
		partSource: `${source} — Passage ${passageNum}`,
	};
}

function collectAsciiClueCandidates(paragraphs: readonly string[]): string[] {
	const nonEmpty = paragraphs
		.map((p) => p.replace(/^[A-Z]\.\s+/, "").trim())
		.filter((p) => p.length > 0);
	if (nonEmpty.length === 0) return [];

	const preferred: string[] = [];
	const fallback: string[] = [];
	const seen = new Set<string>();

	const pushUnique = (target: string[], phrase: string) => {
		if (!seen.has(phrase)) {
			seen.add(phrase);
			target.push(phrase);
		}
	};

	for (const paragraph of nonEmpty) {
		const lower = paragraph.toLowerCase();
		for (const runMatch of lower.matchAll(/\b[a-z]+(?: [a-z]+)*\b/g)) {
			const words = runMatch[0].split(" ");
			for (let start = 0; start < words.length; start++) {
				const firstWord = words[start];
				if (!firstWord) continue;
				for (let len = Math.min(5, words.length - start); len >= 2; len--) {
					const slice = words.slice(start, start + len);
					const phrase = slice.join(" ");
					if (
						len >= 3 &&
						firstWord.length >= 3 &&
						slice.every((w) => w.length >= 2) &&
						phrase.length >= 16 &&
						phrase.length <= 36
					) {
						pushUnique(preferred, phrase);
					} else if (phrase.length >= 10 && phrase.length <= 40) {
						pushUnique(fallback, phrase);
					}
				}
			}
		}
	}

	return [...preferred, ...fallback];
}

/**
 * Extract a pure lowercase ASCII whole-word phrase (10..40 chars) from a
 * passage's paragraphs so SQL backfill can verify passage identity via
 * `INSTR(LOWER(passage), clue) > 0` without HTML-escaping or quote mismatches.
 * Returns `""` only when the passage has no non-empty paragraphs.
 */
export function extractAsciiPassageClue(paragraphs: readonly string[]): string {
	const candidates = collectAsciiClueCandidates(paragraphs);
	return candidates[0] ?? "";
}

function normalizedPassageBody(paragraphs: readonly string[]): string {
	return paragraphs.join("\n").toLowerCase();
}

/**
 * Load all Reading library metadata entries from `_index.json` + individual
 * passage JSON files, deduplicating identical-metadata title duplicates and
 * enforcing mutually exclusive ASCII passage clues on conflicting titles.
 */
export function loadReadingLibraryMetadata(
	dataDir: string = DEFAULT_READING_DATA_DIR,
): ReadingLibraryMetaEntry[] {
	const indexEntries = JSON.parse(
		readFileSync(join(dataDir, "_index.json"), "utf8"),
	) as RawReadingIndexEntry[];

	interface LoadedRecord {
		file: string;
		rawSource: string;
		normTitle: string;
		paragraphs: string[];
		bodyLower: string;
		collection: string;
		testGroup: string;
		part: "p1" | "p2" | "p3";
		partSource: string;
	}

	const groups = new Map<string, LoadedRecord[]>();

	for (const entry of indexEntries) {
		const raw = JSON.parse(
			readFileSync(join(dataDir, entry.file), "utf8"),
		) as RawReadingPassageFile;
		const normTitle = normalizeReadingTitleKey(raw.title);
		const paragraphs = raw.passage?.paragraphs ?? [];
		const normalized = normalizeReadingCollectionAndPart(
			raw.source,
			raw.passage_number,
		);
		const record: LoadedRecord = {
			file: entry.file,
			rawSource: (raw.source ?? "").trim(),
			normTitle,
			paragraphs,
			bodyLower: normalizedPassageBody(paragraphs),
			...normalized,
		};
		const list = groups.get(normTitle) ?? [];
		list.push(record);
		groups.set(normTitle, list);
	}

	const result: ReadingLibraryMetaEntry[] = [];

	for (const [normTitle, records] of groups.entries()) {
		if (records.length === 1) {
			const rec = records[0];
			if (!rec) continue;
			const passageClue = extractAsciiPassageClue(rec.paragraphs);
			if (rec.paragraphs.some((p) => p.trim().length > 0) && !passageClue) {
				throw new Error(
					`Failed to extract ASCII passage clue for "${rec.file}"`,
				);
			}
			result.push({
				normTitle,
				passageClue,
				collection: rec.collection,
				testGroup: rec.testGroup,
				part: rec.part,
				partSource: rec.partSource,
			});
			continue;
		}

		// Multiple files share the same normalized title.
		const distinctMetaKeys = new Set(
			records.map(
				(r) => `${r.collection}\0${r.testGroup}\0${r.part}\0${r.partSource}`,
			),
		);

		if (distinctMetaKeys.size === 1) {
			// Same metadata: merge into 1 lookup row whose clue matches ALL files.
			const first = records[0];
			if (!first) continue;
			const allNonEmpty = records.every((r) =>
				r.paragraphs.some((p) => p.trim().length > 0),
			);
			let sharedClue = "";
			if (allNonEmpty) {
				const candidates = collectAsciiClueCandidates(first.paragraphs);
				const found = candidates.find((clue) =>
					records.every((r) => r.bodyLower.includes(clue)),
				);
				if (!found) {
					throw new Error(
						`Duplicate title "${normTitle}" shares metadata but has no common ASCII passage clue`,
					);
				}
				sharedClue = found;
			}
			result.push({
				normTitle,
				passageClue: sharedClue,
				collection: first.collection,
				testGroup: first.testGroup,
				part: first.part,
				partSource: first.partSource,
			});
			continue;
		}

		// Conflicting metadata for the same title: require explicit mutually exclusive clues.
		const clueMap = DUPLICATE_TITLE_CLUES[normTitle];
		if (!clueMap) {
			throw new Error(
				`Unhandled conflicting duplicate reading title "${normTitle}" across files: ${records.map((r) => r.file).join(", ")}`,
			);
		}

		const resolved = records.map((rec) => {
			const clue = clueMap[rec.rawSource];
			if (!clue) {
				throw new Error(
					`Missing DUPLICATE_TITLE_CLUES entry for title "${normTitle}" source "${rec.rawSource}" (${rec.file})`,
				);
			}
			return { rec, clue };
		});

		for (let i = 0; i < resolved.length; i++) {
			const current = resolved[i];
			if (!current) continue;
			if (!current.rec.bodyLower.includes(current.clue)) {
				throw new Error(
					`Passage clue "${current.clue}" not found in "${current.rec.file}"`,
				);
			}
			for (let j = 0; j < resolved.length; j++) {
				if (i === j) continue;
				const other = resolved[j];
				if (!other) continue;
				if (other.rec.bodyLower.includes(current.clue)) {
					throw new Error(
						`Passage clue "${current.clue}" for "${current.rec.file}" is not mutually exclusive with "${other.rec.file}"`,
					);
				}
			}
			result.push({
				normTitle,
				passageClue: current.clue,
				collection: current.rec.collection,
				testGroup: current.rec.testGroup,
				part: current.rec.part,
				partSource: current.rec.partSource,
			});
		}
	}

	result.sort((a, b) => {
		if (a.normTitle !== b.normTitle) {
			return a.normTitle < b.normTitle ? -1 : 1;
		}
		return a.passageClue < b.passageClue
			? -1
			: a.passageClue > b.passageClue
				? 1
				: 0;
	});

	return result;
}
