/**
 * Pipeline audit & promote bộ từ vựng giáo viên tạo (`vocab_group`, `vocab_deck`,
 * `vocab_word` + R2 audio trong bucket `media`) từ Cloudflare D1 staging lên
 * Cloudflare D1 production.
 *
 * Nguyên tắc an toàn:
 * - Mặc định read-only (`audit-staging` / `dry-run`); ghi dữ liệu chỉ qua
 *   `applyPromoteVocabPlan` sau khi đã chụp preimage backup + sinh rollback SQL.
 * - Mọi deck promote sang production đều được gán `org_id = targetOrgId` và
 *   `class_id = NULL` (ngân hàng từ vựng độc lập của org, không gắn lớp staging).
 * - Không bao giờ chạm tới `vocab_card`, `vocab_review_log`, `vocab_suggestion`
 *   hay bất kỳ bộ từ vựng nào ngoài phạm vi đã chọn.
 * - Chặn fail-closed khi phát hiện đụng ID khác org, đụng tên nhóm cùng org
 *   nhưng khác ID, đụng deck đang gắn lớp học, hoặc đụng word thuộc deck khác.
 * - Không sửa `vocab-library.ts` (giữ nguyên license gate của thư viện built-in).
 */
import { createHash } from "node:crypto";
import type { Client, InValue } from "@libsql/client";
import { d1Query, redactSensitive } from "../audit/orphan-materials";
import { headR2Object, MAX_R2_AUDIO_BYTES, putR2ObjectBytes } from "./r2-audio";
import { PROD_D1_NAME_REGEX, STAGING_D1_NAME_REGEX } from "./vocab-library";

export const STAGING_MEDIA_R2_BUCKET_REGEX =
	/^teacher-os-media-staging-[a-z2-7]{16}$/;
export const PROD_MEDIA_R2_BUCKET_REGEX =
	/^teacher-os-media-prod-[a-z2-7]{16}$/;

const D1_UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_VOCAB_TABLES = [
	"organization",
	"vocab_group",
	"vocab_deck",
	"vocab_word",
] as const;

export interface SqlStatement {
	sql: string;
	args?: unknown[];
}

export interface VocabPromoteSqlRunner {
	queryRows(
		sql: string,
		params?: unknown[],
	): Promise<Array<Record<string, unknown>>>;
	run(statements: SqlStatement[]): Promise<void>;
}

export interface VocabGroupRow {
	id: string;
	orgId: string;
	name: string;
	normalizedName: string;
	createdAt: number;
	updatedAt: number;
}

export interface VocabDeckRow {
	id: string;
	orgId: string;
	classId: string | null;
	groupId: string | null;
	title: string;
	lessonNumber: number | null;
	topic: string | null;
	lang: string;
	sourceLibraryDeckId: string | null;
	sourceDeckId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface VocabWordRow {
	id: string;
	deckId: string;
	word: string;
	entryType: "word" | "chunk";
	ipa: string | null;
	pos: string | null;
	translation: string;
	example: string | null;
	audioKey: string | null;
	audioUrl: string | null;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
}

export interface StagingDeckAuditSummary {
	id: string;
	orgId: string;
	groupId: string | null;
	classId: string | null;
	title: string;
	lessonNumber: number | null;
	topic: string | null;
	lang: string;
	wordCount: number;
	audioKeyCount: number;
}

export interface StagingGroupAuditSummary {
	id: string;
	orgId: string;
	name: string;
	normalizedName: string;
	bankDecks: StagingDeckAuditSummary[];
	classDeckCount: number;
	totalBankWords: number;
	totalBankAudioKeys: number;
}

export interface StagingVocabAuditResult {
	groups: StagingGroupAuditSummary[];
	ungroupedBankDecks: StagingDeckAuditSummary[];
	totalGroups: number;
	totalBankDecks: number;
	totalClassDecks: number;
	totalBankWords: number;
	totalBankAudioKeys: number;
}

export interface VocabSelection {
	groupNames?: readonly string[];
	groupIds?: readonly string[];
	deckTitles?: readonly string[];
	deckIds?: readonly string[];
	sourceOrgId?: string;
	includeClassDecks?: boolean;
}

export interface SelectedStagingVocabData {
	groups: VocabGroupRow[];
	decks: VocabDeckRow[];
	words: VocabWordRow[];
}

export interface VocabAudioTransfer {
	wordId: string;
	sourceKey: string;
	targetKey: string;
}

export interface TablePromoteDiff {
	total: number;
	toInsert: number;
	toUpdate: number;
	unchanged: number;
}

export interface VocabPromotePreimage {
	capturedAt: string;
	targetOrgId: string;
	groups: VocabGroupRow[];
	decks: VocabDeckRow[];
	words: VocabWordRow[];
}

export interface ResolvedTargetOrg {
	orgId: string;
	resolvedVia: "explicit" | "teacher_emails" | "lead_org_fallback";
	sameAsLeadOrg: boolean;
}

export interface ProdOrgVocabBucket {
	orgId: string;
	groupCount: number;
	deckCount: number;
	wordCount: number;
}

export interface PromoteVocabPlan {
	targetOrgId: string;
	relocateFromOrgId: string | null;
	targetGroups: VocabGroupRow[];
	targetDecks: VocabDeckRow[];
	targetWords: VocabWordRow[];
	audioTransfers: VocabAudioTransfer[];
	diff: {
		group: TablePromoteDiff;
		deck: TablePromoteDiff;
		word: TablePromoteDiff;
	};
	preimage: VocabPromotePreimage;
	upsertStatements: SqlStatement[];
	rollbackStatements: SqlStatement[];
	contentHash: string;
	consumed?: boolean;
}

export interface VerifyPromotedVocabResult {
	ok: boolean;
	expectedHash: string;
	actualHash: string;
	counts: {
		group: { expected: number; actual: number };
		deck: { expected: number; actual: number };
		word: { expected: number; actual: number };
	};
	mismatches: string[];
}

export interface SyncVocabAudioResult {
	total: number;
	existing: number;
	copied: number;
	missingOnSource: number;
	missingOnTarget: number;
	verified: number;
}

export function normalizeVocabLabel(value: string): string {
	return value.trim().normalize("NFC").toLocaleLowerCase("vi");
}

function toNullableString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return String(value);
}

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toTimestampMs(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parseGroupRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabGroupRow {
	const name = String(row.name ?? "");
	const normalized =
		row.normalized_name !== null && row.normalized_name !== undefined
			? String(row.normalized_name)
			: normalizeVocabLabel(name);
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		name,
		normalizedName: normalized,
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseDeckRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabDeckRow {
	return {
		id: String(row.id),
		orgId: String(row.org_id),
		classId: toNullableString(row.class_id),
		groupId: toNullableString(row.group_id),
		title: String(row.title ?? ""),
		lessonNumber: toNullableNumber(row.lesson_number),
		topic: toNullableString(row.topic),
		lang: String(row.lang ?? "en"),
		sourceLibraryDeckId: toNullableString(row.source_library_deck_id),
		sourceDeckId: toNullableString(row.source_deck_id),
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function parseWordRow(
	row: Record<string, unknown>,
	nowMs: number,
): VocabWordRow {
	const rawEntryType = String(row.entry_type ?? "word");
	const entryType: "word" | "chunk" =
		rawEntryType === "chunk" ? "chunk" : "word";
	return {
		id: String(row.id),
		deckId: String(row.deck_id),
		word: String(row.word ?? ""),
		entryType,
		ipa: toNullableString(row.ipa),
		pos: toNullableString(row.pos),
		translation: String(row.translation ?? ""),
		example: toNullableString(row.example),
		audioKey: toNullableString(row.audio_key),
		audioUrl: toNullableString(row.audio_url),
		sortOrder: toNullableNumber(row.sort_order) ?? 0,
		createdAt: toTimestampMs(row.created_at, nowMs),
		updatedAt: toTimestampMs(row.updated_at, nowMs),
	};
}

function compareById(a: { id: string }, b: { id: string }): number {
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

export function remapVocabAudioKey(
	audioKey: string | null,
	sourceOrgId: string,
	targetOrgId: string,
): string | null {
	if (!audioKey) return null;
	const trimmed = audioKey.trim();
	if (trimmed.length === 0) return null;
	const sourcePrefix = `vocab/${sourceOrgId}/`;
	if (trimmed.startsWith(sourcePrefix)) {
		return `vocab/${targetOrgId}/${trimmed.slice(sourcePrefix.length)}`;
	}
	return trimmed;
}

export function computeVocabContentHash(input: {
	groups: readonly VocabGroupRow[];
	decks: readonly VocabDeckRow[];
	words: readonly VocabWordRow[];
}): string {
	const hash = createHash("sha256");
	for (const g of [...input.groups].sort(compareById)) {
		hash.update(
			`${JSON.stringify(["group", g.id, g.orgId, g.name, g.normalizedName])}\n`,
		);
	}
	for (const d of [...input.decks].sort(compareById)) {
		hash.update(
			`${JSON.stringify([
				"deck",
				d.id,
				d.orgId,
				d.classId,
				d.groupId,
				d.title,
				d.lessonNumber,
				d.topic,
				d.lang,
				d.sourceLibraryDeckId,
				d.sourceDeckId,
			])}\n`,
		);
	}
	for (const w of [...input.words].sort(compareById)) {
		hash.update(
			`${JSON.stringify([
				"word",
				w.id,
				w.deckId,
				w.word,
				w.entryType,
				w.ipa,
				w.pos,
				w.translation,
				w.example,
				w.audioKey,
				w.audioUrl,
				w.sortOrder,
			])}\n`,
		);
	}
	return hash.digest("hex");
}

function isGroupContentEqual(a: VocabGroupRow, b: VocabGroupRow): boolean {
	return (
		a.id === b.id &&
		a.orgId === b.orgId &&
		a.name === b.name &&
		a.normalizedName === b.normalizedName
	);
}

function isDeckContentEqual(a: VocabDeckRow, b: VocabDeckRow): boolean {
	return (
		a.id === b.id &&
		a.orgId === b.orgId &&
		a.classId === b.classId &&
		a.groupId === b.groupId &&
		a.title === b.title &&
		a.lessonNumber === b.lessonNumber &&
		a.topic === b.topic &&
		a.lang === b.lang &&
		a.sourceLibraryDeckId === b.sourceLibraryDeckId &&
		a.sourceDeckId === b.sourceDeckId
	);
}

function isWordContentEqual(a: VocabWordRow, b: VocabWordRow): boolean {
	return (
		a.id === b.id &&
		a.deckId === b.deckId &&
		a.word === b.word &&
		a.entryType === b.entryType &&
		a.ipa === b.ipa &&
		a.pos === b.pos &&
		a.translation === b.translation &&
		a.example === b.example &&
		a.audioKey === b.audioKey &&
		a.audioUrl === b.audioUrl &&
		a.sortOrder === b.sortOrder
	);
}

export function createLibsqlVocabPromoteRunner(
	client: Client,
): VocabPromoteSqlRunner {
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
		async run(statements: SqlStatement[]): Promise<void> {
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

export function createD1VocabPromoteRunner(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): VocabPromoteSqlRunner {
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
		async run(statements: SqlStatement[]): Promise<void> {
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
	runner: VocabPromoteSqlRunner,
	table: "vocab_group" | "vocab_deck" | "vocab_word",
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

async function probeVocabSchema(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{
	hasSchema: boolean;
	missingTables: string[];
	probeError?: string;
}> {
	try {
		const rows = await d1Query({
			accountId: options.accountId,
			databaseId: options.databaseId,
			apiToken: options.apiToken,
			sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('organization','vocab_group','vocab_deck','vocab_word')",
			fetchImpl: options.fetchImpl,
			timeoutMs: options.timeoutMs,
		});
		const present = new Set(rows.map((r) => String(r.name)));
		const missingTables = REQUIRED_VOCAB_TABLES.filter((t) => !present.has(t));
		return {
			hasSchema: missingTables.length === 0,
			missingTables,
		};
	} catch (err) {
		return {
			hasSchema: false,
			missingTables: [...REQUIRED_VOCAB_TABLES],
			probeError: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function resolveVocabD1Database(options: {
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
		const probe = await probeVocabSchema({
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
				`${options.stage} D1 database "${dbName}" is missing required vocab tables: [${probe.missingTables.join(", ")}]`,
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
			const probe = await probeVocabSchema({
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

	const finalProbe = await probeVocabSchema({
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
			`${options.stage} D1 database "${match.name}" is missing required vocab tables: [${finalProbe.missingTables.join(", ")}]`,
		);
	}
	return { id: match.uuid, name: match.name };
}

export async function resolveMediaR2BucketName(options: {
	stage: "staging" | "prod";
	accountId: string;
	apiToken: string;
	explicitBucket?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<string> {
	const explicit = options.explicitBucket?.trim();
	if (explicit) {
		if (options.stage === "staging" && /-prod-/i.test(explicit)) {
			throw new Error(
				`Refusing production-like R2 bucket "${explicit}" for stage "staging".`,
			);
		}
		if (options.stage === "prod" && /-staging-/i.test(explicit)) {
			throw new Error(
				`Refusing staging-like R2 bucket "${explicit}" for stage "prod".`,
			);
		}
		return explicit;
	}

	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const prefix =
		options.stage === "staging"
			? "teacher-os-media-staging-"
			: "teacher-os-media-prod-";
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets?name_contains=${encodeURIComponent(prefix)}`;
	const res = await fetchFn(url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	const raw = await res.text();
	let payload: {
		success?: boolean;
		errors?: Array<{ message?: string }>;
		result?: { buckets?: Array<{ name?: string }> };
	};
	try {
		payload = JSON.parse(raw) as typeof payload;
	} catch {
		throw new Error(`R2 list buckets failed (${res.status}): invalid JSON`);
	}
	if (!res.ok || payload.success !== true) {
		const errMsg =
			payload.errors?.map((e) => e.message ?? "error").join("; ") ??
			`HTTP ${res.status}`;
		throw new Error(
			redactSensitive(`R2 list buckets failed (${res.status}): ${errMsg}`, [
				options.apiToken,
			]),
		);
	}
	const regex =
		options.stage === "staging"
			? STAGING_MEDIA_R2_BUCKET_REGEX
			: PROD_MEDIA_R2_BUCKET_REGEX;
	const buckets = (payload.result?.buckets ?? [])
		.map((b) => b.name)
		.filter(
			(name): name is string => typeof name === "string" && regex.test(name),
		);
	const [match] = buckets;
	if (buckets.length !== 1 || !match) {
		throw new Error(
			`Expected exactly 1 ${options.stage} media R2 bucket matching ${regex}, found ${buckets.length}.`,
		);
	}
	return match;
}

export async function auditStagingVocab(
	stagingRunner: VocabPromoteSqlRunner,
	options?: { sourceOrgId?: string },
): Promise<StagingVocabAuditResult> {
	const orgFilter = options?.sourceOrgId?.trim();
	const groupRows = orgFilter
		? await stagingRunner.queryRows(
				"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group WHERE org_id = ? ORDER BY created_at ASC, id ASC",
				[orgFilter],
			)
		: await stagingRunner.queryRows(
				"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group ORDER BY org_id ASC, created_at ASC, id ASC",
			);

	const deckRows = orgFilter
		? await stagingRunner.queryRows(
				`SELECT d.id, d.org_id, d.group_id, d.class_id, d.title, d.lesson_number, d.topic, d.lang,
				        COUNT(w.id) AS word_count,
				        SUM(CASE WHEN w.audio_key IS NOT NULL AND TRIM(w.audio_key) != '' THEN 1 ELSE 0 END) AS audio_key_count
				   FROM vocab_deck d
				   LEFT JOIN vocab_word w ON w.deck_id = d.id
				  WHERE d.org_id = ?
				  GROUP BY d.id
				  ORDER BY d.lesson_number IS NULL ASC, d.lesson_number ASC, d.created_at ASC, d.id ASC`,
				[orgFilter],
			)
		: await stagingRunner.queryRows(
				`SELECT d.id, d.org_id, d.group_id, d.class_id, d.title, d.lesson_number, d.topic, d.lang,
				        COUNT(w.id) AS word_count,
				        SUM(CASE WHEN w.audio_key IS NOT NULL AND TRIM(w.audio_key) != '' THEN 1 ELSE 0 END) AS audio_key_count
				   FROM vocab_deck d
				   LEFT JOIN vocab_word w ON w.deck_id = d.id
				  GROUP BY d.id
				  ORDER BY d.org_id ASC, d.lesson_number IS NULL ASC, d.lesson_number ASC, d.created_at ASC, d.id ASC`,
			);

	const decksByGroup = new Map<string, StagingDeckAuditSummary[]>();
	const classDeckCountByGroup = new Map<string, number>();
	const ungroupedBankDecks: StagingDeckAuditSummary[] = [];
	let totalBankDecks = 0;
	let totalClassDecks = 0;
	let totalBankWords = 0;
	let totalBankAudioKeys = 0;

	for (const row of deckRows) {
		const deck: StagingDeckAuditSummary = {
			id: String(row.id),
			orgId: String(row.org_id),
			groupId: toNullableString(row.group_id),
			classId: toNullableString(row.class_id),
			title: String(row.title ?? ""),
			lessonNumber: toNullableNumber(row.lesson_number),
			topic: toNullableString(row.topic),
			lang: String(row.lang ?? "en"),
			wordCount: Number(row.word_count ?? 0),
			audioKeyCount: Number(row.audio_key_count ?? 0),
		};

		if (deck.classId !== null) {
			totalClassDecks++;
			if (deck.groupId) {
				classDeckCountByGroup.set(
					deck.groupId,
					(classDeckCountByGroup.get(deck.groupId) ?? 0) + 1,
				);
			}
			continue;
		}

		totalBankDecks++;
		totalBankWords += deck.wordCount;
		totalBankAudioKeys += deck.audioKeyCount;

		if (deck.groupId) {
			const bucket = decksByGroup.get(deck.groupId) ?? [];
			bucket.push(deck);
			decksByGroup.set(deck.groupId, bucket);
		} else {
			ungroupedBankDecks.push(deck);
		}
	}

	const groups: StagingGroupAuditSummary[] = groupRows.map((row) => {
		const id = String(row.id);
		const bankDecks = decksByGroup.get(id) ?? [];
		return {
			id,
			orgId: String(row.org_id),
			name: String(row.name ?? ""),
			normalizedName: String(row.normalized_name ?? ""),
			bankDecks,
			classDeckCount: classDeckCountByGroup.get(id) ?? 0,
			totalBankWords: bankDecks.reduce((acc, d) => acc + d.wordCount, 0),
			totalBankAudioKeys: bankDecks.reduce(
				(acc, d) => acc + d.audioKeyCount,
				0,
			),
		};
	});

	return {
		groups,
		ungroupedBankDecks,
		totalGroups: groups.length,
		totalBankDecks,
		totalClassDecks,
		totalBankWords,
		totalBankAudioKeys,
	};
}

export function formatStagingVocabAuditReport(
	audit: StagingVocabAuditResult,
	options?: { publicLogs?: boolean },
): string {
	const publicLogs = options?.publicLogs ?? false;
	const lines: string[] = [
		"=== Staging Vocab Inventory (Read-Only) ===",
		`Summary: groups=${audit.totalGroups}, bank_decks=${audit.totalBankDecks}, class_decks=${audit.totalClassDecks} (excluded by default), bank_words=${audit.totalBankWords}, bank_audio_keys=${audit.totalBankAudioKeys}`,
		"",
		`-- Vocab Groups (${audit.groups.length}) --`,
	];

	if (audit.groups.length === 0) {
		lines.push("  (không có vocab_group nào)");
	} else {
		for (const g of audit.groups) {
			const idSuffix = publicLogs ? "" : ` [id=${g.id}, org=${g.orgId}]`;
			lines.push(
				`  * Group: "${g.name}"${idSuffix} — bankDecks=${g.bankDecks.length}, classDecks=${g.classDeckCount}, words=${g.totalBankWords}, audioKeys=${g.totalBankAudioKeys}`,
			);
			for (const d of g.bankDecks) {
				const lessonPart = d.lessonNumber !== null ? `L${d.lessonNumber} ` : "";
				const topicPart = d.topic ? ` (${d.topic})` : "";
				const deckIdSuffix = publicLogs ? "" : ` [id=${d.id}]`;
				lines.push(
					`      - ${lessonPart}"${d.title}"${topicPart}${deckIdSuffix}: words=${d.wordCount}, audio=${d.audioKeyCount}`,
				);
			}
		}
	}

	lines.push("");
	lines.push(`-- Ungrouped Bank Decks (${audit.ungroupedBankDecks.length}) --`);
	if (audit.ungroupedBankDecks.length === 0) {
		lines.push("  (không có bank deck rời nào)");
	} else {
		for (const d of audit.ungroupedBankDecks) {
			const lessonPart = d.lessonNumber !== null ? `L${d.lessonNumber} ` : "";
			const topicPart = d.topic ? ` (${d.topic})` : "";
			const deckIdSuffix = publicLogs ? "" : ` [id=${d.id}, org=${d.orgId}]`;
			lines.push(
				`  * ${lessonPart}"${d.title}"${topicPart}${deckIdSuffix}: words=${d.wordCount}, audio=${d.audioKeyCount}`,
			);
		}
	}

	return lines.join("\n");
}

export async function loadSelectedStagingVocab(
	stagingRunner: VocabPromoteSqlRunner,
	selection: VocabSelection,
): Promise<SelectedStagingVocabData> {
	const groupNames = (selection.groupNames ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const groupIds = (selection.groupIds ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const deckTitles = (selection.deckTitles ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const deckIds = (selection.deckIds ?? [])
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	if (
		groupNames.length === 0 &&
		groupIds.length === 0 &&
		deckTitles.length === 0 &&
		deckIds.length === 0
	) {
		throw new Error(
			"Must select at least one vocab group or deck (--group, --group-id, --deck, or --deck-id).",
		);
	}

	const nowMs = Date.now();
	const sourceOrgId = selection.sourceOrgId?.trim();
	const includeClassDecks = selection.includeClassDecks ?? false;

	const rawGroups = sourceOrgId
		? await stagingRunner.queryRows(
				"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group WHERE org_id = ? ORDER BY created_at ASC, id ASC",
				[sourceOrgId],
			)
		: await stagingRunner.queryRows(
				"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group ORDER BY created_at ASC, id ASC",
			);
	const allGroups = rawGroups.map((r) => parseGroupRow(r, nowMs));
	const groupById = new Map(allGroups.map((g) => [g.id, g]));

	const rawDecks = sourceOrgId
		? await stagingRunner.queryRows(
				`SELECT id, org_id, class_id, group_id, title, lesson_number, topic, lang, source_library_deck_id, source_deck_id, created_at, updated_at
				   FROM vocab_deck
				  WHERE org_id = ?${includeClassDecks ? "" : " AND class_id IS NULL"}
				  ORDER BY lesson_number IS NULL ASC, lesson_number ASC, created_at ASC, id ASC`,
				[sourceOrgId],
			)
		: await stagingRunner.queryRows(
				`SELECT id, org_id, class_id, group_id, title, lesson_number, topic, lang, source_library_deck_id, source_deck_id, created_at, updated_at
				   FROM vocab_deck
				  ${includeClassDecks ? "" : "WHERE class_id IS NULL"}
				  ORDER BY lesson_number IS NULL ASC, lesson_number ASC, created_at ASC, id ASC`,
			);
	const allDecks = rawDecks.map((r) => parseDeckRow(r, nowMs));

	const selectedGroupMap = new Map<string, VocabGroupRow>();
	const selectedDeckMap = new Map<string, VocabDeckRow>();

	for (const wantedName of groupNames) {
		const normalizedWanted = normalizeVocabLabel(wantedName);
		const matches = allGroups.filter(
			(g) =>
				g.normalizedName === normalizedWanted ||
				normalizeVocabLabel(g.name) === normalizedWanted,
		);
		if (matches.length === 0) {
			throw new Error(
				`No vocab_group found on staging matching name "${wantedName}". Run --mode audit-staging first to inspect exact names.`,
			);
		}
		for (const g of matches) {
			selectedGroupMap.set(g.id, g);
		}
	}

	for (const wantedId of groupIds) {
		const match = groupById.get(wantedId);
		if (!match) {
			throw new Error(`No vocab_group found on staging with id "${wantedId}".`);
		}
		selectedGroupMap.set(match.id, match);
	}

	// Include all eligible decks belonging to selected groups
	for (const deck of allDecks) {
		if (deck.groupId && selectedGroupMap.has(deck.groupId)) {
			selectedDeckMap.set(deck.id, deck);
		}
	}

	for (const wantedTitle of deckTitles) {
		const normalizedWanted = normalizeVocabLabel(wantedTitle);
		const matches = allDecks.filter(
			(d) => normalizeVocabLabel(d.title) === normalizedWanted,
		);
		if (matches.length === 0) {
			throw new Error(
				`No bank vocab_deck found on staging matching title "${wantedTitle}". Run --mode audit-staging first to inspect exact titles.`,
			);
		}
		for (const d of matches) {
			selectedDeckMap.set(d.id, d);
			if (d.groupId) {
				const parentGroup = groupById.get(d.groupId);
				if (parentGroup) selectedGroupMap.set(parentGroup.id, parentGroup);
			}
		}
	}

	for (const wantedId of deckIds) {
		const match = allDecks.find((d) => d.id === wantedId);
		if (!match) {
			throw new Error(
				`No bank vocab_deck found on staging with id "${wantedId}".`,
			);
		}
		selectedDeckMap.set(match.id, match);
		if (match.groupId) {
			const parentGroup = groupById.get(match.groupId);
			if (parentGroup) selectedGroupMap.set(parentGroup.id, parentGroup);
		}
	}

	const groups = [...selectedGroupMap.values()].sort(compareById);
	const decks = [...selectedDeckMap.values()].sort(compareById);

	if (decks.length === 0) {
		throw new Error(
			"Selection resolved to 0 bank decks on staging; refusing empty migration.",
		);
	}

	const rawWords = await queryByIdsInChunks(
		stagingRunner,
		"vocab_word",
		"id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at",
		"deck_id",
		decks.map((d) => d.id),
	);
	const words = rawWords.map((r) => parseWordRow(r, nowMs)).sort(compareById);

	return { groups, decks, words };
}

function buildChunkedUpsertStatements<T>(options: {
	table: string;
	columns: readonly string[];
	updateColumns: readonly string[];
	rows: readonly T[];
	toParams: (row: T) => unknown[];
	maxParamsPerStatement?: number;
}): SqlStatement[] {
	if (options.rows.length === 0) return [];
	const maxParams = options.maxParamsPerStatement ?? 90;
	const colsPerRow = options.columns.length;
	const rowsPerChunk = Math.max(1, Math.floor(maxParams / colsPerRow));
	const rowPlaceholder = `(${options.columns.map(() => "?").join(", ")})`;
	const updateClause = options.updateColumns
		.map((col) => `${col} = excluded.${col}`)
		.join(", ");

	const statements: SqlStatement[] = [];
	for (let i = 0; i < options.rows.length; i += rowsPerChunk) {
		const chunk = options.rows.slice(i, i + rowsPerChunk);
		const placeholders = chunk.map(() => rowPlaceholder).join(", ");
		const args: unknown[] = [];
		for (const row of chunk) {
			args.push(...options.toParams(row));
		}
		statements.push({
			sql: `INSERT INTO ${options.table} (${options.columns.join(", ")}) VALUES ${placeholders} ON CONFLICT(id) DO UPDATE SET ${updateClause}`,
			args,
		});
	}
	return statements;
}

/**
 * Phân giải `organization.id` đích trên production theo đúng quy tắc của
 * `resolveLeadTargetOrg` (`apps/server/src/lib/resolve-lead-org.ts`):
 * 1. Nếu truyền tường minh `explicitTargetOrgId` -> dùng trực tiếp.
 * 2. Nếu có `teacherEmails` (`TEACHER_EMAILS`) và tồn tại thành viên thuộc
 *    `FINANCE_ROLES` (`teacher`, `owner`, `admin`, bỏ qua `user.role` là
 *    `student`/`admin`) -> chọn org hoạt động của giáo viên theo thứ tự
 *    `teacherEmails`, rồi `membership.created_at ASC, membership.id ASC`.
 * 3. Fallback về `leadOrgId` (`LEAD_ORG_ID`) nếu chưa có membership khớp.
 */
export async function resolveTargetTeacherOrgId(
	prodRunner: VocabPromoteSqlRunner,
	options: {
		explicitTargetOrgId?: string | null;
		teacherEmails?: string | readonly string[] | null;
		leadOrgId?: string | null;
	},
): Promise<ResolvedTargetOrg> {
	const leadOrgId = options.leadOrgId?.trim() ?? "";
	const explicit = options.explicitTargetOrgId?.trim() ?? "";
	if (explicit) {
		return {
			orgId: explicit,
			resolvedVia: "explicit",
			sameAsLeadOrg: leadOrgId.length > 0 && explicit === leadOrgId,
		};
	}

	const rawEmails = Array.isArray(options.teacherEmails)
		? options.teacherEmails
		: typeof options.teacherEmails === "string"
			? options.teacherEmails.split(",")
			: [];
	const normalizedEmails = Array.from(
		new Set(
			rawEmails
				.map((email) => email.trim().toLowerCase())
				.filter((email) => email.length > 0),
		),
	);

	if (normalizedEmails.length > 0) {
		const placeholders = normalizedEmails.map(() => "?").join(", ");
		const rows = await prodRunner.queryRows(
			`SELECT m.org_id AS org_id, lower(trim(u.email)) AS email
			   FROM membership m
			   INNER JOIN user u ON u.id = m.user_id
			  WHERE m.role IN ('teacher', 'owner', 'admin')
			    AND (u.role IS NULL OR u.role NOT IN ('student', 'admin'))
			    AND lower(trim(u.email)) IN (${placeholders})
			  ORDER BY m.created_at ASC, m.id ASC`,
			normalizedEmails,
		);
		for (const email of normalizedEmails) {
			const match = rows.find((r) => String(r.email ?? "") === email);
			if (match?.org_id) {
				const orgId = String(match.org_id);
				return {
					orgId,
					resolvedVia: "teacher_emails",
					sameAsLeadOrg: leadOrgId.length > 0 && orgId === leadOrgId,
				};
			}
		}
	}

	if (leadOrgId) {
		return {
			orgId: leadOrgId,
			resolvedVia: "lead_org_fallback",
			sameAsLeadOrg: true,
		};
	}

	throw new Error(
		"Missing target organization ID: pass --target-org-id <orgId> or set TEACHER_EMAILS / TARGET_ORG_ID / LEAD_ORG_ID.",
	);
}

export async function auditProdOrgVocabSummary(
	prodRunner: VocabPromoteSqlRunner,
): Promise<ProdOrgVocabBucket[]> {
	const rows = await prodRunner.queryRows(
		`SELECT o.id AS org_id,
		        (SELECT COUNT(*) FROM vocab_group g WHERE g.org_id = o.id) AS group_count,
		        (SELECT COUNT(*) FROM vocab_deck d WHERE d.org_id = o.id) AS deck_count,
		        (SELECT COUNT(*) FROM vocab_word w INNER JOIN vocab_deck d ON d.id = w.deck_id WHERE d.org_id = o.id) AS word_count
		   FROM organization o
		  ORDER BY o.created_at ASC, o.id ASC`,
	);
	return rows.map((r) => ({
		orgId: String(r.org_id),
		groupCount: Number(r.group_count ?? 0),
		deckCount: Number(r.deck_count ?? 0),
		wordCount: Number(r.word_count ?? 0),
	}));
}

export async function buildPromoteVocabPlan(
	source: SelectedStagingVocabData,
	prodRunner: VocabPromoteSqlRunner,
	options: {
		targetOrgId: string;
		relocateFromOrgId?: string | null;
		nowMs?: number;
	},
): Promise<PromoteVocabPlan> {
	const targetOrgId = options.targetOrgId.trim();
	if (!targetOrgId) {
		throw new Error("targetOrgId is required to build a promote plan.");
	}
	const rawRelocate = options.relocateFromOrgId?.trim() ?? "";
	const relocateFromOrgId =
		rawRelocate && rawRelocate !== targetOrgId ? rawRelocate : null;
	const nowMs = options.nowMs ?? Date.now();

	// 1. Verify target organization exists on production
	const orgRows = await prodRunner.queryRows(
		"SELECT id, name FROM organization WHERE id = ?",
		[targetOrgId],
	);
	if (orgRows.length === 0) {
		throw new Error(
			`Target organization "${targetOrgId}" does not exist in production D1.`,
		);
	}

	// 2. Transform source rows for target org (always bank decks: classId = null)
	const includedDeckIds = new Set(source.decks.map((d) => d.id));
	const sourceDeckById = new Map(source.decks.map((d) => [d.id, d]));

	const targetGroups: VocabGroupRow[] = source.groups
		.map((g) => ({
			...g,
			orgId: targetOrgId,
			normalizedName: normalizeVocabLabel(g.name),
			updatedAt: nowMs,
		}))
		.sort(compareById);

	const targetDecks: VocabDeckRow[] = source.decks
		.map((d) => ({
			...d,
			orgId: targetOrgId,
			classId: null,
			sourceDeckId:
				d.sourceDeckId && includedDeckIds.has(d.sourceDeckId)
					? d.sourceDeckId
					: null,
			updatedAt: nowMs,
		}))
		.sort(compareById);

	const audioTransferByTargetKey = new Map<string, VocabAudioTransfer>();
	const targetWords: VocabWordRow[] = source.words
		.map((w) => {
			const srcDeck = sourceDeckById.get(w.deckId);
			const remappedAudioKey = remapVocabAudioKey(
				w.audioKey,
				srcDeck?.orgId ?? "",
				targetOrgId,
			);
			if (w.audioKey && remappedAudioKey) {
				if (!audioTransferByTargetKey.has(remappedAudioKey)) {
					audioTransferByTargetKey.set(remappedAudioKey, {
						wordId: w.id,
						sourceKey: w.audioKey.trim(),
						targetKey: remappedAudioKey,
					});
				}
			}
			return {
				...w,
				audioKey: remappedAudioKey,
				updatedAt: nowMs,
			};
		})
		.sort(compareById);

	const audioTransfers = [...audioTransferByTargetKey.values()].sort((a, b) =>
		a.targetKey.localeCompare(b.targetKey),
	);

	// Check duplicate normalized_name within source selection itself
	const seenNormalizedInSource = new Map<string, string>();
	for (const g of targetGroups) {
		const prevId = seenNormalizedInSource.get(g.normalizedName);
		if (prevId && prevId !== g.id) {
			throw new Error(
				`Duplicate normalized vocab_group name "${g.name}" in selected staging data.`,
			);
		}
		seenNormalizedInSource.set(g.normalizedName, g.id);
	}

	// 3. Inspect production preimage & check fail-closed safety invariants
	const existingGroupByIdRows = await queryByIdsInChunks(
		prodRunner,
		"vocab_group",
		"id, org_id, name, normalized_name, created_at, updated_at",
		"id",
		targetGroups.map((g) => g.id),
	);
	const existingGroupsInTargetOrgRows = await prodRunner.queryRows(
		"SELECT id, org_id, name, normalized_name, created_at, updated_at FROM vocab_group WHERE org_id = ?",
		[targetOrgId],
	);

	const existingGroupById = new Map<string, VocabGroupRow>();
	for (const r of existingGroupByIdRows) {
		const parsed = parseGroupRow(r, nowMs);
		existingGroupById.set(parsed.id, parsed);
	}
	const existingGroupByNormalizedName = new Map<string, VocabGroupRow>();
	for (const r of existingGroupsInTargetOrgRows) {
		const parsed = parseGroupRow(r, nowMs);
		existingGroupByNormalizedName.set(parsed.normalizedName, parsed);
	}

	for (const g of targetGroups) {
		const byId = existingGroupById.get(g.id);
		if (
			byId &&
			byId.orgId !== targetOrgId &&
			byId.orgId !== relocateFromOrgId
		) {
			throw new Error(
				`Safety gate: vocab_group id "${g.id}" already exists on production under a different organization.`,
			);
		}
		const byName = existingGroupByNormalizedName.get(g.normalizedName);
		if (byName && byName.id !== g.id) {
			throw new Error(
				`Safety gate: vocab_group "${g.name}" already exists in target production organization under a different ID. Resolve or rename the conflicting group before promoting.`,
			);
		}
	}

	const existingDeckRows = await queryByIdsInChunks(
		prodRunner,
		"vocab_deck",
		"id, org_id, class_id, group_id, title, lesson_number, topic, lang, source_library_deck_id, source_deck_id, created_at, updated_at",
		"id",
		targetDecks.map((d) => d.id),
	);
	const existingDeckById = new Map<string, VocabDeckRow>();
	for (const r of existingDeckRows) {
		const parsed = parseDeckRow(r, nowMs);
		existingDeckById.set(parsed.id, parsed);
	}
	for (const d of targetDecks) {
		const existing = existingDeckById.get(d.id);
		if (
			existing &&
			existing.orgId !== targetOrgId &&
			existing.orgId !== relocateFromOrgId
		) {
			throw new Error(
				`Safety gate: vocab_deck id "${d.id}" already exists on production under a different organization.`,
			);
		}
		if (existing && existing.classId !== null) {
			throw new Error(
				`Safety gate: vocab_deck id "${d.id}" already exists on production bound to a class; refusing to convert a class deck into a bank deck.`,
			);
		}
	}

	const existingWordRows = await queryByIdsInChunks(
		prodRunner,
		"vocab_word",
		"id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at",
		"id",
		targetWords.map((w) => w.id),
	);
	const existingWordById = new Map<string, VocabWordRow>();
	for (const r of existingWordRows) {
		const parsed = parseWordRow(r, nowMs);
		existingWordById.set(parsed.id, parsed);
	}
	for (const w of targetWords) {
		const existing = existingWordById.get(w.id);
		if (existing && !includedDeckIds.has(existing.deckId)) {
			throw new Error(
				`Safety gate: vocab_word id "${w.id}" already exists on production under a different deck outside this migration scope.`,
			);
		}
	}

	// 4. Compute diffs
	const computeDiff = <T extends { id: string }>(
		targets: readonly T[],
		existingMap: Map<string, T>,
		isEqual: (a: T, b: T) => boolean,
	): TablePromoteDiff => {
		let toInsert = 0;
		let toUpdate = 0;
		let unchanged = 0;
		for (const item of targets) {
			const prev = existingMap.get(item.id);
			if (!prev) {
				toInsert++;
			} else if (isEqual(prev, item)) {
				unchanged++;
			} else {
				toUpdate++;
			}
		}
		return { total: targets.length, toInsert, toUpdate, unchanged };
	};

	const diff = {
		group: computeDiff(targetGroups, existingGroupById, isGroupContentEqual),
		deck: computeDiff(targetDecks, existingDeckById, isDeckContentEqual),
		word: computeDiff(targetWords, existingWordById, isWordContentEqual),
	};

	// 5. Build idempotent UPSERT statements (parameterized, <= 90 params/query for D1)
	const upsertStatements: SqlStatement[] = [
		...buildChunkedUpsertStatements({
			table: "vocab_group",
			columns: [
				"id",
				"org_id",
				"name",
				"normalized_name",
				"created_at",
				"updated_at",
			],
			updateColumns: ["org_id", "name", "normalized_name", "updated_at"],
			rows: targetGroups,
			toParams: (g) => [
				g.id,
				g.orgId,
				g.name,
				g.normalizedName,
				g.createdAt,
				g.updatedAt,
			],
		}),
		...buildChunkedUpsertStatements({
			table: "vocab_deck",
			columns: [
				"id",
				"org_id",
				"class_id",
				"group_id",
				"title",
				"lesson_number",
				"topic",
				"lang",
				"source_library_deck_id",
				"source_deck_id",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"org_id",
				"group_id",
				"title",
				"lesson_number",
				"topic",
				"lang",
				"source_library_deck_id",
				"source_deck_id",
				"updated_at",
			],
			rows: targetDecks,
			toParams: (d) => [
				d.id,
				d.orgId,
				d.classId,
				d.groupId,
				d.title,
				d.lessonNumber,
				d.topic,
				d.lang,
				d.sourceLibraryDeckId,
				d.sourceDeckId,
				d.createdAt,
				d.updatedAt,
			],
		}),
		...buildChunkedUpsertStatements({
			table: "vocab_word",
			columns: [
				"id",
				"deck_id",
				"word",
				"entry_type",
				"ipa",
				"pos",
				"translation",
				"example",
				"audio_key",
				"audio_url",
				"sort_order",
				"created_at",
				"updated_at",
			],
			updateColumns: [
				"deck_id",
				"word",
				"entry_type",
				"ipa",
				"pos",
				"translation",
				"example",
				"audio_key",
				"audio_url",
				"sort_order",
				"updated_at",
			],
			rows: targetWords,
			toParams: (w) => [
				w.id,
				w.deckId,
				w.word,
				w.entryType,
				w.ipa,
				w.pos,
				w.translation,
				w.example,
				w.audioKey,
				w.audioUrl,
				w.sortOrder,
				w.createdAt,
				w.updatedAt,
			],
		}),
	];

	// 6. Build exact rollback statements:
	//    - Restore pre-existing rows (group -> deck -> word)
	//    - Delete newly inserted rows (word -> deck -> group)
	const rollbackStatements: SqlStatement[] = [];
	const insertedWordIds: string[] = [];
	const insertedDeckIds: string[] = [];
	const insertedGroupIds: string[] = [];

	for (const w of targetWords) {
		const prev = existingWordById.get(w.id);
		if (!prev) {
			insertedWordIds.push(w.id);
		}
	}
	for (const d of targetDecks) {
		const prev = existingDeckById.get(d.id);
		if (!prev) {
			insertedDeckIds.push(d.id);
		}
	}
	for (const g of targetGroups) {
		const prev = existingGroupById.get(g.id);
		if (!prev) {
			insertedGroupIds.push(g.id);
		}
	}

	// First restore existing parents so FK references remain valid
	for (const g of targetGroups) {
		const prev = existingGroupById.get(g.id);
		if (prev && !isGroupContentEqual(prev, g)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_group SET org_id = ?, name = ?, normalized_name = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.orgId,
					prev.name,
					prev.normalizedName,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const d of targetDecks) {
		const prev = existingDeckById.get(d.id);
		if (prev && !isDeckContentEqual(prev, d)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_deck SET org_id = ?, group_id = ?, title = ?, lesson_number = ?, topic = ?, lang = ?, source_library_deck_id = ?, source_deck_id = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.orgId,
					prev.groupId,
					prev.title,
					prev.lessonNumber,
					prev.topic,
					prev.lang,
					prev.sourceLibraryDeckId,
					prev.sourceDeckId,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}
	for (const w of targetWords) {
		const prev = existingWordById.get(w.id);
		if (prev && !isWordContentEqual(prev, w)) {
			rollbackStatements.push({
				sql: "UPDATE vocab_word SET deck_id = ?, word = ?, entry_type = ?, ipa = ?, pos = ?, translation = ?, example = ?, audio_key = ?, audio_url = ?, sort_order = ?, updated_at = ? WHERE id = ?",
				args: [
					prev.deckId,
					prev.word,
					prev.entryType,
					prev.ipa,
					prev.pos,
					prev.translation,
					prev.example,
					prev.audioKey,
					prev.audioUrl,
					prev.sortOrder,
					prev.updatedAt,
					prev.id,
				],
			});
		}
	}

	// Then delete newly inserted rows in strict child -> parent FK order
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
	pushChunkedDeletes("vocab_word", insertedWordIds);
	pushChunkedDeletes("vocab_deck", insertedDeckIds);
	pushChunkedDeletes("vocab_group", insertedGroupIds);

	const preimage: VocabPromotePreimage = {
		capturedAt: new Date(nowMs).toISOString(),
		targetOrgId,
		groups: [...existingGroupById.values()].sort(compareById),
		decks: [...existingDeckById.values()].sort(compareById),
		words: [...existingWordById.values()].sort(compareById),
	};

	const contentHash = computeVocabContentHash({
		groups: targetGroups,
		decks: targetDecks,
		words: targetWords,
	});

	return {
		targetOrgId,
		relocateFromOrgId,
		targetGroups,
		targetDecks,
		targetWords,
		audioTransfers,
		diff,
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

export function formatRollbackSql(plan: PromoteVocabPlan): string {
	const lines = [
		"-- Rollback SQL for staging -> production vocab promotion",
		`-- Captured at: ${plan.preimage.capturedAt}`,
		`-- Scope: groups=${plan.targetGroups.length}, decks=${plan.targetDecks.length}, words=${plan.targetWords.length}`,
		"-- Note: does not touch vocab_card, vocab_review_log, or vocab_suggestion.",
		"",
	];
	for (const stmt of plan.rollbackStatements) {
		let rendered = stmt.sql;
		for (const arg of stmt.args ?? []) {
			rendered = rendered.replace("?", sqlLiteral(arg));
		}
		lines.push(`${rendered};`);
	}
	lines.push("");
	return lines.join("\n");
}

function encodeR2ObjectPath(objectKey: string): string {
	return objectKey
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

async function getR2ObjectWithContentType(options: {
	accountId: string;
	bucketName: string;
	objectKey: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 60_000;
	const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/r2/buckets/${encodeURIComponent(options.bucketName)}/objects/${encodeR2ObjectPath(options.objectKey)}`;
	const res = await fetchFn(url, {
		method: "GET",
		headers: { authorization: `Bearer ${options.apiToken}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!res.ok) {
		throw new Error(`R2 GET "${options.objectKey}" failed (${res.status})`);
	}
	const contentType = res.headers.get("content-type")?.trim() || "audio/mpeg";
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_R2_AUDIO_BYTES) {
		throw new Error(
			`Invalid audio byte length (${bytes.byteLength}) for "${options.objectKey}"`,
		);
	}
	return { bytes, contentType };
}

export async function syncVocabAudioToR2(options: {
	accountId: string;
	apiToken: string;
	sourceBucket: string;
	targetBucket: string;
	transfers: readonly VocabAudioTransfer[];
	dryRun?: boolean;
	fetchImpl?: typeof fetch;
}): Promise<SyncVocabAudioResult> {
	let existing = 0;
	let copied = 0;
	let missingOnSource = 0;
	let missingOnTarget = 0;
	let verified = 0;

	for (const transfer of options.transfers) {
		const targetHead = await headR2Object({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.targetKey,
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
			objectKey: transfer.sourceKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (
			!sourceHead.exists ||
			(sourceHead.size !== null && sourceHead.size <= 0)
		) {
			missingOnSource++;
			missingOnTarget++;
			continue;
		}

		if (options.dryRun) {
			missingOnTarget++;
			continue;
		}

		const { bytes, contentType } = await getR2ObjectWithContentType({
			accountId: options.accountId,
			bucketName: options.sourceBucket,
			objectKey: transfer.sourceKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		await putR2ObjectBytes({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.targetKey,
			apiToken: options.apiToken,
			bytes,
			contentType,
			fetchImpl: options.fetchImpl,
		});
		const verifyHead = await headR2Object({
			accountId: options.accountId,
			bucketName: options.targetBucket,
			objectKey: transfer.targetKey,
			apiToken: options.apiToken,
			fetchImpl: options.fetchImpl,
		});
		if (
			!verifyHead.exists ||
			(verifyHead.size !== null && verifyHead.size <= 0)
		) {
			throw new Error(
				`R2 verification failed after copying audio key "${transfer.targetKey}".`,
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
		verified,
	};
}

export async function applyPromoteVocabPlan(
	prodRunner: VocabPromoteSqlRunner,
	plan: PromoteVocabPlan,
): Promise<{ statementsExecuted: number }> {
	if (plan.consumed) {
		throw new Error(
			"PromoteVocabPlan has already been applied; rebuild a fresh plan before retrying.",
		);
	}
	plan.consumed = true;
	await prodRunner.run(plan.upsertStatements);
	return { statementsExecuted: plan.upsertStatements.length };
}

export async function verifyPromotedVocab(
	prodRunner: VocabPromoteSqlRunner,
	plan: PromoteVocabPlan,
): Promise<VerifyPromotedVocabResult> {
	const nowMs = Date.now();
	const [groupRows, deckRows, wordRows] = await Promise.all([
		queryByIdsInChunks(
			prodRunner,
			"vocab_group",
			"id, org_id, name, normalized_name, created_at, updated_at",
			"id",
			plan.targetGroups.map((g) => g.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"vocab_deck",
			"id, org_id, class_id, group_id, title, lesson_number, topic, lang, source_library_deck_id, source_deck_id, created_at, updated_at",
			"id",
			plan.targetDecks.map((d) => d.id),
		),
		queryByIdsInChunks(
			prodRunner,
			"vocab_word",
			"id, deck_id, word, entry_type, ipa, pos, translation, example, audio_key, audio_url, sort_order, created_at, updated_at",
			"id",
			plan.targetWords.map((w) => w.id),
		),
	]);

	const actualGroups = groupRows
		.map((r) => parseGroupRow(r, nowMs))
		.sort(compareById);
	const actualDecks = deckRows
		.map((r) => parseDeckRow(r, nowMs))
		.sort(compareById);
	const actualWords = wordRows
		.map((r) => parseWordRow(r, nowMs))
		.sort(compareById);

	const mismatches: string[] = [];
	if (actualGroups.length !== plan.targetGroups.length) {
		mismatches.push(
			`vocab_group count mismatch: actual=${actualGroups.length}, expected=${plan.targetGroups.length}`,
		);
	}
	if (actualDecks.length !== plan.targetDecks.length) {
		mismatches.push(
			`vocab_deck count mismatch: actual=${actualDecks.length}, expected=${plan.targetDecks.length}`,
		);
	}
	if (actualWords.length !== plan.targetWords.length) {
		mismatches.push(
			`vocab_word count mismatch: actual=${actualWords.length}, expected=${plan.targetWords.length}`,
		);
	}

	const groupIdSet = new Set(actualGroups.map((g) => g.id));
	const deckIdSet = new Set(actualDecks.map((d) => d.id));
	for (const d of actualDecks) {
		if (d.orgId !== plan.targetOrgId) {
			mismatches.push(`vocab_deck org_id mismatch for deck "${d.title}"`);
		}
		if (d.classId !== null) {
			mismatches.push(`vocab_deck class_id is not NULL for deck "${d.title}"`);
		}
		if (d.groupId !== null && !groupIdSet.has(d.groupId)) {
			mismatches.push(
				`vocab_deck references missing group for deck "${d.title}"`,
			);
		}
	}
	for (const w of actualWords) {
		if (!deckIdSet.has(w.deckId)) {
			mismatches.push(
				`vocab_word references missing deck for word "${w.word}"`,
			);
		}
	}

	const actualHash = computeVocabContentHash({
		groups: actualGroups,
		decks: actualDecks,
		words: actualWords,
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
			group: {
				expected: plan.targetGroups.length,
				actual: actualGroups.length,
			},
			deck: {
				expected: plan.targetDecks.length,
				actual: actualDecks.length,
			},
			word: {
				expected: plan.targetWords.length,
				actual: actualWords.length,
			},
		},
		mismatches,
	};
}
