/**
 * Pipeline audit & promote bộ đề tự học (`study_pack`, `study_pack_exercise`,
 * `study_pack_item` + R2 audio trong bucket `library-audio`) từ Cloudflare D1/R2
 * staging lên production.
 *
 * Nguyên tắc an toàn:
 * - Mặc định read-only (`audit-staging` / `dry-run`); ghi dữ liệu chỉ qua
 *   `applyPromoteStudyPackPlan` sau khi đã chụp preimage backup + sinh rollback SQL.
 * - Đọc trực tiếp dữ liệu live từ D1 staging (bảo toàn mọi chỉnh sửa trên staging)
 *   và chỉ migrate đúng các bộ đề được chọn (không chạm bộ đề khác hay
 *   `class_study_pack` trên production).
 * - Bộ đề hệ thống (`org_id IS NULL`) giữ nguyên `org_id = NULL` để hiển thị dùng
 *   chung trên `/assignments/packs` (#829). Bộ đề của org (`org_id IS NOT NULL`)
 *   bắt buộc phải truyền `targetOrgId` đã xác minh tồn tại trên production.
 * - Fail-closed khi thiếu schema/cột `audio_key`, trùng tiêu đề khác ID, lệch
 *   `org_id`, đụng unique `(pack_id, day_index, source_kind, source_id)`,
 *   tham chiếu `org_prompt` hoặc `library_test_part` không có trên production,
 *   hoặc thiếu file MP3 trên R2 staging.
 * - Chia batch upsert theo cả giới hạn bind parameter (<= 90) và kích thước
 *   payload (<= 40 KB) để không vượt giới hạn D1 REST API.
 */
import { createHash } from "node:crypto";
import type { Client, InValue } from "@libsql/client";
import { d1Query, redactSensitive } from "../audit/orphan-materials";
import {
	getR2ObjectBytes,
	headR2Object,
	MAX_R2_AUDIO_BYTES,
	putR2ObjectBytes,
} from "./r2-audio";
import { PROD_D1_NAME_REGEX, STAGING_D1_NAME_REGEX } from "./vocab-library";

const D1_UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_STUDY_PACK_TABLES = [
	"study_pack",
	"study_pack_exercise",
	"study_pack_item",
] as const;

const SYSTEM_ID_PREFIXES = ["syspack-", "sysex-", "syspackitem-"] as const;

export interface StudyPackSqlStatement {
	sql: string;
	args?: unknown[];
}

export interface StudyPackPromoteSqlRunner {
	queryRows(
		sql: string,
		params?: unknown[],
	): Promise<Array<Record<string, unknown>>>;
	run(statements: StudyPackSqlStatement[]): Promise<void>;
}

export interface StudyPackRow {
	id: string;
	orgId: string | null;
	title: string;
	description: string;
	level: string;
	status: string;
	sourcePackId: string | null;
	createdBy: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface StudyPackExerciseRow {
	id: string;
	skill: string;
	part: string;
	type: string;
	title: string;
	band: string;
	level: string;
	intro: string;
	passage: string;
	audioUrl: string;
	audioKey: string | null;
	transcript: string;
	questions: string;
	optionBank: string;
	note: string;
	status: string;
	createdBy: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface StudyPackItemRow {
	id: string;
	packId: string;
	dayIndex: number;
	position: number;
	sourceKind: string;
	sourceId: string;
	note: string;
}

export interface StudyPackTableDiff {
	total: number;
	toInsert: number;
	toUpdate: number;
	unchanged: number;
}

export interface StudyPackAudioTransfer {
	exerciseId: string;
	audioKey: string;
}

export interface StagingStudyPackAuditEntry {
	id: string;
	orgId: string | null;
	title: string;
	level: string;
	status: string;
	itemCount: number;
	exerciseCount: number;
	skillCounts: Record<string, number>;
	nonLibraryExerciseCount: number;
	audioKeys: string[];
	r2Checked: boolean;
	r2PresentCount: number;
	r2MissingKeys: string[];
}

export interface StagingStudyPackAuditResult {
	packs: StagingStudyPackAuditEntry[];
	totalPacks: number;
	systemPackCount: number;
	orgPackCount: number;
	totalExercises: number;
	totalItems: number;
}

export interface ProdStudyPackSummaryEntry {
	id: string;
	orgId: string | null;
	title: string;
	level: string;
	status: string;
	itemCount: number;
	activeClassCount: number;
}

export interface ProdStudyPackAuditSummary {
	packs: ProdStudyPackSummaryEntry[];
	totalExercises: number;
	totalItems: number;
}

export interface StudyPackSelection {
	packTitles?: readonly string[];
	packIds?: readonly string[];
	includeOrgPacks?: boolean;
	sourceOrgId?: string;
}

export interface SelectedStagingStudyPackData {
	packs: StudyPackRow[];
	exercises: StudyPackExerciseRow[];
	items: StudyPackItemRow[];
}

export interface StudyPackPromotePreimage {
	capturedAt: string;
	packs: StudyPackRow[];
	exercises: StudyPackExerciseRow[];
	items: StudyPackItemRow[];
}

export interface PromoteStudyPackPlan {
	targetPacks: StudyPackRow[];
	targetExercises: StudyPackExerciseRow[];
	targetItems: StudyPackItemRow[];
	audioTransfers: StudyPackAudioTransfer[];
	diff: {
		pack: StudyPackTableDiff;
		exercise: StudyPackTableDiff;
		item: StudyPackTableDiff;
	};
	preimage: StudyPackPromotePreimage;
	upsertStatements: StudyPackSqlStatement[];
	rollbackStatements: StudyPackSqlStatement[];
	contentHash: string;
	consumed?: boolean;
}

export interface SyncStudyPackR2Result {
	total: number;
	existing: number;
	copied: number;
	missingOnSource: number;
	missingOnTarget: number;
	missingSourceKeys: string[];
	verified: number;
}

export interface VerifyPromotedStudyPacksResult {
	ok: boolean;
	expectedHash: string;
	actualHash: string;
	counts: {
		pack: { expected: number; actual: number };
		exercise: { expected: number; actual: number };
		item: { expected: number; actual: number };
	};
	mismatches: string[];
}

export function normalizeStudyPackTitle(value: string): string {
	return value.trim().normalize("NFC").toLocaleLowerCase("vi");
}

function isDeterministicSystemId(id: string): boolean {
	return SYSTEM_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function toNullableNonEmptyString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = String(value).trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toTimestampMs(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function compareById(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function parseStudyPackRow(
	row: Record<string, unknown>,
	nowMs: number,
): StudyPackRow {
	return {
		id: String(row.id),
		orgId: toNullableNonEmptyString(row.org_id),
		title: String(row.title ?? ""),
		description: String(row.description ?? ""),
		level: String(row.level ?? ""),
		status: String(row.status ?? "draft"),
		sourcePackId: toNullableNonEmptyString(row.source_pack_id),
		createdBy: toNullableNonEmptyString(row.created_by),
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseStudyPackExerciseRow(
	row: Record<string, unknown>,
	nowMs: number,
): StudyPackExerciseRow {
	return {
		id: String(row.id),
		skill: String(row.skill ?? ""),
		part: String(row.part ?? ""),
		type: String(row.type ?? ""),
		title: String(row.title ?? ""),
		band: String(row.band ?? "7.0"),
		level: String(row.level ?? ""),
		intro: String(row.intro ?? ""),
		passage: String(row.passage ?? ""),
		audioUrl: String(row.audio_url ?? ""),
		audioKey: toNullableNonEmptyString(row.audio_key),
		transcript: String(row.transcript ?? ""),
		questions: String(row.questions ?? "[]"),
		optionBank: String(row.option_bank ?? "[]"),
		note: String(row.note ?? ""),
		status: String(row.status ?? "draft"),
		createdBy: toNullableNonEmptyString(row.created_by),
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseStudyPackItemRow(row: Record<string, unknown>): StudyPackItemRow {
	return {
		id: String(row.id),
		packId: String(row.pack_id),
		dayIndex: toInt(row.day_index, 1),
		position: toInt(row.position, 0),
		sourceKind: String(row.source_kind ?? ""),
		sourceId: String(row.source_id ?? ""),
		note: String(row.note ?? ""),
	};
}

function isPackContentEqual(a: StudyPackRow, b: StudyPackRow): boolean {
	return (
		a.id === b.id &&
		a.orgId === b.orgId &&
		a.title === b.title &&
		a.description === b.description &&
		a.level === b.level &&
		a.status === b.status &&
		a.sourcePackId === b.sourcePackId
	);
}

function isExerciseContentEqual(
	a: StudyPackExerciseRow,
	b: StudyPackExerciseRow,
): boolean {
	return (
		a.id === b.id &&
		a.skill === b.skill &&
		a.part === b.part &&
		a.type === b.type &&
		a.title === b.title &&
		a.band === b.band &&
		a.level === b.level &&
		a.intro === b.intro &&
		a.passage === b.passage &&
		a.audioUrl === b.audioUrl &&
		a.audioKey === b.audioKey &&
		a.transcript === b.transcript &&
		a.questions === b.questions &&
		a.optionBank === b.optionBank &&
		a.note === b.note &&
		a.status === b.status
	);
}

function isItemContentEqual(a: StudyPackItemRow, b: StudyPackItemRow): boolean {
	return (
		a.id === b.id &&
		a.packId === b.packId &&
		a.dayIndex === b.dayIndex &&
		a.position === b.position &&
		a.sourceKind === b.sourceKind &&
		a.sourceId === b.sourceId &&
		a.note === b.note
	);
}

export function computeStudyPackContentHash(input: {
	packs: readonly StudyPackRow[];
	exercises: readonly StudyPackExerciseRow[];
	items: readonly StudyPackItemRow[];
}): string {
	const hash = createHash("sha256");
	for (const p of [...input.packs].sort(compareById)) {
		hash.update(
			`${JSON.stringify([
				"pack",
				p.id,
				p.orgId,
				p.title,
				p.description,
				p.level,
				p.status,
				p.sourcePackId,
			])}\n`,
		);
	}
	for (const ex of [...input.exercises].sort(compareById)) {
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
				ex.questions,
				ex.optionBank,
				ex.note,
				ex.status,
			])}\n`,
		);
	}
	for (const item of [...input.items].sort(compareById)) {
		hash.update(
			`${JSON.stringify([
				"item",
				item.id,
				item.packId,
				item.dayIndex,
				item.position,
				item.sourceKind,
				item.sourceId,
				item.note,
			])}\n`,
		);
	}
	return hash.digest("hex");
}

export function createLibsqlStudyPackPromoteRunner(
	client: Client,
): StudyPackPromoteSqlRunner {
	return {
		async queryRows(
			sql: string,
			params?: unknown[],
		): Promise<Array<Record<string, unknown>>> {
			const res = await client.execute({
				sql,
				args: (params ?? []) as InValue[],
			});
			return res.rows.map((row) => ({ ...(row as Record<string, unknown>) }));
		},
		async run(statements: StudyPackSqlStatement[]): Promise<void> {
			if (statements.length === 0) return;
			await client.batch(
				statements.map((stmt) => ({
					sql: stmt.sql,
					args: (stmt.args ?? []) as InValue[],
				})),
				"write",
			);
		},
	};
}

export function createD1StudyPackPromoteRunner(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): StudyPackPromoteSqlRunner {
	return {
		async queryRows(
			sql: string,
			params?: unknown[],
		): Promise<Array<Record<string, unknown>>> {
			return d1Query({
				accountId: options.accountId,
				databaseId: options.databaseId,
				apiToken: options.apiToken,
				sql,
				params,
				fetchImpl: options.fetchImpl,
				timeoutMs: options.timeoutMs,
			});
		},
		async run(statements: StudyPackSqlStatement[]): Promise<void> {
			for (const stmt of statements) {
				await d1Query({
					accountId: options.accountId,
					databaseId: options.databaseId,
					apiToken: options.apiToken,
					sql: stmt.sql,
					params: stmt.args,
					fetchImpl: options.fetchImpl,
					timeoutMs: options.timeoutMs,
				});
			}
		},
	};
}

async function queryByIdsInChunks(
	runner: StudyPackPromoteSqlRunner,
	table:
		| "study_pack"
		| "study_pack_exercise"
		| "study_pack_item"
		| "library_test_part",
	columns: string,
	idColumn: string,
	ids: readonly string[],
): Promise<Array<Record<string, unknown>>> {
	if (ids.length === 0) return [];
	const uniqueIds = [...new Set(ids)];
	const chunkSize = 80;
	const rows: Array<Record<string, unknown>> = [];
	for (let i = 0; i < uniqueIds.length; i += chunkSize) {
		const chunk = uniqueIds.slice(i, i + chunkSize);
		const placeholders = chunk.map(() => "?").join(", ");
		const part = await runner.queryRows(
			`SELECT ${columns} FROM ${table} WHERE ${idColumn} IN (${placeholders})`,
			chunk,
		);
		rows.push(...part);
	}
	return rows;
}

async function probeStudyPackSchema(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{
	hasSchema: boolean;
	missingItems: string[];
	probeError?: string;
}> {
	try {
		const tableRows = await d1Query({
			accountId: options.accountId,
			databaseId: options.databaseId,
			apiToken: options.apiToken,
			sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('study_pack','study_pack_exercise','study_pack_item')",
			fetchImpl: options.fetchImpl,
			timeoutMs: options.timeoutMs,
		});
		const presentTables = new Set(tableRows.map((r) => String(r.name)));
		const missingItems: string[] = REQUIRED_STUDY_PACK_TABLES.filter(
			(t) => !presentTables.has(t),
		);
		if (missingItems.length > 0) {
			return { hasSchema: false, missingItems };
		}

		const [packCols, exCols] = await Promise.all([
			d1Query({
				accountId: options.accountId,
				databaseId: options.databaseId,
				apiToken: options.apiToken,
				sql: "PRAGMA table_info('study_pack')",
				fetchImpl: options.fetchImpl,
				timeoutMs: options.timeoutMs,
			}),
			d1Query({
				accountId: options.accountId,
				databaseId: options.databaseId,
				apiToken: options.apiToken,
				sql: "PRAGMA table_info('study_pack_exercise')",
				fetchImpl: options.fetchImpl,
				timeoutMs: options.timeoutMs,
			}),
		]);
		if (!packCols.some((c) => String(c.name) === "level")) {
			missingItems.push("study_pack.level");
		}
		if (!exCols.some((c) => String(c.name) === "audio_key")) {
			missingItems.push("study_pack_exercise.audio_key");
		}
		return {
			hasSchema: missingItems.length === 0,
			missingItems,
		};
	} catch (err) {
		return {
			hasSchema: false,
			missingItems: [...REQUIRED_STUDY_PACK_TABLES],
			probeError: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function resolveStudyPackD1Database(options: {
	stage: "staging" | "prod";
	accountId: string;
	apiToken: string;
	explicitDatabaseId?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{ id: string; name: string }> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const explicitId = options.explicitDatabaseId?.trim();

	if (explicitId) {
		if (!D1_UUID_REGEX.test(explicitId)) {
			throw new Error(
				`Invalid explicit ${options.stage} D1 database UUID format.`,
			);
		}
		const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database/${encodeURIComponent(explicitId)}`;
		const res = await fetchFn(url, {
			method: "GET",
			headers: { authorization: `Bearer ${options.apiToken}` },
			signal: AbortSignal.timeout(timeoutMs),
		});
		const raw = await res.text();
		let payload: {
			success?: boolean;
			errors?: Array<{ message?: string }>;
			result?: { uuid?: string; name?: string };
		};
		try {
			payload = JSON.parse(raw) as typeof payload;
		} catch {
			throw new Error(
				`D1 get ${options.stage} database failed (${res.status}): invalid JSON`,
			);
		}
		if (!res.ok || payload.success !== true || !payload.result?.name) {
			const errMsg =
				payload.errors?.map((e) => e.message ?? "error").join("; ") ??
				`HTTP ${res.status}`;
			throw new Error(
				redactSensitive(
					`D1 get ${options.stage} database failed (${res.status}): ${errMsg}`,
					[options.apiToken, explicitId],
				),
			);
		}
		const dbName = payload.result.name;
		if (options.stage === "staging" && PROD_D1_NAME_REGEX.test(dbName)) {
			throw new Error(
				`Refusing production-like D1 database "${dbName}" for stage "staging".`,
			);
		}
		if (options.stage === "prod" && /-staging-/i.test(dbName)) {
			throw new Error(
				`Refusing staging-like D1 database "${dbName}" for stage "prod".`,
			);
		}
		const probe = await probeStudyPackSchema({
			accountId: options.accountId,
			databaseId: explicitId,
			apiToken: options.apiToken,
			fetchImpl: fetchFn,
			timeoutMs,
		});
		if (probe.probeError) {
			throw new Error(
				redactSensitive(
					`Schema probe failed for ${options.stage} D1 "${dbName}": ${probe.probeError}`,
					[options.apiToken, explicitId],
				),
			);
		}
		if (!probe.hasSchema) {
			throw new Error(
				`${options.stage} D1 database "${dbName}" is missing required study-pack schema: [${probe.missingItems.join(", ")}]`,
			);
		}
		return { id: explicitId, name: dbName };
	}

	const stageRegex =
		options.stage === "staging" ? STAGING_D1_NAME_REGEX : PROD_D1_NAME_REGEX;
	const accumulated: Array<{ uuid: string; name: string }> = [];
	const perPage = 100;
	for (let page = 1; page <= 20; page++) {
		const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database?per_page=${perPage}&page=${page}`;
		const res = await fetchFn(url, {
			method: "GET",
			headers: { authorization: `Bearer ${options.apiToken}` },
			signal: AbortSignal.timeout(timeoutMs),
		});
		const raw = await res.text();
		let payload: {
			success?: boolean;
			errors?: Array<{ message?: string }>;
			result?: Array<{ uuid?: string; name?: string }>;
			result_info?: { total_pages?: number };
		};
		try {
			payload = JSON.parse(raw) as typeof payload;
		} catch {
			throw new Error(`D1 list databases failed (${res.status}): invalid JSON`);
		}
		if (!res.ok || payload.success !== true) {
			const errMsg =
				payload.errors?.map((e) => e.message ?? "error").join("; ") ??
				`HTTP ${res.status}`;
			throw new Error(
				redactSensitive(`D1 list databases failed (${res.status}): ${errMsg}`, [
					options.apiToken,
				]),
			);
		}
		const entries = Array.isArray(payload.result) ? payload.result : [];
		for (const entry of entries) {
			if (typeof entry.uuid === "string" && typeof entry.name === "string") {
				accumulated.push({ uuid: entry.uuid, name: entry.name });
			}
		}
		const totalPages = payload.result_info?.total_pages;
		if (typeof totalPages === "number" && page >= totalPages) break;
		if (entries.length === 0) break;
		if (typeof totalPages !== "number" && entries.length < perPage) break;
	}

	let candidates = accumulated.filter(
		(db) => D1_UUID_REGEX.test(db.uuid) && stageRegex.test(db.name),
	);
	let lastProbeError: string | undefined;
	if (candidates.length > 1) {
		const withSchema: Array<{ uuid: string; name: string }> = [];
		for (const candidate of candidates) {
			const probe = await probeStudyPackSchema({
				accountId: options.accountId,
				databaseId: candidate.uuid,
				apiToken: options.apiToken,
				fetchImpl: fetchFn,
				timeoutMs,
			});
			if (probe.probeError) lastProbeError = probe.probeError;
			if (probe.hasSchema) withSchema.push(candidate);
		}
		if (withSchema.length >= 1) {
			candidates = withSchema;
		}
	}

	const [match] = candidates;
	if (candidates.length !== 1 || !match) {
		const seenNames = accumulated
			.map((e) => e.name)
			.filter((name) => name.startsWith("teacher-os-database-"));
		throw new Error(
			redactSensitive(
				`Expected exactly 1 ${options.stage} D1 database matching ${stageRegex}, found ${candidates.length}. Seen: [${seenNames.join(", ")}]${lastProbeError ? ` (last probe error: ${lastProbeError})` : ""}`,
				[options.apiToken],
			),
		);
	}

	const finalProbe = await probeStudyPackSchema({
		accountId: options.accountId,
		databaseId: match.uuid,
		apiToken: options.apiToken,
		fetchImpl: fetchFn,
		timeoutMs,
	});
	if (finalProbe.probeError) {
		throw new Error(
			redactSensitive(
				`Schema probe failed for ${options.stage} D1 "${match.name}": ${finalProbe.probeError}`,
				[options.apiToken, match.uuid],
			),
		);
	}
	if (!finalProbe.hasSchema) {
		throw new Error(
			`${options.stage} D1 database "${match.name}" is missing required study-pack schema: [${finalProbe.missingItems.join(", ")}]`,
		);
	}
	return { id: match.uuid, name: match.name };
}

export async function auditStagingStudyPacks(
	stagingRunner: StudyPackPromoteSqlRunner,
	options?: {
		sourceOrgId?: string;
		r2Check?: {
			accountId: string;
			apiToken: string;
			bucketName: string;
			fetchImpl?: typeof fetch;
		};
	},
): Promise<StagingStudyPackAuditResult> {
	const nowMs = Date.now();
	const sourceOrgId = options?.sourceOrgId?.trim();
	const rawPacks = sourceOrgId
		? await stagingRunner.queryRows(
				"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack WHERE org_id = ? ORDER BY org_id IS NOT NULL ASC, title ASC, id ASC",
				[sourceOrgId],
			)
		: await stagingRunner.queryRows(
				"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack ORDER BY org_id IS NOT NULL ASC, title ASC, id ASC",
			);
	const packs = rawPacks.map((r) => parseStudyPackRow(r, nowMs));

	const rawItems =
		packs.length > 0
			? await queryByIdsInChunks(
					stagingRunner,
					"study_pack_item",
					"id, pack_id, day_index, position, source_kind, source_id, note",
					"pack_id",
					packs.map((p) => p.id),
				)
			: [];
	const items = rawItems.map(parseStudyPackItemRow);

	const libExerciseIds = [
		...new Set(
			items
				.filter((i) => i.sourceKind === "library_exercise")
				.map((i) => i.sourceId),
		),
	];
	const rawExercises =
		libExerciseIds.length > 0
			? await queryByIdsInChunks(
					stagingRunner,
					"study_pack_exercise",
					"id, skill, audio_key",
					"id",
					libExerciseIds,
				)
			: [];
	const exerciseMetaById = new Map<
		string,
		{ skill: string; audioKey: string | null }
	>();
	for (const r of rawExercises) {
		exerciseMetaById.set(String(r.id), {
			skill: String(r.skill ?? ""),
			audioKey: toNullableNonEmptyString(r.audio_key),
		});
	}

	const itemsByPack = new Map<string, StudyPackItemRow[]>();
	for (const item of items) {
		const list = itemsByPack.get(item.packId) ?? [];
		list.push(item);
		itemsByPack.set(item.packId, list);
	}

	const r2HeadCache = new Map<string, boolean>();
	const checkR2Exists = async (audioKey: string): Promise<boolean> => {
		if (!options?.r2Check) return false;
		const cached = r2HeadCache.get(audioKey);
		if (cached !== undefined) return cached;
		const head = await headR2Object({
			accountId: options.r2Check.accountId,
			bucketName: options.r2Check.bucketName,
			objectKey: audioKey,
			apiToken: options.r2Check.apiToken,
			fetchImpl: options.r2Check.fetchImpl,
		});
		const exists = head.exists && (head.size === null || head.size > 0);
		r2HeadCache.set(audioKey, exists);
		return exists;
	};

	const entries: StagingStudyPackAuditEntry[] = [];
	const uniqueExerciseIds = new Set<string>();
	let systemPackCount = 0;
	let orgPackCount = 0;

	for (const pack of packs) {
		if (pack.orgId === null) systemPackCount++;
		else orgPackCount++;

		const packItems = itemsByPack.get(pack.id) ?? [];
		const skillCounts: Record<string, number> = {};
		const audioKeySet = new Set<string>();
		const packExIds = new Set<string>();
		let nonLibraryExerciseCount = 0;

		for (const item of packItems) {
			if (item.sourceKind !== "library_exercise") {
				nonLibraryExerciseCount++;
				continue;
			}
			packExIds.add(item.sourceId);
			uniqueExerciseIds.add(item.sourceId);
			const meta = exerciseMetaById.get(item.sourceId);
			if (meta) {
				skillCounts[meta.skill] = (skillCounts[meta.skill] ?? 0) + 1;
				if (meta.audioKey) audioKeySet.add(meta.audioKey);
			}
		}

		const audioKeys = [...audioKeySet].sort((a, b) => a.localeCompare(b));
		let r2PresentCount = 0;
		const r2MissingKeys: string[] = [];
		const r2Checked = Boolean(options?.r2Check && audioKeys.length > 0);
		if (r2Checked) {
			for (const key of audioKeys) {
				if (await checkR2Exists(key)) {
					r2PresentCount++;
				} else {
					r2MissingKeys.push(key);
				}
			}
		}

		entries.push({
			id: pack.id,
			orgId: pack.orgId,
			title: pack.title,
			level: pack.level,
			status: pack.status,
			itemCount: packItems.length,
			exerciseCount: packExIds.size,
			skillCounts,
			nonLibraryExerciseCount,
			audioKeys,
			r2Checked,
			r2PresentCount,
			r2MissingKeys,
		});
	}

	return {
		packs: entries,
		totalPacks: entries.length,
		systemPackCount,
		orgPackCount,
		totalExercises: uniqueExerciseIds.size,
		totalItems: items.length,
	};
}

export function formatStagingStudyPackAuditReport(
	audit: StagingStudyPackAuditResult,
	options?: { publicLogs?: boolean },
): string {
	const publicLogs = options?.publicLogs ?? false;
	const lines: string[] = [
		"=== Staging Study Packs Inventory (Read-Only) ===",
		`Summary: packs=${audit.totalPacks} (system=${audit.systemPackCount}, org=${audit.orgPackCount}), referenced_exercises=${audit.totalExercises}, items=${audit.totalItems}`,
		"",
	];

	if (audit.packs.length === 0) {
		lines.push("  (không có study_pack nào trên staging)");
		return lines.join("\n");
	}

	for (const p of audit.packs) {
		const scope = p.orgId === null ? "system" : "org";
		const idLabel =
			publicLogs && !isDeterministicSystemId(p.id)
				? "[id=<redacted>]"
				: `[id=${p.id}]`;
		const orgLabel = p.orgId === null || publicLogs ? "" : `, org=${p.orgId}`;
		const skills = Object.entries(p.skillCounts)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${k}=${v}`)
			.join(", ");
		const r2Part =
			p.audioKeys.length === 0
				? "r2Audio=0"
				: p.r2Checked
					? `r2Audio=${p.r2PresentCount}/${p.audioKeys.length}${p.r2MissingKeys.length > 0 ? ` (MISSING ${p.r2MissingKeys.length})` : " OK"}`
					: `r2AudioKeys=${p.audioKeys.length} (not checked)`;
		lines.push(
			`  * [${scope}] "${p.title}" ${idLabel}${orgLabel} — level="${p.level}", status=${p.status}, items=${p.itemCount}, exercises=${p.exerciseCount}${skills ? ` (${skills})` : ""}, nonLibEx=${p.nonLibraryExerciseCount}, ${r2Part}`,
		);
		if (p.r2MissingKeys.length > 0) {
			lines.push(
				`      missing R2 keys (${p.r2MissingKeys.length}): ${p.r2MissingKeys.slice(0, 5).join(", ")}${p.r2MissingKeys.length > 5 ? ", ..." : ""}`,
			);
		}
	}

	return lines.join("\n");
}

export async function auditProdStudyPacksSummary(
	prodRunner: StudyPackPromoteSqlRunner,
): Promise<ProdStudyPackAuditSummary> {
	const [packRows, exCountRows, itemCountRows] = await Promise.all([
		prodRunner.queryRows(
			`SELECT p.id, p.org_id, p.title, p.level, p.status,
			        (SELECT COUNT(*) FROM study_pack_item i WHERE i.pack_id = p.id) AS item_count,
			        (SELECT COUNT(*) FROM class_study_pack c WHERE c.pack_id = p.id AND c.status = 'active') AS active_class_count
			   FROM study_pack p
			  ORDER BY p.org_id IS NOT NULL ASC, p.title ASC, p.id ASC`,
		),
		prodRunner.queryRows("SELECT COUNT(*) AS cnt FROM study_pack_exercise"),
		prodRunner.queryRows("SELECT COUNT(*) AS cnt FROM study_pack_item"),
	]);

	return {
		packs: packRows.map((r) => ({
			id: String(r.id),
			orgId: toNullableNonEmptyString(r.org_id),
			title: String(r.title ?? ""),
			level: String(r.level ?? ""),
			status: String(r.status ?? ""),
			itemCount: toInt(r.item_count, 0),
			activeClassCount: toInt(r.active_class_count, 0),
		})),
		totalExercises: toInt(exCountRows[0]?.cnt, 0),
		totalItems: toInt(itemCountRows[0]?.cnt, 0),
	};
}

export async function loadSelectedStagingStudyPacks(
	stagingRunner: StudyPackPromoteSqlRunner,
	selection: StudyPackSelection,
): Promise<SelectedStagingStudyPackData> {
	const packTitles = (selection.packTitles ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const packIds = (selection.packIds ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	if (packTitles.length === 0 && packIds.length === 0) {
		throw new Error(
			"Must select at least one study_pack (--pack, --pack-titles, or --pack-id).",
		);
	}

	const nowMs = Date.now();
	const sourceOrgId = selection.sourceOrgId?.trim();
	const includeOrgPacks = selection.includeOrgPacks ?? Boolean(sourceOrgId);

	const rawPacks = sourceOrgId
		? await stagingRunner.queryRows(
				"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack WHERE org_id = ? ORDER BY id ASC",
				[sourceOrgId],
			)
		: includeOrgPacks
			? await stagingRunner.queryRows(
					"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack ORDER BY id ASC",
				)
			: await stagingRunner.queryRows(
					"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack WHERE org_id IS NULL ORDER BY id ASC",
				);
	const eligiblePacks = rawPacks.map((r) => parseStudyPackRow(r, nowMs));
	const packById = new Map(eligiblePacks.map((p) => [p.id, p]));

	const selectedPackMap = new Map<string, StudyPackRow>();

	for (const wantedTitle of packTitles) {
		const normalizedWanted = normalizeStudyPackTitle(wantedTitle);
		const matches = eligiblePacks.filter(
			(p) => normalizeStudyPackTitle(p.title) === normalizedWanted,
		);
		if (matches.length === 0) {
			throw new Error(
				`No eligible study_pack found on staging matching title "${wantedTitle}"${includeOrgPacks ? "" : " (system packs org_id IS NULL only; pass --include-org-packs for org-owned packs)"}. Run --mode audit-staging first to inspect exact titles.`,
			);
		}
		if (matches.length > 1) {
			throw new Error(
				`Ambiguous title "${wantedTitle}" matched ${matches.length} study_pack rows on staging; pass --pack-id explicitly to disambiguate.`,
			);
		}
		const [only] = matches;
		if (only) {
			selectedPackMap.set(only.id, only);
		}
	}

	for (const wantedId of packIds) {
		const match = packById.get(wantedId);
		if (!match) {
			throw new Error(
				`No eligible study_pack found on staging with id "${wantedId}".`,
			);
		}
		selectedPackMap.set(match.id, match);
	}

	const packs = [...selectedPackMap.values()].sort(compareById);
	if (packs.length === 0) {
		throw new Error(
			"Selection resolved to 0 study packs on staging; refusing empty migration.",
		);
	}

	const rawItems = await queryByIdsInChunks(
		stagingRunner,
		"study_pack_item",
		"id, pack_id, day_index, position, source_kind, source_id, note",
		"pack_id",
		packs.map((p) => p.id),
	);
	const items = rawItems.map(parseStudyPackItemRow).sort(compareById);
	if (items.length === 0) {
		throw new Error(
			"Selected study pack(s) have 0 study_pack_item rows on staging; refusing empty migration.",
		);
	}

	const unsupportedOrgPromptItems = items.filter(
		(i) => i.sourceKind === "org_prompt",
	);
	if (unsupportedOrgPromptItems.length > 0) {
		throw new Error(
			`Refusing migration: ${unsupportedOrgPromptItems.length} study_pack_item row(s) reference org_prompt (staging-org-scoped prompt IDs cannot be migrated directly to production).`,
		);
	}

	const libExerciseIds = [
		...new Set(
			items
				.filter((i) => i.sourceKind === "library_exercise")
				.map((i) => i.sourceId),
		),
	].sort((a, b) => a.localeCompare(b));

	const rawExercises = await queryByIdsInChunks(
		stagingRunner,
		"study_pack_exercise",
		"id, skill, part, type, title, band, level, intro, passage, audio_url, audio_key, transcript, questions, option_bank, note, status, created_by, created_at, updated_at",
		"id",
		libExerciseIds,
	);
	const exercises = rawExercises
		.map((r) => parseStudyPackExerciseRow(r, nowMs))
		.sort(compareById);

	const foundExerciseIds = new Set(exercises.map((e) => e.id));
	const missingExerciseIds = libExerciseIds.filter(
		(id) => !foundExerciseIds.has(id),
	);
	if (missingExerciseIds.length > 0) {
		throw new Error(
			`Staging integrity error: ${missingExerciseIds.length} study_pack_item row(s) reference missing study_pack_exercise ID(s): ${missingExerciseIds.slice(0, 5).join(", ")}.`,
		);
	}

	return { packs, exercises, items };
}

export function buildByteBoundedUpsertStatements<T>(options: {
	table: string;
	columns: readonly string[];
	updateColumns: readonly string[];
	rows: readonly T[];
	toParams: (row: T) => unknown[];
	maxParamsPerStatement?: number;
	maxPayloadBytes?: number;
}): StudyPackSqlStatement[] {
	if (options.rows.length === 0) return [];
	const maxParams = options.maxParamsPerStatement ?? 90;
	const maxPayloadBytes = options.maxPayloadBytes ?? 40_000;
	const colsPerRow = options.columns.length;
	const maxRowsByParams = Math.max(1, Math.floor(maxParams / colsPerRow));
	const rowPlaceholder = `(${options.columns.map(() => "?").join(", ")})`;
	const updateClause = options.updateColumns
		.map((col) => `${col} = excluded.${col}`)
		.join(", ");
	const sqlPrefix = `INSERT INTO ${options.table} (${options.columns.join(", ")}) VALUES `;
	const sqlSuffix = ` ON CONFLICT(id) DO UPDATE SET ${updateClause}`;
	const baseOverhead =
		Buffer.byteLength(sqlPrefix, "utf8") +
		Buffer.byteLength(sqlSuffix, "utf8") +
		64;

	const statements: StudyPackSqlStatement[] = [];
	let batchParams: unknown[][] = [];
	let batchBytes = baseOverhead;

	const flush = () => {
		if (batchParams.length === 0) return;
		const placeholders = batchParams.map(() => rowPlaceholder).join(", ");
		const flatArgs: unknown[] = [];
		for (const rowArgs of batchParams) {
			flatArgs.push(...rowArgs);
		}
		statements.push({
			sql: `${sqlPrefix}${placeholders}${sqlSuffix}`,
			args: flatArgs,
		});
		batchParams = [];
		batchBytes = baseOverhead;
	};

	for (const row of options.rows) {
		const params = options.toParams(row);
		const rowBytes =
			Buffer.byteLength(JSON.stringify(params), "utf8") +
			rowPlaceholder.length +
			4;
		if (
			batchParams.length > 0 &&
			(batchParams.length >= maxRowsByParams ||
				batchBytes + rowBytes > maxPayloadBytes)
		) {
			flush();
		}
		batchParams.push(params);
		batchBytes += rowBytes;
	}
	flush();

	return statements;
}

export async function buildPromoteStudyPackPlan(
	source: SelectedStagingStudyPackData,
	prodRunner: StudyPackPromoteSqlRunner,
	options?: {
		targetOrgId?: string | null;
		nowMs?: number;
	},
): Promise<PromoteStudyPackPlan> {
	const nowMs = options?.nowMs ?? Date.now();
	const explicitTargetOrgId = options?.targetOrgId?.trim() || null;

	const hasOrgPack = source.packs.some((p) => p.orgId !== null);
	if (hasOrgPack) {
		if (!explicitTargetOrgId) {
			throw new Error(
				"Selected staging data includes an org-owned study_pack; pass --target-org-id <prodOrgId> explicitly.",
			);
		}
		const orgRows = await prodRunner.queryRows(
			"SELECT id FROM organization WHERE id = ?",
			[explicitTargetOrgId],
		);
		if (orgRows.length === 0) {
			throw new Error(
				`Target organization "${explicitTargetOrgId}" does not exist in production D1.`,
			);
		}
	}

	// Verify any library_test_part references actually exist on production
	const testPartIds = [
		...new Set(
			source.items
				.filter((i) => i.sourceKind === "library_test_part")
				.map((i) => i.sourceId),
		),
	];
	if (testPartIds.length > 0) {
		const prodParts = await queryByIdsInChunks(
			prodRunner,
			"library_test_part",
			"id",
			"id",
			testPartIds,
		);
		const foundPartIds = new Set(prodParts.map((r) => String(r.id)));
		const missingPartIds = testPartIds.filter((id) => !foundPartIds.has(id));
		if (missingPartIds.length > 0) {
			throw new Error(
				`Production D1 is missing ${missingPartIds.length} referenced library_test_part ID(s): ${missingPartIds.slice(0, 5).join(", ")}.`,
			);
		}
	}

	const includedPackIds = new Set(source.packs.map((p) => p.id));

	const targetPacks: StudyPackRow[] = source.packs
		.map((p) => ({
			...p,
			orgId: p.orgId === null ? null : explicitTargetOrgId,
			sourcePackId:
				p.sourcePackId && includedPackIds.has(p.sourcePackId)
					? p.sourcePackId
					: null,
			createdBy: null,
			updatedAt: nowMs,
		}))
		.sort(compareById);

	const targetExercises: StudyPackExerciseRow[] = source.exercises
		.map((ex) => ({
			...ex,
			createdBy: null,
			updatedAt: nowMs,
		}))
		.sort(compareById);

	const targetItems: StudyPackItemRow[] = [...source.items].sort(compareById);

	// Check duplicate normalized title within selected source packs of same org scope
	const seenSourceTitleKey = new Map<string, string>();
	for (const p of targetPacks) {
		const key = `${p.orgId ?? "__SYSTEM__"}::${normalizeStudyPackTitle(p.title)}`;
		const prev = seenSourceTitleKey.get(key);
		if (prev && prev !== p.id) {
			throw new Error(
				`Duplicate normalized study_pack title "${p.title}" in selected staging data.`,
			);
		}
		seenSourceTitleKey.set(key, p.id);
	}

	// Inspect existing production rows for fail-closed conflict checks and preimage capture
	const [
		existingPackByIdRows,
		existingAllProdPacksRows,
		existingExerciseRows,
		existingItemsByIdRows,
		existingItemsByPackRows,
	] = await Promise.all([
		queryByIdsInChunks(
			prodRunner,
			"study_pack",
			"id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at",
			"id",
			targetPacks.map((p) => p.id),
		),
		prodRunner.queryRows(
			"SELECT id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at FROM study_pack",
		),
		queryByIdsInChunks(
			prodRunner,
			"study_pack_exercise",
			"id, skill, part, type, title, band, level, intro, passage, audio_url, audio_key, transcript, questions, option_bank, note, status, created_by, created_at, updated_at",
			"id",
			targetExercises.map((e) => e.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"study_pack_item",
			"id, pack_id, day_index, position, source_kind, source_id, note",
			"id",
			targetItems.map((i) => i.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"study_pack_item",
			"id, pack_id, day_index, position, source_kind, source_id, note",
			"pack_id",
			targetPacks.map((p) => p.id),
		),
	]);

	const existingPackById = new Map<string, StudyPackRow>();
	for (const r of existingPackByIdRows) {
		const parsed = parseStudyPackRow(r, nowMs);
		existingPackById.set(parsed.id, parsed);
	}

	const existingProdPackByScopeTitle = new Map<string, StudyPackRow>();
	for (const r of existingAllProdPacksRows) {
		const parsed = parseStudyPackRow(r, nowMs);
		const key = `${parsed.orgId ?? "__SYSTEM__"}::${normalizeStudyPackTitle(parsed.title)}`;
		existingProdPackByScopeTitle.set(key, parsed);
	}

	for (const p of targetPacks) {
		const byId = existingPackById.get(p.id);
		if (byId && byId.orgId !== p.orgId) {
			throw new Error(
				`Safety gate: production study_pack "${p.title}" (${p.id}) has mismatched org_id scope (prod=${byId.orgId === null ? "system" : "org"}, target=${p.orgId === null ? "system" : "org"}).`,
			);
		}
		const titleKey = `${p.orgId ?? "__SYSTEM__"}::${normalizeStudyPackTitle(p.title)}`;
		const byTitle = existingProdPackByScopeTitle.get(titleKey);
		if (byTitle && byTitle.id !== p.id) {
			throw new Error(
				`Safety gate: production already has another study_pack with title "${p.title}" under a different ID (${byTitle.id} vs ${p.id}).`,
			);
		}
	}

	const existingExerciseById = new Map<string, StudyPackExerciseRow>();
	for (const r of existingExerciseRows) {
		const parsed = parseStudyPackExerciseRow(r, nowMs);
		existingExerciseById.set(parsed.id, parsed);
	}

	const existingItemById = new Map<string, StudyPackItemRow>();
	for (const r of existingItemsByIdRows) {
		const parsed = parseStudyPackItemRow(r);
		existingItemById.set(parsed.id, parsed);
	}

	const existingItemsInTargetPacks = existingItemsByPackRows.map(
		parseStudyPackItemRow,
	);
	const targetItemIdSet = new Set(targetItems.map((i) => i.id));
	const existingTupleToId = new Map<string, string>();
	for (const prodItem of existingItemsInTargetPacks) {
		const tupleKey = `${prodItem.packId}::${prodItem.dayIndex}::${prodItem.sourceKind}::${prodItem.sourceId}`;
		existingTupleToId.set(tupleKey, prodItem.id);
		if (!targetItemIdSet.has(prodItem.id)) {
			throw new Error(
				`Safety gate: production pack "${prodItem.packId}" already contains extra study_pack_item "${prodItem.id}" (day ${prodItem.dayIndex}) not present in staging selection.`,
			);
		}
	}

	for (const item of targetItems) {
		const byId = existingItemById.get(item.id);
		if (byId && byId.packId !== item.packId) {
			throw new Error(
				`Safety gate: production study_pack_item "${item.id}" belongs to a different pack (${byId.packId} vs ${item.packId}).`,
			);
		}
		const tupleKey = `${item.packId}::${item.dayIndex}::${item.sourceKind}::${item.sourceId}`;
		const collidingId = existingTupleToId.get(tupleKey);
		if (collidingId && collidingId !== item.id) {
			throw new Error(
				`Safety gate: unique (pack_id, day_index, source_kind, source_id) collision on production for pack "${item.packId}" day ${item.dayIndex} (${collidingId} vs ${item.id}).`,
			);
		}
	}

	// Compute diffs & track inserted vs updated rows
	const insertedPackIds: string[] = [];
	const insertedExerciseIds: string[] = [];
	const insertedItemIds: string[] = [];

	const packDiff: StudyPackTableDiff = {
		total: targetPacks.length,
		toInsert: 0,
		toUpdate: 0,
		unchanged: 0,
	};
	for (const p of targetPacks) {
		const prev = existingPackById.get(p.id);
		if (!prev) {
			packDiff.toInsert++;
			insertedPackIds.push(p.id);
		} else if (!isPackContentEqual(prev, p)) {
			packDiff.toUpdate++;
		} else {
			packDiff.unchanged++;
		}
	}

	const exerciseDiff: StudyPackTableDiff = {
		total: targetExercises.length,
		toInsert: 0,
		toUpdate: 0,
		unchanged: 0,
	};
	for (const ex of targetExercises) {
		const prev = existingExerciseById.get(ex.id);
		if (!prev) {
			exerciseDiff.toInsert++;
			insertedExerciseIds.push(ex.id);
		} else if (!isExerciseContentEqual(prev, ex)) {
			exerciseDiff.toUpdate++;
		} else {
			exerciseDiff.unchanged++;
		}
	}

	const itemDiff: StudyPackTableDiff = {
		total: targetItems.length,
		toInsert: 0,
		toUpdate: 0,
		unchanged: 0,
	};
	for (const item of targetItems) {
		const prev = existingItemById.get(item.id);
		if (!prev) {
			itemDiff.toInsert++;
			insertedItemIds.push(item.id);
		} else if (!isItemContentEqual(prev, item)) {
			itemDiff.toUpdate++;
		} else {
			itemDiff.unchanged++;
		}
	}

	// Build upsert statements in strict FK order:
	// 1) study_pack_exercise -> 2) study_pack -> 3) study_pack_item
	const upsertStatements: StudyPackSqlStatement[] = [
		...buildByteBoundedUpsertStatements({
			table: "study_pack_exercise",
			columns: [
				"id",
				"skill",
				"part",
				"type",
				"title",
				"band",
				"level",
				"intro",
				"passage",
				"audio_url",
				"audio_key",
				"transcript",
				"questions",
				"option_bank",
				"note",
				"status",
				"created_by",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"skill",
				"part",
				"type",
				"title",
				"band",
				"level",
				"intro",
				"passage",
				"audio_url",
				"audio_key",
				"transcript",
				"questions",
				"option_bank",
				"note",
				"status",
				"updated_at",
			],
			rows: targetExercises,
			toParams: (ex) => [
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
				ex.questions,
				ex.optionBank,
				ex.note,
				ex.status,
				ex.createdBy,
				ex.createdAt,
				ex.updatedAt,
			],
		}),
		...buildByteBoundedUpsertStatements({
			table: "study_pack",
			columns: [
				"id",
				"org_id",
				"title",
				"description",
				"level",
				"status",
				"source_pack_id",
				"created_by",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"org_id",
				"title",
				"description",
				"level",
				"status",
				"source_pack_id",
				"updated_at",
			],
			rows: targetPacks,
			toParams: (p) => [
				p.id,
				p.orgId,
				p.title,
				p.description,
				p.level,
				p.status,
				p.sourcePackId,
				p.createdBy,
				p.createdAt,
				p.updatedAt,
			],
		}),
		...buildByteBoundedUpsertStatements({
			table: "study_pack_item",
			columns: [
				"id",
				"pack_id",
				"day_index",
				"position",
				"source_kind",
				"source_id",
				"note",
			],
			updateColumns: [
				"pack_id",
				"day_index",
				"position",
				"source_kind",
				"source_id",
				"note",
			],
			rows: targetItems,
			toParams: (item) => [
				item.id,
				item.packId,
				item.dayIndex,
				item.position,
				item.sourceKind,
				item.sourceId,
				item.note,
			],
		}),
	];

	// Build rollback statements: restore updated rows first, then delete newly inserted rows in child->parent FK order
	const rollbackStatements: StudyPackSqlStatement[] = [];
	for (const p of targetPacks) {
		const prev = existingPackById.get(p.id);
		if (prev && !isPackContentEqual(prev, p)) {
			rollbackStatements.push({
				sql: "UPDATE study_pack SET org_id = ?, title = ?, description = ?, level = ?, status = ?, source_pack_id = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.orgId,
					prev.title,
					prev.description,
					prev.level,
					prev.status,
					prev.sourcePackId,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const ex of targetExercises) {
		const prev = existingExerciseById.get(ex.id);
		if (prev && !isExerciseContentEqual(prev, ex)) {
			rollbackStatements.push({
				sql: "UPDATE study_pack_exercise SET skill = ?, part = ?, type = ?, title = ?, band = ?, level = ?, intro = ?, passage = ?, audio_url = ?, audio_key = ?, transcript = ?, questions = ?, option_bank = ?, note = ?, status = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.skill,
					prev.part,
					prev.type,
					prev.title,
					prev.band,
					prev.level,
					prev.intro,
					prev.passage,
					prev.audioUrl,
					prev.audioKey,
					prev.transcript,
					prev.questions,
					prev.optionBank,
					prev.note,
					prev.status,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const item of targetItems) {
		const prev = existingItemById.get(item.id);
		if (prev && !isItemContentEqual(prev, item)) {
			rollbackStatements.push({
				sql: "UPDATE study_pack_item SET pack_id = ?, day_index = ?, position = ?, source_kind = ?, source_id = ?, note = ? WHERE id = ?",
				args: [
					prev.packId,
					prev.dayIndex,
					prev.position,
					prev.sourceKind,
					prev.sourceId,
					prev.note,
					prev.id,
				],
			});
		}
	}

	const pushChunkedDeletes = (table: string, ids: readonly string[]) => {
		const chunkSize = 80;
		for (let i = 0; i < ids.length; i += chunkSize) {
			const chunk = ids.slice(i, i + chunkSize);
			rollbackStatements.push({
				sql: `DELETE FROM ${table} WHERE id IN (${chunk.map(() => "?").join(", ")})`,
				args: chunk,
			});
		}
	};
	pushChunkedDeletes("study_pack_item", insertedItemIds);
	pushChunkedDeletes("study_pack", insertedPackIds);
	pushChunkedDeletes("study_pack_exercise", insertedExerciseIds);

	// Collect deduplicated R2 audio keys
	const audioTransferByKey = new Map<string, StudyPackAudioTransfer>();
	for (const ex of targetExercises) {
		const key = ex.audioKey?.trim();
		if (key && !audioTransferByKey.has(key)) {
			audioTransferByKey.set(key, { exerciseId: ex.id, audioKey: key });
		}
	}
	const audioTransfers = [...audioTransferByKey.values()].sort((a, b) =>
		a.audioKey.localeCompare(b.audioKey),
	);

	const preimage: StudyPackPromotePreimage = {
		capturedAt: new Date(nowMs).toISOString(),
		packs: [...existingPackById.values()].sort(compareById),
		exercises: [...existingExerciseById.values()].sort(compareById),
		items: [...existingItemById.values()].sort(compareById),
	};

	const contentHash = computeStudyPackContentHash({
		packs: targetPacks,
		exercises: targetExercises,
		items: targetItems,
	});

	return {
		targetPacks,
		targetExercises,
		targetItems,
		audioTransfers,
		diff: {
			pack: packDiff,
			exercise: exerciseDiff,
			item: itemDiff,
		},
		preimage,
		upsertStatements,
		rollbackStatements,
		contentHash,
	};
}

function sqlLiteral(value: unknown): string {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
	}
	return `'${String(value).replace(/'/g, "''")}'`;
}

export function formatStudyPackRollbackSql(plan: PromoteStudyPackPlan): string {
	const lines = [
		"-- Rollback SQL for staging -> production study_pack promotion",
		`-- Captured at: ${plan.preimage.capturedAt}`,
		`-- Scope: packs=${plan.targetPacks.length}, exercises=${plan.targetExercises.length}, items=${plan.targetItems.length}`,
		"-- Note: does not touch class_study_pack or unrelated study_pack rows.",
		"",
	];
	for (const stmt of plan.rollbackStatements) {
		let argIndex = 0;
		const args = stmt.args ?? [];
		const rendered = stmt.sql.replace(/\?/g, () =>
			sqlLiteral(args[argIndex++]),
		);
		lines.push(`${rendered};`);
	}
	lines.push("");
	return lines.join("\n");
}

export async function syncStudyPackPromoteAudioToR2(options: {
	accountId: string;
	apiToken: string;
	sourceBucket: string;
	targetBucket: string;
	transfers: readonly StudyPackAudioTransfer[];
	dryRun?: boolean;
	fetchImpl?: typeof fetch;
}): Promise<SyncStudyPackR2Result> {
	let existing = 0;
	let copied = 0;
	let missingOnSource = 0;
	let missingOnTarget = 0;
	let verified = 0;
	const missingSourceKeys: string[] = [];

	for (const transfer of options.transfers) {
		const targetHead = await headR2Object({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.audioKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (
			targetHead.exists &&
			(targetHead.size === null || targetHead.size > 0)
		) {
			existing++;
			verified++;
			continue;
		}

		const sourceHead = await headR2Object({
			accountId: options.accountId,
			bucketName: options.sourceBucket,
			objectKey: transfer.audioKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (
			!sourceHead.exists ||
			(sourceHead.size !== null && sourceHead.size <= 0)
		) {
			missingOnSource++;
			missingOnTarget++;
			missingSourceKeys.push(transfer.audioKey);
			continue;
		}

		if (options.dryRun) {
			missingOnTarget++;
			continue;
		}

		const bytes = await getR2ObjectBytes({
			accountId: options.accountId,
			bucketName: options.sourceBucket,
			objectKey: transfer.audioKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_R2_AUDIO_BYTES) {
			throw new Error(
				`Invalid MP3 byte length (${bytes.byteLength}) for "${transfer.audioKey}".`,
			);
		}
		await putR2ObjectBytes({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.audioKey,
			apiToken: options.apiToken,
			bytes,
			contentType: "audio/mpeg",
			fetchImpl: options.fetchImpl,
		});
		const verifyHead = await headR2Object({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.audioKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (
			!verifyHead.exists ||
			(verifyHead.size !== null && verifyHead.size <= 0)
		) {
			throw new Error(
				`R2 verification failed after copying audio key "${transfer.audioKey}".`,
			);
		}
		copied++;
		verified++;
	}

	return {
		total: options.transfers.length,
		existing,
		copied,
		missingOnSource,
		missingOnTarget,
		missingSourceKeys,
		verified,
	};
}

export async function applyPromoteStudyPackPlan(
	prodRunner: StudyPackPromoteSqlRunner,
	plan: PromoteStudyPackPlan,
): Promise<{ statementsExecuted: number }> {
	if (plan.consumed) {
		throw new Error(
			"PromoteStudyPackPlan has already been applied; rebuild a fresh plan before retrying.",
		);
	}
	plan.consumed = true;
	await prodRunner.run(plan.upsertStatements);
	return { statementsExecuted: plan.upsertStatements.length };
}

export async function verifyPromotedStudyPacks(
	prodRunner: StudyPackPromoteSqlRunner,
	plan: PromoteStudyPackPlan,
): Promise<VerifyPromotedStudyPacksResult> {
	const nowMs = Date.now();
	const [packRows, exerciseRows, itemRows] = await Promise.all([
		queryByIdsInChunks(
			prodRunner,
			"study_pack",
			"id, org_id, title, description, level, status, source_pack_id, created_by, created_at, updated_at",
			"id",
			plan.targetPacks.map((p) => p.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"study_pack_exercise",
			"id, skill, part, type, title, band, level, intro, passage, audio_url, audio_key, transcript, questions, option_bank, note, status, created_by, created_at, updated_at",
			"id",
			plan.targetExercises.map((e) => e.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"study_pack_item",
			"id, pack_id, day_index, position, source_kind, source_id, note",
			"id",
			plan.targetItems.map((i) => i.id),
		),
	]);

	const actualPacks = packRows
		.map((r) => parseStudyPackRow(r, nowMs))
		.sort(compareById);
	const actualExercises = exerciseRows
		.map((r) => parseStudyPackExerciseRow(r, nowMs))
		.sort(compareById);
	const actualItems = itemRows.map(parseStudyPackItemRow).sort(compareById);

	const mismatches: string[] = [];
	if (actualPacks.length !== plan.targetPacks.length) {
		mismatches.push(
			`study_pack count mismatch: actual=${actualPacks.length}, expected=${plan.targetPacks.length}`,
		);
	}
	if (actualExercises.length !== plan.targetExercises.length) {
		mismatches.push(
			`study_pack_exercise count mismatch: actual=${actualExercises.length}, expected=${plan.targetExercises.length}`,
		);
	}
	if (actualItems.length !== plan.targetItems.length) {
		mismatches.push(
			`study_pack_item count mismatch: actual=${actualItems.length}, expected=${plan.targetItems.length}`,
		);
	}

	const packIdSet = new Set(actualPacks.map((p) => p.id));
	const exerciseIdSet = new Set(actualExercises.map((e) => e.id));
	for (const item of actualItems) {
		if (!packIdSet.has(item.packId)) {
			mismatches.push(
				`study_pack_item "${item.id}" references missing pack "${item.packId}"`,
			);
		}
		if (
			item.sourceKind === "library_exercise" &&
			!exerciseIdSet.has(item.sourceId)
		) {
			mismatches.push(
				`study_pack_item "${item.id}" references missing exercise "${item.sourceId}"`,
			);
		}
	}

	const actualHash = computeStudyPackContentHash({
		packs: actualPacks,
		exercises: actualExercises,
		items: actualItems,
	});
	if (actualHash !== plan.contentHash) {
		mismatches.push(
			`content parity SHA-256 mismatch: actual=${actualHash}, expected=${plan.contentHash}`,
		);
	}

	return {
		ok: mismatches.length === 0,
		expectedHash: plan.contentHash,
		actualHash,
		counts: {
			pack: { expected: plan.targetPacks.length, actual: actualPacks.length },
			exercise: {
				expected: plan.targetExercises.length,
				actual: actualExercises.length,
			},
			item: { expected: plan.targetItems.length, actual: actualItems.length },
		},
		mismatches,
	};
}
