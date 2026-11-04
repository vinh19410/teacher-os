import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import Papa from "papaparse";

export const EXPECTED_COUNTS = {
	course: 20,
	deck: 968,
	word: 10160,
} as const;

export const STAGING_D1_NAME_PREFIX = "teacher-os-database-staging-";
export const STAGING_D1_NAME_REGEX =
	/^teacher-os-database-staging-[a-z2-7]{16}$/;
export const PROD_D1_NAME_REGEX =
	/^teacher-os-database-(?:prod|production|main|pilot)-/i;
const D1_UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LibraryTableName =
	| "vocab_library_course"
	| "vocab_library_deck"
	| "vocab_library_word";

export interface SqlRunner {
	run(statements: string[]): Promise<void>;
	queryIds?(table: LibraryTableName): Promise<string[]>;
	queryRows?(sql: string): Promise<Array<Record<string, unknown>>>;
}

export interface VocabLibraryCourseSeedRow {
	id: string;
	name: string;
	description: string | null;
	target: string | null;
	sortOrder: number;
}

export interface VocabLibraryDeckSeedRow {
	id: string;
	courseId: string;
	title: string;
	description: string | null;
	imageUrl: string | null;
	sortOrder: number;
}

export interface VocabLibraryWordSeedRow {
	id: string;
	deckId: string;
	word: string;
	ipa: string | null;
	pos: string | null;
	translation: string;
	sentenceVi: string | null;
	sentenceEn: string | null;
	pictureUrl: string | null;
	audioUrl: string | null;
	sortOrder: number;
}

export interface ParsedVocabLibraryData {
	courses: VocabLibraryCourseSeedRow[];
	decks: VocabLibraryDeckSeedRow[];
	words: VocabLibraryWordSeedRow[];
}

export interface TableVerifyReport {
	expected: number;
	actual: number;
	missing: number;
	extra: number;
	match: boolean;
}

export interface VerifyCountsResult {
	ok: boolean;
	tables: {
		course: TableVerifyReport;
		deck: TableVerifyReport;
		word: TableVerifyReport;
	};
}

const DEFAULT_DATA_DIR = new URL(
	"../../seed-data/vocab-library",
	import.meta.url,
).pathname;

const DEFAULT_MAX_CHUNK_BYTES = 48 * 1024;

function nullIfEmpty(value: string | undefined | null): string | null {
	if (value === undefined || value === null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseIntOrFallback(
	value: string | undefined | null,
	fallback: number,
): number {
	if (value === undefined || value === null) return fallback;
	const trimmed = value.trim();
	if (trimmed.length === 0) return fallback;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function sqlLiteral(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
	}
	return `'${value.replace(/'/g, "''")}'`;
}

function parseCsvFile(
	csvText: string,
	fileName: string,
	requiredColumns: readonly string[],
): Array<Record<string, string>> {
	const parsed = Papa.parse<Record<string, string>>(csvText, {
		header: true,
		skipEmptyLines: true,
	});

	const fatalError = parsed.errors.find((err) => err.type === "Quotes");
	if (fatalError) {
		throw new Error(
			`[${fileName}] CSV parse error at row ${fatalError.row ?? "?"}: ${fatalError.message}`,
		);
	}

	const fields = new Set(parsed.meta.fields ?? []);
	for (const col of requiredColumns) {
		if (!fields.has(col)) {
			throw new Error(
				`[${fileName}] missing required column "${col}" (found: ${[...fields].join(", ")})`,
			);
		}
	}

	const seenIds = new Set<string>();
	for (let i = 0; i < parsed.data.length; i++) {
		const row = parsed.data[i] ?? {};
		const rawId = (row.id ?? "").trim();
		if (!rawId) {
			throw new Error(`[${fileName}] empty key column "id" at row index ${i}`);
		}
		if (seenIds.has(rawId)) {
			throw new Error(
				`[${fileName}] duplicate key column "id" value "${rawId}"`,
			);
		}
		seenIds.add(rawId);
	}

	return parsed.data;
}

export function parseVocabLibraryCsvTexts(input: {
	coursesCsv: string;
	lessonsCsv: string;
	lessonDetailsCsv: string;
}): ParsedVocabLibraryData {
	const rawCourses = parseCsvFile(input.coursesCsv, "courses.csv", [
		"id",
		"courseName",
		"courseDescription",
		"courseTarget",
		"order",
	]);
	const rawLessons = parseCsvFile(input.lessonsCsv, "lessons.csv", [
		"id",
		"lessonName",
		"lessonDescription",
		"image",
		"order",
		"courseId",
	]);
	const rawWords = parseCsvFile(input.lessonDetailsCsv, "lesson_details.csv", [
		"id",
		"content",
		"phonetic",
		"position",
		"trans",
		"sentenceVi",
		"sentenceEn",
		"picture",
		"audio",
		"lessonId",
		"courseId",
	]);

	const courses: VocabLibraryCourseSeedRow[] = rawCourses.map((row, idx) => ({
		id: `libcourse-${(row.id ?? "").trim()}`,
		name: (row.courseName ?? "").trim(),
		description: nullIfEmpty(row.courseDescription),
		target: nullIfEmpty(row.courseTarget),
		sortOrder: parseIntOrFallback(row.order, idx),
	}));
	const courseIdSet = new Set(courses.map((c) => c.id));

	const decks: VocabLibraryDeckSeedRow[] = rawLessons.map((row, idx) => {
		const courseId = `libcourse-${(row.courseId ?? "").trim()}`;
		if (!courseIdSet.has(courseId)) {
			throw new Error(
				`[lessons.csv] orphan courseId "${row.courseId}" on lesson id "${row.id}"`,
			);
		}
		return {
			id: `libdeck-${(row.id ?? "").trim()}`,
			courseId,
			title: (row.lessonName ?? "").trim(),
			description: nullIfEmpty(row.lessonDescription),
			imageUrl: nullIfEmpty(row.image),
			sortOrder: parseIntOrFallback(row.order, idx),
		};
	});
	const deckIdSet = new Set(decks.map((d) => d.id));

	const perDeckCounter = new Map<string, number>();
	const words: VocabLibraryWordSeedRow[] = rawWords.map((row) => {
		const deckId = `libdeck-${(row.lessonId ?? "").trim()}`;
		if (!deckIdSet.has(deckId)) {
			throw new Error(
				`[lesson_details.csv] orphan lessonId "${row.lessonId}" on word id "${row.id}"`,
			);
		}
		const nextIdx = perDeckCounter.get(deckId) ?? 0;
		perDeckCounter.set(deckId, nextIdx + 1);
		return {
			id: `libword-${(row.id ?? "").trim()}`,
			deckId,
			word: (row.content ?? "").trim(),
			ipa: nullIfEmpty(row.phonetic),
			pos: nullIfEmpty(row.position),
			translation: (row.trans ?? "").trim(),
			sentenceVi: nullIfEmpty(row.sentenceVi),
			sentenceEn: nullIfEmpty(row.sentenceEn),
			pictureUrl: nullIfEmpty(row.picture),
			audioUrl: nullIfEmpty(row.audio),
			sortOrder: parseIntOrFallback(row.order, nextIdx),
		};
	});

	return { courses, decks, words };
}

export function loadVocabLibraryCsvData(
	dataDir: string = DEFAULT_DATA_DIR,
): ParsedVocabLibraryData {
	const coursesCsv = readFileSync(join(dataDir, "courses.csv"), "utf8");
	const lessonsCsv = readFileSync(join(dataDir, "lessons.csv"), "utf8");
	const lessonDetailsCsv = readFileSync(
		join(dataDir, "lesson_details.csv"),
		"utf8",
	);
	return parseVocabLibraryCsvTexts({
		coursesCsv,
		lessonsCsv,
		lessonDetailsCsv,
	});
}

function chunkInsertStatements(
	prefixSql: string,
	suffixSql: string,
	valueTuples: readonly string[],
	maxChunkBytes: number,
): string[] {
	if (valueTuples.length === 0) return [];
	const statements: string[] = [];
	const overheadBytes =
		Buffer.byteLength(prefixSql, "utf8") +
		Buffer.byteLength(suffixSql, "utf8") +
		16;

	let currentTuples: string[] = [];
	let currentBytes = overheadBytes;

	for (const tuple of valueTuples) {
		const tupleBytes = Buffer.byteLength(tuple, "utf8") + 2;
		if (currentTuples.length > 0 && currentBytes + tupleBytes > maxChunkBytes) {
			statements.push(`${prefixSql}${currentTuples.join(",")}${suffixSql}`);
			currentTuples = [tuple];
			currentBytes = overheadBytes + tupleBytes;
		} else {
			currentTuples.push(tuple);
			currentBytes += tupleBytes;
		}
	}

	if (currentTuples.length > 0) {
		statements.push(`${prefixSql}${currentTuples.join(",")}${suffixSql}`);
	}

	return statements;
}

export function buildVocabLibraryUpsertStatements(
	data: ParsedVocabLibraryData,
	options?: { prune?: boolean; maxChunkBytes?: number },
): string[] {
	const maxChunkBytes = options?.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
	const statements: string[] = [];

	if (options?.prune) {
		statements.push(
			"DELETE FROM vocab_library_word WHERE id LIKE 'libword-%';",
			"DELETE FROM vocab_library_deck WHERE id LIKE 'libdeck-%';",
			"DELETE FROM vocab_library_course WHERE id LIKE 'libcourse-%';",
		);
	}

	const courseTuples = data.courses.map(
		(c) =>
			`(${sqlLiteral(c.id)},${sqlLiteral(c.name)},${sqlLiteral(c.description)},${sqlLiteral(c.target)},${sqlLiteral(c.sortOrder)})`,
	);
	statements.push(
		...chunkInsertStatements(
			"INSERT INTO vocab_library_course (id, name, description, target, sort_order) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, target = excluded.target, sort_order = excluded.sort_order, updated_at = (cast(unixepoch('subsecond') * 1000 as integer));",
			courseTuples,
			maxChunkBytes,
		),
	);

	const deckTuples = data.decks.map(
		(d) =>
			`(${sqlLiteral(d.id)},${sqlLiteral(d.courseId)},${sqlLiteral(d.title)},${sqlLiteral(d.description)},${sqlLiteral(d.imageUrl)},${sqlLiteral(d.sortOrder)})`,
	);
	statements.push(
		...chunkInsertStatements(
			"INSERT INTO vocab_library_deck (id, course_id, title, description, image_url, sort_order) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, title = excluded.title, description = excluded.description, image_url = excluded.image_url, sort_order = excluded.sort_order, updated_at = (cast(unixepoch('subsecond') * 1000 as integer));",
			deckTuples,
			maxChunkBytes,
		),
	);

	const wordTuples = data.words.map(
		(w) =>
			`(${sqlLiteral(w.id)},${sqlLiteral(w.deckId)},${sqlLiteral(w.word)},${sqlLiteral(w.ipa)},${sqlLiteral(w.pos)},${sqlLiteral(w.translation)},${sqlLiteral(w.sentenceVi)},${sqlLiteral(w.sentenceEn)},${sqlLiteral(w.pictureUrl)},${sqlLiteral(w.audioUrl)},${sqlLiteral(w.sortOrder)})`,
	);
	statements.push(
		...chunkInsertStatements(
			"INSERT INTO vocab_library_word (id, deck_id, word, ipa, pos, translation, sentence_vi, sentence_en, picture_url, audio_url, sort_order) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET deck_id = excluded.deck_id, word = excluded.word, ipa = excluded.ipa, pos = excluded.pos, translation = excluded.translation, sentence_vi = excluded.sentence_vi, sentence_en = excluded.sentence_en, picture_url = excluded.picture_url, audio_url = excluded.audio_url, sort_order = excluded.sort_order, updated_at = (cast(unixepoch('subsecond') * 1000 as integer));",
			wordTuples,
			maxChunkBytes,
		),
	);

	if (options?.prune) {
		statements.push(
			"DELETE FROM vocab_card WHERE word_id LIKE 'libword-%' AND NOT EXISTS (SELECT 1 FROM vocab_library_word WHERE vocab_library_word.id = vocab_card.word_id);",
		);
	}

	return statements;
}

export function createLibsqlRunner(client: Client): SqlRunner {
	return {
		async run(statements: string[]) {
			if (statements.length === 0) return;
			await client.batch(statements, "write");
		},
		async queryIds(table: LibraryTableName): Promise<string[]> {
			const res = await client.execute(`SELECT id FROM ${table}`);
			return res.rows.map((r) => String(r.id));
		},
		async queryRows(sql: string): Promise<Array<Record<string, unknown>>> {
			const res = await client.execute(sql);
			return res.rows.map((r) => ({ ...(r as Record<string, unknown>) }));
		},
	};
}

function resolveRunner(runnerOrClient: SqlRunner | Client): SqlRunner {
	if ("run" in runnerOrClient && typeof runnerOrClient.run === "function") {
		return runnerOrClient;
	}
	return createLibsqlRunner(runnerOrClient as Client);
}

export async function seedVocabLibrary(
	runnerOrClient: SqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedVocabLibraryData;
		prune?: boolean;
		maxChunkBytes?: number;
	},
): Promise<{ statementsExecuted: number; counts: typeof EXPECTED_COUNTS }> {
	const runner = resolveRunner(runnerOrClient);
	const data = options?.data ?? loadVocabLibraryCsvData(options?.dataDir);
	const statements = buildVocabLibraryUpsertStatements(data, {
		prune: options?.prune,
		maxChunkBytes: options?.maxChunkBytes,
	});
	await runner.run(statements);
	return {
		statementsExecuted: statements.length,
		counts: {
			course: data.courses.length as typeof EXPECTED_COUNTS.course,
			deck: data.decks.length as typeof EXPECTED_COUNTS.deck,
			word: data.words.length as typeof EXPECTED_COUNTS.word,
		},
	};
}

function compareIdSet(
	expectedIds: readonly string[],
	actualIds: readonly string[],
): TableVerifyReport {
	const expectedSet = new Set(expectedIds);
	const actualSet = new Set(actualIds);
	let missing = 0;
	for (const id of expectedSet) {
		if (!actualSet.has(id)) missing++;
	}
	let extra = 0;
	for (const id of actualSet) {
		if (!expectedSet.has(id)) extra++;
	}
	const match =
		expectedIds.length === actualIds.length && missing === 0 && extra === 0;
	return {
		expected: expectedIds.length,
		actual: actualIds.length,
		missing,
		extra,
		match,
	};
}

export async function verifyCounts(
	runnerOrClient: SqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedVocabLibraryData;
	},
): Promise<VerifyCountsResult> {
	const runner = resolveRunner(runnerOrClient);
	if (!runner.queryIds) {
		throw new Error(
			"SqlRunner does not implement queryIds(table) required for verifyCounts",
		);
	}
	const data = options?.data ?? loadVocabLibraryCsvData(options?.dataDir);
	const [courseIds, deckIds, wordIds] = await Promise.all([
		runner.queryIds("vocab_library_course"),
		runner.queryIds("vocab_library_deck"),
		runner.queryIds("vocab_library_word"),
	]);

	const course = compareIdSet(
		data.courses.map((c) => c.id),
		courseIds,
	);
	const deck = compareIdSet(
		data.decks.map((d) => d.id),
		deckIds,
	);
	const word = compareIdSet(
		data.words.map((w) => w.id),
		wordIds,
	);

	return {
		ok: course.match && deck.match && word.match,
		tables: { course, deck, word },
	};
}

function compareCodeUnitId(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function toNullableString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return String(value);
}

const WORD_PARITY_PAGE_SIZE = 4000;

export async function verifyContentParity(
	runnerOrClient: SqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedVocabLibraryData;
	},
): Promise<boolean> {
	const runner = resolveRunner(runnerOrClient);
	if (!runner.queryRows) {
		throw new Error(
			"SqlRunner does not implement queryRows(sql) required for verifyContentParity",
		);
	}
	const data = options?.data ?? loadVocabLibraryCsvData(options?.dataDir);

	const expectedHash = createHash("sha256");
	for (const c of [...data.courses].sort(compareCodeUnitId)) {
		expectedHash.update(
			`${JSON.stringify(["course", c.id, c.name, c.description, c.target, c.sortOrder])}\n`,
		);
	}
	for (const d of [...data.decks].sort(compareCodeUnitId)) {
		expectedHash.update(
			`${JSON.stringify(["deck", d.id, d.courseId, d.title, d.description, d.imageUrl, d.sortOrder])}\n`,
		);
	}
	for (const w of [...data.words].sort(compareCodeUnitId)) {
		expectedHash.update(
			`${JSON.stringify(["word", w.id, w.deckId, w.word, w.ipa, w.pos, w.translation, w.sentenceVi, w.sentenceEn, w.pictureUrl, w.audioUrl, w.sortOrder])}\n`,
		);
	}

	const actualHash = createHash("sha256");
	const [courseRows, deckRows] = await Promise.all([
		runner.queryRows(
			"SELECT id, name, description, target, sort_order FROM vocab_library_course ORDER BY id ASC;",
		),
		runner.queryRows(
			"SELECT id, course_id, title, description, image_url, sort_order FROM vocab_library_deck ORDER BY id ASC;",
		),
	]);

	for (const r of courseRows) {
		actualHash.update(
			`${JSON.stringify([
				"course",
				String(r.id),
				String(r.name),
				toNullableString(r.description),
				toNullableString(r.target),
				Number(r.sort_order),
			])}\n`,
		);
	}
	for (const r of deckRows) {
		actualHash.update(
			`${JSON.stringify([
				"deck",
				String(r.id),
				String(r.course_id),
				String(r.title),
				toNullableString(r.description),
				toNullableString(r.image_url),
				Number(r.sort_order),
			])}\n`,
		);
	}

	for (let offset = 0; ; offset += WORD_PARITY_PAGE_SIZE) {
		const wordRows = await runner.queryRows(
			`SELECT id, deck_id, word, ipa, pos, translation, sentence_vi, sentence_en, picture_url, audio_url, sort_order FROM vocab_library_word ORDER BY id ASC LIMIT ${WORD_PARITY_PAGE_SIZE} OFFSET ${offset};`,
		);
		for (const r of wordRows) {
			actualHash.update(
				`${JSON.stringify([
					"word",
					String(r.id),
					String(r.deck_id),
					String(r.word),
					toNullableString(r.ipa),
					toNullableString(r.pos),
					String(r.translation),
					toNullableString(r.sentence_vi),
					toNullableString(r.sentence_en),
					toNullableString(r.picture_url),
					toNullableString(r.audio_url),
					Number(r.sort_order),
				])}\n`,
			);
		}
		if (wordRows.length < WORD_PARITY_PAGE_SIZE) {
			break;
		}
	}

	return expectedHash.digest("hex") === actualHash.digest("hex");
}

interface CloudflareD1ListResponse {
	success?: boolean;
	errors?: Array<{ message?: string }>;
	result?: Array<{ uuid?: string; name?: string }>;
	result_info?: {
		page?: number;
		per_page?: number;
		count?: number;
		total_count?: number;
		total_pages?: number;
	};
}

interface CloudflareD1GetResponse {
	success?: boolean;
	errors?: Array<{ message?: string }>;
	result?: { uuid?: string; name?: string };
}

async function fetchGetWithRetry(
	fetchFn: typeof fetch,
	url: string,
	apiToken: string,
	timeoutMs: number,
): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetchFn(url, {
			method: "GET",
			headers: {
				authorization: `Bearer ${apiToken}`,
			},
			signal: AbortSignal.timeout(timeoutMs),
		});
		if ((res.status === 429 || res.status >= 500) && attempt === 0) {
			continue;
		}
		return res;
	}
}

export async function resolveStagingD1DatabaseId(options: {
	stage: string;
	accountId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<string> {
	if (options.stage !== "staging") {
		throw new Error(
			`Unsupported --d1-stage "${options.stage}": automatic D1 lookup is restricted to "staging" (production is blocked by license gate).`,
		);
	}
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database?name=${encodeURIComponent(STAGING_D1_NAME_PREFIX)}&per_page=100`;

	const res = await fetchGetWithRetry(
		fetchFn,
		url,
		options.apiToken,
		timeoutMs,
	);
	const raw = await res.text();
	let payload: CloudflareD1ListResponse = {};
	try {
		payload = JSON.parse(raw) as CloudflareD1ListResponse;
	} catch {
		throw new Error(`D1 list databases failed (${res.status}): invalid JSON`);
	}
	if (!res.ok || payload.success !== true) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(`D1 list databases failed (${res.status}): ${errMsg}`);
	}

	const resultList = Array.isArray(payload.result) ? payload.result : [];
	const totalPages = payload.result_info?.total_pages;
	const totalCount = payload.result_info?.total_count;
	if (
		(typeof totalPages === "number" && totalPages > 1) ||
		(typeof totalCount === "number" && totalCount > resultList.length)
	) {
		throw new Error(
			"D1 list databases truncated by pagination; refusing partial staging lookup.",
		);
	}

	const matches = resultList.filter(
		(
			db,
		): db is {
			uuid: string;
			name: string;
		} =>
			typeof db.uuid === "string" &&
			D1_UUID_REGEX.test(db.uuid) &&
			typeof db.name === "string" &&
			STAGING_D1_NAME_REGEX.test(db.name),
	);
	const [match] = matches;
	if (matches.length !== 1 || !match) {
		throw new Error(
			`Expected exactly 1 staging D1 database matching ${STAGING_D1_NAME_REGEX}, found ${matches.length}.`,
		);
	}
	return match.uuid;
}

export async function assertNonProdD1Database(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<void> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database/${encodeURIComponent(options.databaseId)}`;

	const res = await fetchGetWithRetry(
		fetchFn,
		url,
		options.apiToken,
		timeoutMs,
	);
	const raw = await res.text();
	let payload: CloudflareD1GetResponse = {};
	try {
		payload = JSON.parse(raw) as CloudflareD1GetResponse;
	} catch {
		throw new Error(`D1 get database failed (${res.status}): invalid JSON`);
	}
	if (!res.ok || payload.success !== true || !payload.result?.name) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(`D1 get database failed (${res.status}): ${errMsg}`);
	}
	if (PROD_D1_NAME_REGEX.test(payload.result.name)) {
		throw new Error(
			`Target D1 database "${payload.result.name}" is blocked by license gate: seeding production D1 requires written project-owner sign-off.`,
		);
	}
}

export interface EnsureVocabLibrarySeedResult {
	seeded: boolean;
	statementsExecuted: number;
	counts: {
		course: number;
		deck: number;
		word: number;
	};
	verification?: VerifyCountsResult;
}

export async function ensureVocabLibrarySeeded(
	runnerOrClient: SqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedVocabLibraryData;
		prune?: boolean;
		ifNeeded?: boolean;
		verify?: boolean;
		maxChunkBytes?: number;
	},
): Promise<EnsureVocabLibrarySeedResult> {
	const runner = resolveRunner(runnerOrClient);
	const data = options?.data ?? loadVocabLibraryCsvData(options?.dataDir);
	const expectedCounts = {
		course: data.courses.length,
		deck: data.decks.length,
		word: data.words.length,
	};

	if (options?.ifNeeded && !options?.prune) {
		if (!runner.queryRows) {
			throw new Error(
				"SqlRunner does not implement queryRows(sql) required for --if-needed verifyContentParity",
			);
		}
		const precheck = await verifyCounts(runner, { data });
		if (precheck.ok && (await verifyContentParity(runner, { data }))) {
			return {
				seeded: false,
				statementsExecuted: 0,
				counts: expectedCounts,
				verification: precheck,
			};
		}
	}

	const seedRes = await seedVocabLibrary(runner, {
		data,
		prune: options?.prune,
		maxChunkBytes: options?.maxChunkBytes,
	});
	const verification =
		options?.verify || options?.ifNeeded
			? await verifyCounts(runner, { data })
			: undefined;

	return {
		seeded: true,
		statementsExecuted: seedRes.statementsExecuted,
		counts: expectedCounts,
		verification,
	};
}
