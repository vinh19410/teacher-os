import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { z } from "zod";
import {
	assertNonProdD1Database,
	createLibsqlRunner,
	PROD_D1_NAME_REGEX,
	resolveStagingD1DatabaseId,
	STAGING_D1_NAME_PREFIX,
	STAGING_D1_NAME_REGEX,
	type TableVerifyReport,
} from "./vocab-library";

export type { TableVerifyReport };
export {
	assertNonProdD1Database,
	createLibsqlRunner,
	PROD_D1_NAME_REGEX,
	resolveStagingD1DatabaseId,
	STAGING_D1_NAME_PREFIX,
	STAGING_D1_NAME_REGEX,
};

export const SYSTEM_PACK_ID_PREFIX = "syspack-";
export const SYSTEM_EXERCISE_ID_PREFIX = "sysex-";
export const SYSTEM_ITEM_ID_PREFIX = "syspackitem-";

/**
 * Only prefixes listed here are managed, verified, and pruned by the study-pack
 * seed pipeline, so admin-created system rows (`syspack-admin-custom`, etc.)
 * are never modified or deleted.
 */
export const MANAGED_PACK_ID_PREFIXES = [
	"syspack-foun-gt1-",
	"syspack-first-step-gt2",
] as const;
export const MANAGED_EXERCISE_ID_PREFIXES = [
	"sysex-foun-gt1-",
	"sysex-first-step-gt2-",
] as const;
export const MANAGED_ITEM_ID_PREFIXES = [
	"syspackitem-foun-gt1-",
	"syspackitem-first-step-gt2-",
] as const;

export const EXPECTED_STUDY_PACK_COUNTS = {
	pack: 2,
	exercise: 131,
	item: 131,
} as const;

export const DEFAULT_STUDY_PACK_DATA_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../seed-data/study-packs",
);

const DEFAULT_D1_CHUNK_BYTES = 45_000;

export interface StudyPackSqlRunner {
	run(statements: string[]): Promise<void>;
	queryRows?: (sql: string) => Promise<Array<Record<string, unknown>>>;
}

const ALLOWED_STUDY_PACK_AUDIO_HOSTS = new Set([
	"www.listenaminute.com",
	"listenaminute.com",
	"lingua.com",
	"www.lingua.com",
]);

const STUDY_PACK_AUDIO_KEY_REGEX = /^study-packs\/[a-z0-9-]+\/[a-z0-9-]+\.mp3$/;

function isValidSeedAudioKey(raw: string): boolean {
	const trimmed = raw.trim();
	return (
		trimmed.length > 0 &&
		trimmed.length <= 500 &&
		STUDY_PACK_AUDIO_KEY_REGEX.test(trimmed)
	);
}

function buildManagedPrefixClause(
	column: string,
	prefixes: readonly string[],
): string {
	return `(${prefixes.map((p) => `${column} LIKE '${p}%'`).join(" OR ")})`;
}
function isValidSeedAudioUrl(raw: string): boolean {
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > 500) return false;
	try {
		const url = new URL(trimmed);
		return (
			url.protocol === "https:" &&
			url.username === "" &&
			url.password === "" &&
			url.port === "" &&
			ALLOWED_STUDY_PACK_AUDIO_HOSTS.has(url.hostname) &&
			/\.mp3$/i.test(url.pathname)
		);
	} catch {
		return false;
	}
}

const seedQuestionSchema = z
	.object({
		stem: z.string().trim().min(1),
		opts: z.array(z.string()).max(8).nullable().optional(),
		answer: z.string().trim().min(1),
		alts: z.string().optional(),
		type: z.string().trim().min(1).optional(),
		pin: z
			.object({
				x: z.number().min(0).max(100),
				y: z.number().min(0).max(100),
			})
			.nullable()
			.optional(),
		explanation: z.string().optional(),
		answerSet: z.string().trim().min(1).optional(),
	})
	.strict();

const seedExerciseSchema = z
	.object({
		id: z.string().regex(/^sysex-[a-z0-9-]+$/),
		skill: z.enum(["reading", "listening", "grammar", "vocabulary"]),
		part: z.string(),
		type: z.string().min(1),
		title: z.string().min(1),
		band: z.string(),
		level: z.string().min(1),
		intro: z.string(),
		passage: z.string(),
		audioUrl: z.string(),
		audioKey: z.string().trim().max(500).optional().default(""),
		transcript: z.string(),
		questions: z.array(seedQuestionSchema).min(1),
		optionBank: z.array(z.string()),
		note: z.string(),
		status: z.enum(["draft", "ready"]),
	})
	.superRefine((exercise, ctx) => {
		const hasUrl = exercise.audioUrl.trim() !== "";
		const hasKey = exercise.audioKey.trim() !== "";
		if (exercise.skill === "listening") {
			if (!hasUrl && !hasKey) {
				ctx.addIssue({
					code: "custom",
					path: ["audioUrl"],
					message:
						"listening seed exercise requires valid allowlisted https mp3 audioUrl or R2 audioKey",
				});
			}
			if (hasUrl && !isValidSeedAudioUrl(exercise.audioUrl)) {
				ctx.addIssue({
					code: "custom",
					path: ["audioUrl"],
					message:
						"listening seed exercise requires valid allowlisted https mp3 audioUrl",
				});
			}
			if (hasKey && !isValidSeedAudioKey(exercise.audioKey)) {
				ctx.addIssue({
					code: "custom",
					path: ["audioKey"],
					message:
						"listening seed exercise audioKey must match study-packs/<pack>/<id>.mp3",
				});
			}
		} else {
			if (hasUrl) {
				ctx.addIssue({
					code: "custom",
					path: ["audioUrl"],
					message: "non-listening seed exercise must have empty audioUrl",
				});
			}
			if (hasKey) {
				ctx.addIssue({
					code: "custom",
					path: ["audioKey"],
					message: "non-listening seed exercise must have empty audioKey",
				});
			}
		}
	});

const seedPackSchema = z.object({
	id: z.string().startsWith(SYSTEM_PACK_ID_PREFIX),
	title: z.string().min(1),
	description: z.string(),
	level: z.string().min(1),
	status: z.enum(["draft", "ready"]),
});

const seedPackItemSchema = z.object({
	id: z.string().startsWith(SYSTEM_ITEM_ID_PREFIX),
	packId: z.string().startsWith(SYSTEM_PACK_ID_PREFIX),
	dayIndex: z.number().int().min(1).max(366),
	sourceKind: z.literal("library_exercise"),
	sourceId: z.string().startsWith(SYSTEM_EXERCISE_ID_PREFIX),
	note: z.string(),
});

const seedPackBundleSchema = z.object({
	pack: seedPackSchema,
	exercises: z.array(seedExerciseSchema).min(1),
	items: z.array(seedPackItemSchema).min(1),
});

export type StudyPackSeedRow = z.infer<typeof seedPackSchema>;
export type LibraryExerciseSeedRow = z.infer<typeof seedExerciseSchema>;
export type StudyPackItemSeedRow = z.infer<typeof seedPackItemSchema>;

export interface ParsedStudyPackSeedData {
	packs: StudyPackSeedRow[];
	exercises: LibraryExerciseSeedRow[];
	items: StudyPackItemSeedRow[];
}

export interface VerifyStudyPackCountsResult {
	ok: boolean;
	tables: {
		pack: TableVerifyReport;
		exercise: TableVerifyReport;
		item: TableVerifyReport;
	};
}

export function sqlQuoteString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function loadStudyPackSeedData(
	dataDir: string = DEFAULT_STUDY_PACK_DATA_DIR,
): ParsedStudyPackSeedData {
	const fileNames = readdirSync(dataDir)
		.filter(
			(name) =>
				name.endsWith(".json") && !name.endsWith(".audio-manifest.json"),
		)
		.sort((a, b) => a.localeCompare(b));
	if (fileNames.length === 0) {
		throw new Error(`[study-packs] No JSON seed files found in ${dataDir}`);
	}

	const packs: StudyPackSeedRow[] = [];
	const exercises: LibraryExerciseSeedRow[] = [];
	const items: StudyPackItemSeedRow[] = [];
	const seenPackIds = new Set<string>();
	const seenExerciseIds = new Set<string>();
	const seenItemIds = new Set<string>();

	for (const fileName of fileNames) {
		const rawText = readFileSync(join(dataDir, fileName), "utf8");
		const parsed = seedPackBundleSchema.parse(JSON.parse(rawText));

		if (seenPackIds.has(parsed.pack.id)) {
			throw new Error(`[study-packs] Duplicate pack id: ${parsed.pack.id}`);
		}
		seenPackIds.add(parsed.pack.id);
		packs.push(parsed.pack);

		const bundleExerciseIds = new Set<string>();
		for (const exercise of parsed.exercises) {
			if (seenExerciseIds.has(exercise.id)) {
				throw new Error(`[study-packs] Duplicate exercise id: ${exercise.id}`);
			}
			seenExerciseIds.add(exercise.id);
			bundleExerciseIds.add(exercise.id);
			exercises.push(exercise);
		}

		const seenDayIndices = new Set<number>();
		for (const item of parsed.items) {
			if (item.packId !== parsed.pack.id) {
				throw new Error(
					`[study-packs] Item ${item.id} packId (${item.packId}) does not match ${parsed.pack.id}`,
				);
			}
			if (!bundleExerciseIds.has(item.sourceId)) {
				throw new Error(
					`[study-packs] Item ${item.id} references unknown exercise ${item.sourceId}`,
				);
			}
			if (seenDayIndices.has(item.dayIndex)) {
				throw new Error(
					`[study-packs] Duplicate dayIndex ${item.dayIndex} in pack ${parsed.pack.id}`,
				);
			}
			seenDayIndices.add(item.dayIndex);
			if (seenItemIds.has(item.id)) {
				throw new Error(`[study-packs] Duplicate item id: ${item.id}`);
			}
			seenItemIds.add(item.id);
			items.push(item);
		}
	}

	return { packs, exercises, items };
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
			statements.push(`${prefixSql}${currentTuples.join(", ")}${suffixSql}`);
			currentTuples = [];
			currentBytes = overheadBytes;
		}
		currentTuples.push(tuple);
		currentBytes += tupleBytes;
	}

	if (currentTuples.length > 0) {
		statements.push(`${prefixSql}${currentTuples.join(", ")}${suffixSql}`);
	}

	return statements;
}

export function buildStudyPackUpsertStatements(
	data: ParsedStudyPackSeedData,
	options?: { prune?: boolean; maxChunkBytes?: number },
): string[] {
	const maxChunkBytes = options?.maxChunkBytes ?? DEFAULT_D1_CHUNK_BYTES;
	const statements: string[] = [];
	const nowExpr = "(cast(unixepoch('subsecond') * 1000 as integer))";

	statements.push(
		...chunkInsertStatements(
			"INSERT INTO study_pack_exercise (id, skill, part, type, title, band, level, intro, passage, audio_url, audio_key, transcript, questions, option_bank, note, status, created_by, created_at, updated_at) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET skill = excluded.skill, part = excluded.part, type = excluded.type, title = excluded.title, band = excluded.band, level = excluded.level, intro = excluded.intro, passage = excluded.passage, audio_url = excluded.audio_url, audio_key = excluded.audio_key, transcript = excluded.transcript, questions = excluded.questions, option_bank = excluded.option_bank, note = excluded.note, status = excluded.status, updated_at = (cast(unixepoch('subsecond') * 1000 as integer));",
			data.exercises.map(
				(ex) =>
					`(${sqlQuoteString(ex.id)}, ${sqlQuoteString(ex.skill)}, ${sqlQuoteString(ex.part)}, ${sqlQuoteString(ex.type)}, ${sqlQuoteString(ex.title)}, ${sqlQuoteString(ex.band)}, ${sqlQuoteString(ex.level)}, ${sqlQuoteString(ex.intro)}, ${sqlQuoteString(ex.passage)}, ${sqlQuoteString(ex.audioUrl)}, ${ex.audioKey ? sqlQuoteString(ex.audioKey) : "NULL"}, ${sqlQuoteString(ex.transcript)}, ${sqlQuoteString(JSON.stringify(ex.questions))}, ${sqlQuoteString(JSON.stringify(ex.optionBank))}, ${sqlQuoteString(ex.note)}, ${sqlQuoteString(ex.status)}, NULL, ${nowExpr}, ${nowExpr})`,
			),
			maxChunkBytes,
		),
	);

	const packTuples = data.packs.map(
		(pack) =>
			`(${sqlQuoteString(pack.id)}, NULL, ${sqlQuoteString(pack.title)}, ${sqlQuoteString(pack.description)}, ${sqlQuoteString(pack.level)}, ${sqlQuoteString(pack.status)}, NULL, NULL, ${nowExpr}, ${nowExpr})`,
	);
	statements.push(
		...chunkInsertStatements(
			"INSERT INTO study_pack (id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET org_id = NULL, title = excluded.title, description = excluded.description, level = excluded.level, status = excluded.status, updated_at = (cast(unixepoch('subsecond') * 1000 as integer));",
			packTuples,
			maxChunkBytes,
		),
	);

	const itemTuples = data.items.map(
		(item) =>
			`(${sqlQuoteString(item.id)}, ${sqlQuoteString(item.packId)}, ${item.dayIndex}, 0, ${sqlQuoteString(item.sourceKind)}, ${sqlQuoteString(item.sourceId)}, ${sqlQuoteString(item.note)})`,
	);
	statements.push(
		...chunkInsertStatements(
			"INSERT INTO study_pack_item (id, pack_id, day_index, position, source_kind, source_id, note) VALUES ",
			" ON CONFLICT(id) DO UPDATE SET pack_id = excluded.pack_id, day_index = excluded.day_index, position = excluded.position, source_kind = excluded.source_kind, source_id = excluded.source_id, note = excluded.note;",
			itemTuples,
			maxChunkBytes,
		),
	);

	if (options?.prune) {
		const itemIds = data.items.map((i) => sqlQuoteString(i.id)).join(", ");
		const managedItemClause = buildManagedPrefixClause(
			"id",
			MANAGED_ITEM_ID_PREFIXES,
		);
		statements.push(
			`DELETE FROM study_pack_item WHERE ${managedItemClause}${itemIds ? ` AND id NOT IN (${itemIds})` : ""};`,
		);
		const exIds = data.exercises.map((e) => sqlQuoteString(e.id)).join(", ");
		const managedExClause = buildManagedPrefixClause(
			"id",
			MANAGED_EXERCISE_ID_PREFIXES,
		);
		statements.push(
			`DELETE FROM study_pack_exercise WHERE ${managedExClause}${exIds ? ` AND id NOT IN (${exIds})` : ""} AND NOT EXISTS (SELECT 1 FROM study_pack_item WHERE study_pack_item.source_kind = 'library_exercise' AND study_pack_item.source_id = study_pack_exercise.id);`,
		);
	}

	return statements;
}

function resolveRunner(
	runnerOrClient: StudyPackSqlRunner | Client,
): StudyPackSqlRunner {
	if ("run" in runnerOrClient && typeof runnerOrClient.run === "function") {
		return runnerOrClient;
	}
	return createLibsqlRunner(runnerOrClient as Client);
}

export async function seedStudyPacks(
	runnerOrClient: StudyPackSqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedStudyPackSeedData;
		prune?: boolean;
		maxChunkBytes?: number;
	},
): Promise<{
	statementsExecuted: number;
	counts: { pack: number; exercise: number; item: number };
}> {
	const runner = resolveRunner(runnerOrClient);
	const data = options?.data ?? loadStudyPackSeedData(options?.dataDir);
	const statements = buildStudyPackUpsertStatements(data, {
		prune: options?.prune,
		maxChunkBytes: options?.maxChunkBytes,
	});
	await runner.run(statements);
	return {
		statementsExecuted: statements.length,
		counts: {
			pack: data.packs.length,
			exercise: data.exercises.length,
			item: data.items.length,
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

export async function verifyStudyPackCounts(
	runnerOrClient: StudyPackSqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedStudyPackSeedData;
	},
): Promise<VerifyStudyPackCountsResult> {
	const runner = resolveRunner(runnerOrClient);
	if (!runner.queryRows) {
		throw new Error("SQL runner does not support queryRows()");
	}
	const data = options?.data ?? loadStudyPackSeedData(options?.dataDir);
	const [packRows, exerciseRows, itemRows] = await Promise.all([
		runner.queryRows(
			`SELECT id FROM study_pack WHERE ${buildManagedPrefixClause("id", MANAGED_PACK_ID_PREFIXES)}`,
		),
		runner.queryRows(
			`SELECT id FROM study_pack_exercise WHERE ${buildManagedPrefixClause("id", MANAGED_EXERCISE_ID_PREFIXES)}`,
		),
		runner.queryRows(
			`SELECT id FROM study_pack_item WHERE ${buildManagedPrefixClause("id", MANAGED_ITEM_ID_PREFIXES)}`,
		),
	]);

	const pack = compareIdSet(
		data.packs.map((p) => p.id),
		packRows.map((r) => String(r.id)),
	);
	const exercise = compareIdSet(
		data.exercises.map((e) => e.id),
		exerciseRows.map((r) => String(r.id)),
	);
	const item = compareIdSet(
		data.items.map((i) => i.id),
		itemRows.map((r) => String(r.id)),
	);

	return {
		ok: pack.match && exercise.match && item.match,
		tables: { pack, exercise, item },
	};
}

function canonicalHashOfSeedData(data: ParsedStudyPackSeedData): string {
	const hash = createHash("sha256");

	const sortedPacks = [...data.packs].sort((a, b) => a.id.localeCompare(b.id));
	for (const p of sortedPacks) {
		hash.update(
			`${JSON.stringify(["pack", p.id, p.title, p.description, p.level, p.status])}\n`,
		);
	}

	const sortedExercises = [...data.exercises].sort((a, b) =>
		a.id.localeCompare(b.id),
	);
	for (const ex of sortedExercises) {
		hash.update(
			`${JSON.stringify([
				"exercise",
				ex.id,
				ex.skill,
				ex.part,
				ex.type,
				ex.title,
				ex.band,
				ex.level,
				ex.intro,
				ex.passage,
				ex.audioUrl,
				ex.audioKey,
				ex.transcript,
				JSON.stringify(ex.questions),
				JSON.stringify(ex.optionBank),
				ex.note,
				ex.status,
			])}\n`,
		);
	}

	const sortedItems = [...data.items].sort((a, b) => a.id.localeCompare(b.id));
	for (const item of sortedItems) {
		hash.update(
			`${JSON.stringify([
				"item",
				item.id,
				item.packId,
				item.dayIndex,
				item.sourceKind,
				item.sourceId,
				item.note,
			])}\n`,
		);
	}

	return hash.digest("hex");
}

export async function verifyStudyPackContentParity(
	runnerOrClient: StudyPackSqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedStudyPackSeedData;
	},
): Promise<boolean> {
	const runner = resolveRunner(runnerOrClient);
	if (!runner.queryRows) {
		throw new Error("SQL runner does not support queryRows()");
	}
	const data = options?.data ?? loadStudyPackSeedData(options?.dataDir);
	const expectedDigest = canonicalHashOfSeedData(data);

	const actualHash = createHash("sha256");
	const packRows = await runner.queryRows(
		`SELECT id, title, description, level, status FROM study_pack WHERE ${buildManagedPrefixClause("id", MANAGED_PACK_ID_PREFIXES)} ORDER BY id ASC;`,
	);
	for (const r of packRows) {
		actualHash.update(
			`${JSON.stringify([
				"pack",
				String(r.id),
				String(r.title),
				String(r.description),
				String(r.level),
				String(r.status),
			])}\n`,
		);
	}

	const exerciseRows = await runner.queryRows(
		`SELECT id, skill, part, type, title, band, level, intro, passage, audio_url, audio_key, transcript, questions, option_bank, note, status FROM study_pack_exercise WHERE ${buildManagedPrefixClause("id", MANAGED_EXERCISE_ID_PREFIXES)} ORDER BY id ASC;`,
	);
	for (const r of exerciseRows) {
		actualHash.update(
			`${JSON.stringify([
				"exercise",
				String(r.id),
				String(r.skill),
				String(r.part),
				String(r.type),
				String(r.title),
				String(r.band),
				String(r.level),
				String(r.intro),
				String(r.passage),
				String(r.audio_url),
				String(r.audio_key ?? ""),
				String(r.transcript),
				String(r.questions),
				String(r.option_bank),
				String(r.note),
				String(r.status),
			])}\n`,
		);
	}

	const itemRows = await runner.queryRows(
		`SELECT id, pack_id, day_index, source_kind, source_id, note FROM study_pack_item WHERE ${buildManagedPrefixClause("id", MANAGED_ITEM_ID_PREFIXES)} ORDER BY id ASC;`,
	);
	for (const r of itemRows) {
		actualHash.update(
			`${JSON.stringify([
				"item",
				String(r.id),
				String(r.pack_id),
				Number(r.day_index),
				String(r.source_kind),
				String(r.source_id),
				String(r.note),
			])}\n`,
		);
	}

	return expectedDigest === actualHash.digest("hex");
}

export const PROD_D1_LOOKUP_REGEX = /^teacher-os-database-prod-[a-z2-7]{16}$/;

async function cfD1GetJson<T>(options: {
	url: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<T> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const res = await fetchFn(options.url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	const raw = await res.text();
	let payload: {
		success?: boolean;
		errors?: Array<{ message?: string }>;
		result?: T;
	};
	try {
		payload = JSON.parse(raw) as typeof payload;
	} catch {
		throw new Error(`D1 API failed (${res.status}): invalid JSON`);
	}
	if (!res.ok || payload.success !== true || !payload.result) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(`D1 API failed (${res.status}): ${errMsg}`);
	}
	return payload.result;
}

/**
 * Resolves the single production D1 database matching `teacher-os-database-prod-*`
 * fail-closed. Only used when the caller explicitly passes `--allow-prod`.
 */
export async function resolveProdD1DatabaseId(options: {
	accountId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{ uuid: string; name: string }> {
	const list = await cfD1GetJson<Array<{ uuid?: string; name?: string }>>({
		url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database?name=teacher-os-database-prod-&per_page=100`,
		apiToken: options.apiToken,
		fetchImpl: options.fetchImpl,
		timeoutMs: options.timeoutMs,
	});
	const matches = list.filter(
		(db): db is { uuid: string; name: string } =>
			typeof db.uuid === "string" &&
			typeof db.name === "string" &&
			PROD_D1_LOOKUP_REGEX.test(db.name),
	);
	const [match] = matches;
	if (matches.length !== 1 || !match) {
		throw new Error(
			`Expected exactly 1 prod D1 database matching ${PROD_D1_LOOKUP_REGEX}, found ${matches.length}.`,
		);
	}
	return match;
}

export async function inspectD1DatabaseName(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<string> {
	const result = await cfD1GetJson<{ name?: string }>({
		url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database/${encodeURIComponent(options.databaseId)}`,
		apiToken: options.apiToken,
		fetchImpl: options.fetchImpl,
		timeoutMs: options.timeoutMs,
	});
	if (!result.name) {
		throw new Error("D1 get database returned empty name");
	}
	return result.name;
}

export async function ensureStudyPacksSeeded(
	runnerOrClient: StudyPackSqlRunner | Client,
	options?: {
		dataDir?: string;
		data?: ParsedStudyPackSeedData;
		prune?: boolean;
		maxChunkBytes?: number;
		ifNeeded?: boolean;
		verify?: boolean;
	},
): Promise<{
	seeded: boolean;
	statementsExecuted: number;
	counts: { pack: number; exercise: number; item: number };
	verification?: VerifyStudyPackCountsResult;
}> {
	const runner = resolveRunner(runnerOrClient);
	const data = options?.data ?? loadStudyPackSeedData(options?.dataDir);
	if (options?.ifNeeded && !options?.prune) {
		const check = await verifyStudyPackCounts(runner, { data });
		if (check.ok) {
			const contentParity = await verifyStudyPackContentParity(runner, {
				data,
			});
			if (contentParity) {
				return {
					seeded: false,
					statementsExecuted: 0,
					counts: {
						pack: data.packs.length,
						exercise: data.exercises.length,
						item: data.items.length,
					},
					verification: options.verify ? check : undefined,
				};
			}
		}
	}

	const seeded = await seedStudyPacks(runner, {
		data,
		prune: options?.prune,
		maxChunkBytes: options?.maxChunkBytes,
	});
	const verification = options?.verify
		? await verifyStudyPackCounts(runner, { data })
		: undefined;
	return {
		seeded: true,
		statementsExecuted: seeded.statementsExecuted,
		counts: seeded.counts,
		verification,
	};
}
