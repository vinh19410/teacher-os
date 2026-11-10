/**
 * Audit + cleanup one-off cho `lesson_material` mồ côi do activation/attach
 * áp holiday shift TRƯỚC fix #659/#662 (#663): tài liệu gắn vào buổi gốc kẹt
 * ở `original_date` trong khi buổi dạy thực đã dời sang chuỗi makeup.
 *
 * Xem `plans/261110-0949-663-audit-orphan-lesson-materials/` cho đầy đủ bối
 * cảnh và red-team adjudication. Ràng buộc an toàn chính:
 * - Read-only mặc định; ghi chỉ qua `runCleanup` với plan single-use.
 * - `has_class_session = 1` là superset bảo thủ (manual ⟹ có class_session;
 *   chiều ngược không chắc — lớp auto 0 lesson cũng insert được
 *   `class_session`, `kernel.ts:2427-2450`).
 * - EXISTS lesson phải status-aware: shift luôn để lại lesson
 *   `status = 'holiday'` ở ngày gốc (`enrollment-activation.ts:57`,
 *   `holidays.ts:329`).
 * - Chain shift (makeup trúng original của shift khác) resolve về đích cuối
 *   trước khi move — move per-nhịp tạo mồ côi mới ở đích trung gian.
 * - Không đụng `packages/db/src/seed/vocab-library.ts` (license gate có chủ
 *   ý) — chỉ import regex đã export.
 */
import type { Client, InValue } from "@libsql/client";
import {
	PROD_D1_NAME_REGEX,
	STAGING_D1_NAME_REGEX,
} from "../seed/vocab-library";

/** Dòng `lesson_material` dính shift (query gốc của issue #663 + cột hành
 * động). EXISTS lesson status-aware; JOIN `class` lấy `scheduling_mode`;
 * `lm.created_at` phân biệt legacy pre-#659/#662 với tái phát post-deploy. */
export const ORPHAN_AUDIT_SQL = `
SELECT lm.org_id, s.org_id AS shift_org_id, lm.class_id, lm.date, lm.material_id,
       lm.created_at AS lm_created_at,
       cls.scheduling_mode AS scheduling_mode,
       s.id AS shift_id, s.makeup_date, s.created_at AS shift_created_at,
       EXISTS (SELECT 1 FROM class_session cs
               WHERE cs.class_id = lm.class_id AND cs.date = lm.date) AS has_class_session,
       EXISTS (SELECT 1 FROM lesson_material d
               WHERE d.class_id = lm.class_id AND d.date = s.makeup_date
                 AND d.material_id = lm.material_id) AS dest_conflict_same_material,
       EXISTS (SELECT 1 FROM lesson l
               WHERE l.class_id = lm.class_id AND l.date = lm.date
                 AND l.status IN ('upcoming','completed')) AS active_lesson_at_date
FROM lesson_material lm
JOIN holiday_session_shift s
  ON s.class_id = lm.class_id AND s.original_date = lm.date
JOIN class cls ON cls.id = lm.class_id
ORDER BY lm.class_id, lm.date, lm.material_id;
`;

/** Toàn bộ shift — đầu vào cho chain resolve (link chain có thể không có
 * material nên không thấy từ câu audit). */
export const SHIFTS_SQL = `
SELECT class_id, original_date, makeup_date, created_at
FROM holiday_session_shift
ORDER BY class_id, created_at;
`;

const ACTIVE_LESSON_DATES_SQL = `
SELECT DISTINCT class_id, date FROM lesson
WHERE status IN ('upcoming','completed') AND date IS NOT NULL;
`;

const CLASS_SESSION_DATES_SQL = `
SELECT DISTINCT class_id, date FROM class_session;
`;

export interface AuditRow {
	orgId: string;
	shiftOrgId: string;
	classId: string;
	date: string;
	materialId: string;
	lmCreatedAt: number;
	schedulingMode: string;
	shiftId: string;
	makeupDate: string;
	shiftCreatedAt: number;
	hasClassSession: 0 | 1;
	destConflictSameMaterial: 0 | 1;
	activeLessonAtDate: 0 | 1;
}

export interface ShiftRow {
	classId: string;
	originalDate: string;
	makeupDate: string;
	createdAt: number;
}

export type Disposition =
	| "cleanup_eligible"
	| "auto_review"
	| "active_lesson_at_date"
	| "chain_loop"
	| "dest_no_active_session";

export interface ClassifiedRow extends AuditRow {
	/** Đích cuối của chuỗi shift (null khi loop). */
	chainTerminal: string | null;
	disposition: Disposition;
}

export interface AuditSummary {
	total: number;
	manualTotal: number;
	autoTotal: number;
	cleanupEligible: number;
	excluded: Record<Exclude<Disposition, "cleanup_eligible">, number>;
	manualBySchedulingMode: Record<string, number>;
	/** `manualTotal === cleanupEligible + Σ(lý do loại của dòng manual)` —
	 * lệch nghĩa là có bug gate; CLI exit 2. */
	reconcileOk: boolean;
}

/** Statement mang args riêng — tránh inline giá trị DB vào SQL. */
export interface SqlStatement {
	sql: string;
	args?: unknown[];
}

export interface AuditQueryRunner {
	queryRows(sql: string): Promise<Array<Record<string, unknown>>>;
	run(statements: SqlStatement[]): Promise<void>;
}

export interface CleanupGroup {
	classId: string;
	originalDate: string;
	terminalDate: string;
	materialCount: number;
	/** Delete-then-move #659: (1) DELETE dòng trùng materialId ở đích (live
	 * subquery từ original), (2) UPDATE move. Thứ tự load-bearing. */
	statements: SqlStatement[];
}

export interface CleanupPlan {
	groups: CleanupGroup[];
	/** Single-use: `runCleanup` đánh dấu sau khi chạy; replay cùng plan object
	 * bị chặn — replay đúng phải rebuild từ audit tươi (dòng đã move biến mất
	 * khỏi audit; chạy lại cùng plan thì câu DELETE xoá mất chính dòng đã
	 * move). */
	consumed?: boolean;
}

function mapAuditRow(row: Record<string, unknown>): AuditRow {
	return {
		orgId: String(row.org_id),
		shiftOrgId: String(row.shift_org_id),
		classId: String(row.class_id),
		date: String(row.date),
		materialId: String(row.material_id),
		lmCreatedAt: Number(row.lm_created_at),
		schedulingMode: String(row.scheduling_mode),
		shiftId: String(row.shift_id),
		makeupDate: String(row.makeup_date),
		shiftCreatedAt: Number(row.shift_created_at),
		hasClassSession: Number(row.has_class_session) as 0 | 1,
		destConflictSameMaterial: Number(row.dest_conflict_same_material) as 0 | 1,
		activeLessonAtDate: Number(row.active_lesson_at_date) as 0 | 1,
	};
}

function mapShiftRow(row: Record<string, unknown>): ShiftRow {
	return {
		classId: String(row.class_id),
		originalDate: String(row.original_date),
		makeupDate: String(row.makeup_date),
		createdAt: Number(row.created_at),
	};
}

function libsqlAuditRunner(client: Client): AuditQueryRunner {
	return {
		async queryRows(sql) {
			const res = await client.execute(sql);
			return res.rows.map((row) => ({
				...(row as Record<string, unknown>),
			}));
		},
		async run(statements) {
			if (statements.length === 0) return;
			await client.batch(
				statements.map((statement) => ({
					sql: statement.sql,
					args: (statement.args ?? []) as InValue[],
				})),
				"write",
			);
		},
	};
}

function normalizeSource(source: Client | AuditQueryRunner): AuditQueryRunner {
	if ("execute" in source) {
		return libsqlAuditRunner(source as Client);
	}
	return source as AuditQueryRunner;
}

/** Chạy 2 câu audit (dòng dính shift + bảng shift), phân loại và đối chiếu.
 * Read-only. Lưu ý: 4 câu đọc KHÔNG nguyên tử với nhau trên D1 — write giữa
 * chừng cho snapshot trộn; workflow serialize với deploy qua concurrency
 * group nên cửa sổ này thực tế chỉ có write từ app. */
export async function auditOrphans(source: Client | AuditQueryRunner): Promise<{
	rows: ClassifiedRow[];
	shifts: ShiftRow[];
	summary: AuditSummary;
}> {
	const runner = normalizeSource(source);
	const [auditRows, shiftRows] = await Promise.all([
		runner.queryRows(ORPHAN_AUDIT_SQL),
		runner.queryRows(SHIFTS_SQL),
	]);
	const rows = auditRows.map(mapAuditRow);
	const shifts = shiftRows.map(mapShiftRow);
	const classified = await classifyRows(rows, shifts, runner);
	return { rows: classified.rows, shifts, summary: classified.summary };
}

const chainKey = (classId: string, date: string): string =>
	`${classId}\u0000${date}`;

/** Đi theo chuỗi `original → makeup` tới đích cuối. Loop → `ok: false`. */
export function resolveChain(
	shifts: ShiftRow[],
	classId: string,
	originalDate: string,
	chainMap?: Map<string, string>,
): { terminal: string | null; ok: boolean } {
	const next =
		chainMap ??
		new Map(
			shifts.map((shift) => [
				chainKey(shift.classId, shift.originalDate),
				shift.makeupDate,
			]),
		);
	const visited = new Set<string>([chainKey(classId, originalDate)]);
	let current = originalDate;
	for (let depth = 0; depth <= shifts.length; depth += 1) {
		const makeup = next.get(chainKey(classId, current));
		if (makeup === undefined) {
			// không xảy ra với dòng từ audit (luôn có shift trùng) — defensive.
			return { terminal: current, ok: true };
		}
		const key = chainKey(classId, makeup);
		if (visited.has(key)) {
			return { terminal: null, ok: false };
		}
		visited.add(key);
		current = makeup;
	}
	return { terminal: null, ok: false };
}

function dateKey(classId: string, date: string): string {
	return chainKey(classId, date);
}

async function loadDateSet(
	runner: AuditQueryRunner,
	sql: string,
): Promise<Set<string>> {
	const rows = await runner.queryRows(sql);
	const set = new Set<string>();
	for (const row of rows) {
		set.add(dateKey(String(row.class_id), String(row.date)));
	}
	return set;
}

/** Phân loại từng dòng + tổng hợp đối chiếu. Đọc thêm 2 câu DISTINCT để
 * đánh giá đích cuối có buổi dạy thật. */
export async function classifyRows(
	rows: AuditRow[],
	shifts: ShiftRow[],
	source: Client | AuditQueryRunner,
): Promise<{ rows: ClassifiedRow[]; summary: AuditSummary }> {
	const runner = normalizeSource(source);
	const [activeLessonDates, classSessionDates] = await Promise.all([
		loadDateSet(runner, ACTIVE_LESSON_DATES_SQL),
		loadDateSet(runner, CLASS_SESSION_DATES_SQL),
	]);
	// Map shift dựng MỘT lần cho toàn bộ rows (O(rows × shifts) → O(shifts)).
	const chainMap = new Map<string, string>();
	for (const shift of shifts) {
		chainMap.set(chainKey(shift.classId, shift.originalDate), shift.makeupDate);
	}

	const excluded: Record<Exclude<Disposition, "cleanup_eligible">, number> = {
		auto_review: 0,
		active_lesson_at_date: 0,
		chain_loop: 0,
		dest_no_active_session: 0,
	};
	const manualBySchedulingMode: Record<string, number> = {};
	const classified: ClassifiedRow[] = rows.map((row) => {
		if (row.hasClassSession === 1) {
			manualBySchedulingMode[row.schedulingMode] =
				(manualBySchedulingMode[row.schedulingMode] ?? 0) + 1;
		}
		const chain = resolveChain(shifts, row.classId, row.date, chainMap);
		let disposition: Disposition;
		if (row.hasClassSession === 0) {
			disposition = "auto_review";
		} else if (row.activeLessonAtDate === 1) {
			disposition = "active_lesson_at_date";
		} else if (!chain.ok) {
			disposition = "chain_loop";
		} else if (
			chain.terminal !== null &&
			!activeLessonDates.has(dateKey(row.classId, chain.terminal)) &&
			!classSessionDates.has(dateKey(row.classId, chain.terminal))
		) {
			disposition = "dest_no_active_session";
		} else {
			disposition = "cleanup_eligible";
		}
		if (disposition !== "cleanup_eligible") {
			excluded[disposition] += 1;
		}
		return {
			...row,
			chainTerminal: chain.ok ? chain.terminal : null,
			disposition,
		};
	});

	const manualTotal = rows.filter((row) => row.hasClassSession === 1).length;
	const autoTotal = rows.length - manualTotal;
	const cleanupEligible = classified.filter(
		(row) => row.disposition === "cleanup_eligible",
	).length;
	const manualExcluded =
		excluded.active_lesson_at_date +
		excluded.chain_loop +
		excluded.dest_no_active_session;
	const summary: AuditSummary = {
		total: rows.length,
		manualTotal,
		autoTotal,
		cleanupEligible,
		excluded,
		manualBySchedulingMode,
		reconcileOk: manualTotal === cleanupEligible + manualExcluded,
	};
	return { rows: classified, summary };
}

/** Bất biến đối chiếu số liệu (red-team F7: bug gate không được trốn trong
 * tổng). Trả `false` khi lệch — CLI phải exit 2. */
export function reconcileSummary(summary: AuditSummary): boolean {
	return summary.reconcileOk;
}

/** Dựng cleanup plan CHỈ từ dòng `cleanup_eligible`. Group theo
 * `(class_id, original_date → terminal)`; statement DELETE dùng live subquery
 * (không pre-bind danh sách materialId từ snapshot audit). */
export function buildCleanupPlan(rows: ClassifiedRow[]): CleanupPlan {
	const byGroup = new Map<string, CleanupGroup>();
	for (const row of rows) {
		if (row.disposition !== "cleanup_eligible" || row.chainTerminal === null) {
			continue;
		}
		const key = `${row.classId}\u0000${row.date}\u0000${row.chainTerminal}`;
		const existing = byGroup.get(key);
		if (existing) {
			existing.materialCount += 1;
			continue;
		}
		byGroup.set(key, {
			classId: row.classId,
			originalDate: row.date,
			terminalDate: row.chainTerminal,
			materialCount: 1,
			statements: [
				{
					sql: "DELETE FROM lesson_material WHERE class_id = ? AND date = ? AND material_id IN (SELECT material_id FROM lesson_material WHERE class_id = ? AND date = ?)",
					args: [row.classId, row.chainTerminal, row.classId, row.date],
				},
				{
					sql: "UPDATE lesson_material SET date = ? WHERE class_id = ? AND date = ?",
					args: [row.chainTerminal, row.classId, row.date],
				},
			],
		});
	}
	return { groups: [...byGroup.values()] };
}

/** Thực thi cleanup. Plan single-use: gọi lần 2 với cùng object → throw.
 * libsql: batch nguyên tử per group; D1: tuần tự per statement (mỗi statement
 * idempotent-true — DELETE khớp 0 dòng sau khi chạy, UPDATE khớp 0 dòng sau
 * khi move). Rebuild plan từ audit tươi trước mỗi lần chạy. */
export async function runCleanup(
	source: Client | AuditQueryRunner,
	plan: CleanupPlan,
): Promise<number> {
	if (plan.consumed) {
		throw new Error(
			"cleanup plan was already executed; rebuild it from a fresh auditOrphans() before running again",
		);
	}
	plan.consumed = true;
	const runner = normalizeSource(source);
	let applied = 0;
	for (const group of plan.groups) {
		await runner.run(group.statements);
		applied += 1;
	}
	return applied;
}

// --- Cloudflare D1 REST (read-only + cleanup statements) ---

const D1_UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAGING_D1_NAME_PREFIX = "teacher-os-database-staging-";
/** Prod list bằng prefix RỘNG rồi lọc regex: tên prod thật trong account có
 * thể là `production-`/`main-`/`pilot-` (PROD_D1_NAME_REGEX), không chắc là
 * literal `prod-` — Incident lần chạy đầu (#663): prefix `prod-` bắt phải
 * một DB `prod-*` rỗng không có schema trong khi DB prod thật tên khác. */
const PROD_D1_LIST_PREFIX = "teacher-os-database-";

/** Copy pattern `redactSensitive` từ `packages/db/scripts/seed-vocab-library.ts:121`
 * (không import ngược từ scripts — dependency direction src ← scripts). */
export function redactSensitive(
	message: string,
	secrets: readonly string[],
): string {
	let output = message;
	for (const secret of secrets) {
		const trimmed = secret.trim();
		if (trimmed.length >= 4) {
			output = output.split(trimmed).join("[REDACTED]");
		}
	}
	return output;
}

interface CloudflareD1ListResponse {
	success?: boolean;
	errors?: Array<{ message?: string }>;
	result?: Array<{ uuid?: string; name?: string }>;
	result_info?: {
		total_count?: number;
		total_pages?: number;
	};
}

interface CloudflareD1QueryResponse {
	success?: boolean;
	errors?: Array<{ message?: string }>;
	result?: Array<{ results?: Array<Record<string, unknown>> }>;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve: resolveTimer } = Promise.withResolvers<void>();
	setTimeout(resolveTimer, ms);
	return promise;
}

async function fetchJsonWithRetry(
	fetchFn: typeof fetch,
	url: string,
	init: RequestInit,
	timeoutMs: number,
	retryDelayMs: number,
): Promise<{ status: number; payload: unknown }> {
	let lastStatus = 0;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const res = await fetchFn(url, {
			...init,
			signal: AbortSignal.timeout(timeoutMs),
		});
		lastStatus = res.status;
		if ((res.status === 429 || res.status >= 500) && attempt === 0) {
			await sleep(retryDelayMs);
			continue;
		}
		const raw = await res.text();
		try {
			return { status: res.status, payload: JSON.parse(raw) as unknown };
		} catch {
			throw new Error(
				`Cloudflare D1 request failed (${res.status}): invalid JSON response`,
			);
		}
	}
	throw new Error(`Cloudflare D1 request failed (${lastStatus}) after retry`);
}

function listEndpoint(accountId: string, prefix: string, page: number): string {
	const params = new URLSearchParams({
		name: prefix,
		per_page: "100",
		page: String(page),
	});
	return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database?${params.toString()}`;
}

/** Resolve database id fail-closed cho cả 2 stage (hàm RIÊNG cho audit —
 * KHÔNG mở rộng `resolveStagingD1DatabaseId` của vocab-library, đó là license
 * gate có chủ ý). Phân trang đủ các page trước khi lọc; bắt buộc đúng 1
 * match; error message redact token/databaseId. */
export async function resolveD1DatabaseId(options: {
	stage: string;
	accountId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<string> {
	if (options.stage !== "staging" && options.stage !== "prod") {
		throw new Error(
			`Unsupported --d1-stage "${options.stage}": audit lookup is restricted to "staging" or "prod" (fail-closed).`,
		);
	}
	const prefix =
		options.stage === "staging" ? STAGING_D1_NAME_PREFIX : PROD_D1_LIST_PREFIX;
	const stageRegex =
		options.stage === "staging" ? STAGING_D1_NAME_REGEX : PROD_D1_NAME_REGEX;
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;

	const accumulated: Array<{ uuid: string; name: string }> = [];
	const perPage = 100;
	const maxPages = 100;
	for (let page = 1; page <= maxPages; page += 1) {
		const { status, payload } = await fetchJsonWithRetry(
			fetchFn,
			listEndpoint(options.accountId, prefix, page),
			{
				method: "GET",
				headers: { authorization: `Bearer ${options.apiToken}` },
			},
			timeoutMs,
			500,
		);
		const list = payload as CloudflareD1ListResponse;
		if (status < 200 || status >= 300 || list.success !== true) {
			const errMsg =
				list.errors?.map((error) => error.message ?? "error").join("; ") ??
				`HTTP ${status}`;
			throw new Error(
				redactSensitive(`D1 list databases failed (${status}): ${errMsg}`, [
					options.apiToken,
				]),
			);
		}
		const result = Array.isArray(list.result) ? list.result : [];
		for (const entry of result) {
			if (typeof entry.uuid === "string" && typeof entry.name === "string") {
				accumulated.push({ uuid: entry.uuid, name: entry.name });
			}
		}
		const totalPages = list.result_info?.total_pages;
		if (typeof totalPages === "number" && page >= totalPages) break;
		if (result.length === 0) break;
		if (typeof totalPages !== "number" && result.length < perPage) break;
	}

	const matches = accumulated.filter(
		(entry) => D1_UUID_REGEX.test(entry.uuid) && stageRegex.test(entry.name),
	);
	let candidates = matches;
	if (candidates.length > 1) {
		// Nhiều tên trùng regex (VD: DB `prod-*` rỗng + DB `production-*`
		// thật): probe read-only sqlite_master — chỉ giữ DB có schema audit.
		// Không phân biệt được (0 hoặc >1 có schema) → fail-closed kèm tên.
		const withSchema: Array<{ uuid: string; name: string }> = [];
		for (const candidate of candidates) {
			try {
				const rows = await d1Query({
					accountId: options.accountId,
					databaseId: candidate.uuid,
					apiToken: options.apiToken,
					sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('lesson_material','holiday_session_shift')",
					fetchImpl: fetchFn,
					timeoutMs,
				});
				if (rows.length >= 2) {
					withSchema.push(candidate);
				}
			} catch {
				// probe lỗi (quyền/HTTP) → không chọn candidate này.
			}
		}
		if (withSchema.length >= 1) {
			candidates = withSchema;
		}
	}
	const match = candidates[0];
	if (candidates.length !== 1 || !match) {
		const seenNames = accumulated
			.map((entry) => entry.name)
			.filter((name) => name.startsWith("teacher-os-database-"));
		throw new Error(
			redactSensitive(
				`Expected exactly 1 ${options.stage} D1 database matching ${stageRegex}, found ${candidates.length} candidate(s)${candidates.length !== matches.length ? ` (từ ${matches.length} tên trùng regex, đã loại các DB không có schema audit)` : ""}.${seenNames.length > 0 ? ` Candidate names under "teacher-os-database-": ${seenNames.join(", ")}.` : " No teacher-os-database-* names were returned by the API."}`,
				[options.apiToken],
			),
		);
	}
	return match.uuid;
}

/** 1 câu SQL qua D1 REST `/query`; retry 1 lần trên 429/5xx (mọi statement
 * của module đều idempotent-true — đọc, DELETE khớp-0-lần-2, UPDATE
 * khớp-0-lần-2). */
export async function d1Query(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	sql: string;
	params?: unknown[];
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<Array<Record<string, unknown>>> {
	const fetchFn = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}/d1/database/${encodeURIComponent(options.databaseId)}/query`;
	const body: { sql: string; params?: unknown[] } = { sql: options.sql };
	if (options.params && options.params.length > 0) {
		body.params = options.params;
	}
	const { status, payload } = await fetchJsonWithRetry(
		fetchFn,
		endpoint,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${options.apiToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		},
		timeoutMs,
		500,
	);
	const query = payload as CloudflareD1QueryResponse;
	if (status < 200 || status >= 300 || query.success !== true) {
		const errMsg =
			query.errors?.map((error) => error.message ?? "error").join("; ") ??
			`HTTP ${status}`;
		throw new Error(
			redactSensitive(`D1 query failed (${status}): ${errMsg}`, [
				options.apiToken,
				options.databaseId,
			]),
		);
	}
	return query.result?.[0]?.results ?? [];
}

export function createD1AuditRunner(options: {
	accountId: string;
	databaseId: string;
	apiToken: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): AuditQueryRunner {
	const query = (sql: string, params?: unknown[]) =>
		d1Query({ ...options, sql, params });
	return {
		async queryRows(sql) {
			return query(sql);
		},
		async run(statements) {
			for (const statement of statements) {
				await query(statement.sql, statement.args ?? []);
			}
		},
	};
}
