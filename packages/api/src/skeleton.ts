/**
 * Occurrence-identity skeleton — issue #98.
 *
 * Pure functions shared by the server generator, the offline backfill SQL
 * generator, and (indirectly through their outputs) the web read path. No
 * db/server/web imports here — this file is the single source of truth for
 * "which calendar date is the k-th occurrence of weekday d".
 *
 * All date math runs on `yyyy-mm-dd` strings anchored at UTC midnight
 * (week-grid convention) so results are deterministic in Workers and tests
 * alike. lesson.day is 1-7 (Monday = 1); the schedule JSON days are 0-6
 * Monday-first; never JS getDay().
 */
import { TIME_REGEX } from "./contracts";

export interface ParsedSchedule {
	/** Deduped + ascending, 0 = Monday … 6 = Sunday — generator-cycle order. */
	days: number[];
	start: string;
	end: string;
}

function toMinutes(hhmm: string): number {
	// TIME_REGEX guarantees exactly two numeric parts.
	const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
	return hours * 60 + minutes;
}

/** yyyy-mm-dd (UTC-anchored) → lesson weekday 1-7, Monday = 1 — never JS
 * getDay() (0 = Sunday). Single source: kernel route, daily attendance và
 * holiday pipeline (TOS-11) cùng dùng. */
export function isoToLessonWeekday(iso: string): number {
	const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/**
 * Thời lượng phút của một buổi theo lịch chuẩn của lớp — cùng công thức
 * `generateScheduleLessons` (wraps midnight: 23:00→00:30 = 90). Tách ra để
 * holiday makeup (TOS-11) và generator dùng chung một nguồn (DRY).
 */
export function scheduleDurationMinutes(parsed: ParsedSchedule): number {
	return (toMinutes(parsed.end) - toMinutes(parsed.start) + 1440) % 1440;
}

/**
 * Parse the stored class schedule JSON; null for legacy free-text/invalid.
 * Mirrors apps/server kernel.ts byte-for-byte (dedup + sort before cycling).
 */
export function parseStoredSchedule(raw: string): ParsedSchedule | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { days, start, end } = parsed as Record<string, unknown>;
		if (!Array.isArray(days) || days.length === 0) return null;
		const unique = [...new Set(days)];
		if (
			!unique.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
			typeof start !== "string" ||
			typeof end !== "string" ||
			!TIME_REGEX.test(start) ||
			!TIME_REGEX.test(end) ||
			// Mirrors classCreateSchema's superRefine — a legacy row that
			// violates it must not generate zero-duration lessons.
			start === end
		) {
			return null;
		}
		return { days: unique.sort((a, b) => a - b), start, end };
	} catch {
		return null;
	}
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Strict calendar validation for stored/request dates: pattern AND a UTC
 * roundtrip so `2026-02-30` (silently rolls to March) is rejected instead of
 * minting an occurrence no calendar can show. Never regex-only.
 */
export function parseStartDateStrict(raw: string): string | null {
	if (!ISO_DATE_PATTERN.test(raw)) return null;
	const year = Number(raw.slice(0, 4));
	if (year < MIN_YEAR || year > MAX_YEAR) return null;
	const date = new Date(`${raw}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10) === raw ? raw : null;
}

function lessonWeekday(date: Date): number {
	// getUTCDay(): 0=Sunday … 6=Saturday → Monday-first 1-7.
	const day = date.getUTCDay();
	return day === 0 ? 7 : day;
}

/**
 * Per-weekday row count of the pre-#494 generator cycle (Monday-first, blind
 * to startDate). Only legacy undated rows have this shape, so only the
 * backfill conformance check may use it.
 */
export function occurrencesPerDay(
	days: number[],
	total: number,
): Map<number, number> {
	const counts = new Map<number, number>();
	for (const [idx, day] of days.entries()) {
		counts.set(
			day,
			Math.floor(total / days.length) + (idx < total % days.length ? 1 : 0),
		);
	}
	return counts;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chronological skeleton: the first `total` scheduled days on or after
 * startISO, grouped as weekday (lesson convention 1-7) → ordered yyyy-mm-dd
 * dates. The walk caps at total*7+14 days — it can only trip on a
 * weekday-convention bug, and then the derivation must bail rather than
 * fabricate dates. Null when total <= 0 or the cap trips.
 */
export function skeletonOf(
	schedule: ParsedSchedule,
	startISO: string,
	total: number,
): Map<number, string[]> | null {
	if (total <= 0) return null;
	const scheduled = new Set(schedule.days.map((day0) => day0 + 1));
	const skeleton = new Map<number, string[]>();
	const startMs = new Date(`${startISO}T00:00:00Z`).getTime();
	let placed = 0;
	for (let offset = 0; offset < total * 7 + 14 && placed < total; offset++) {
		const date = new Date(startMs + offset * DAY_MS);
		const weekday = lessonWeekday(date);
		if (!scheduled.has(weekday)) continue;
		const list = skeleton.get(weekday) ?? [];
		list.push(date.toISOString().slice(0, 10));
		skeleton.set(weekday, list);
		placed += 1;
	}
	return placed === total ? skeleton : null;
}

/**
 * Skeleton for legacy undated rows: per weekday, as many k-th occurrences as
 * the pre-#494 cycle generated (`occurrencesPerDay`). Backfill stamps those
 * rows, so it must follow their shape, not the chronological skeleton.
 */
function legacySkeletonOf(
	schedule: ParsedSchedule,
	startISO: string,
	total: number,
): Map<number, string[]> | null {
	if (total <= 0) return null;
	const perDay = occurrencesPerDay(schedule.days, total);
	const needed = new Map<number, number>();
	for (const [day0, count] of perDay) {
		if (count > 0) needed.set(day0 + 1, count);
	}
	const skeleton = new Map<number, string[]>();
	let placed = 0;
	for (const day of needed.keys()) skeleton.set(day, []);
	const startMs = new Date(`${startISO}T00:00:00Z`).getTime();
	for (
		let offset = 0;
		offset < total * 7 + 14 && placed < skeleton.size;
		offset++
	) {
		const date = new Date(startMs + offset * DAY_MS);
		const weekday = lessonWeekday(date);
		const remaining = needed.get(weekday) ?? 0;
		const list = skeleton.get(weekday);
		if (!list || list.length >= remaining || remaining === 0) continue;
		list.push(date.toISOString().slice(0, 10));
		if (list.length === remaining) {
			placed += 1;
			needed.delete(weekday);
		}
	}
	if (placed !== skeleton.size) return null;
	return skeleton;
}

/** Why a class failed conformance — drives backfill summaries and runbook archives. */
export type ConformsFailReason =
	| "schedule-unparseable"
	| "start-date-invalid"
	| "skeleton-cap-tripped"
	| "slot-divergence"
	| "count-vector-mismatch";

export interface ConformsRow {
	enrollmentId: string;
	day: number;
	time: string;
}

export interface ConformsInput {
	scheduleRaw: string;
	startDateRaw: string;
	total: number;
	rows: ConformsRow[];
}

export type ConformsResult =
	| { conform: true }
	| { conform: false; reason: ConformsFailReason };

/**
 * Decide whether a class's live rows still match the generator heuristic
 * well enough to stamp dates (issue #98 K2). Five conditions, all-or-nothing:
 *
 * 1. schedule parses (deduped + sorted, structured JSON);
 * 2. startDate is a strict real calendar date;
 * 3. the chronological skeleton covers `total` within the cap;
 * 4. count-vector set-equality with the generator formula — EVERY enrollment
 *    has exactly formula_count(scheduled day) rows on that day (including
 *    required zeros when total < len(days)); divergence means rows were
 *    added/moved outside the generator contract;
 * 5. slot-guard mirror of the web divergence guard: every row keeps
 *    time === parsed.start and (day-1) ∈ schedule.days — time-edited or
 *    day-shifted rows mean data drifted off the schedule slots.
 *
 * Failing ANY condition ⇒ the whole class stays NULL ⇒ permanent frozen
 * legacy rendering (never a mixed NULL/non-NULL class in steady state).
 */
export function conforms(input: ConformsInput): ConformsResult {
	const parsed = parseStoredSchedule(input.scheduleRaw);
	if (!parsed) return { conform: false, reason: "schedule-unparseable" };
	const startISO = parseStartDateStrict(input.startDateRaw);
	if (!startISO) return { conform: false, reason: "start-date-invalid" };

	const scheduleDays = new Set(parsed.days);
	for (const row of input.rows) {
		if (row.time !== parsed.start || !scheduleDays.has(row.day - 1)) {
			return { conform: false, reason: "slot-divergence" };
		}
	}

	const expected = occurrencesPerDay(parsed.days, input.total);
	const actual = new Map<string, Map<number, number>>();
	for (const row of input.rows) {
		const perSid = actual.get(row.enrollmentId) ?? new Map<number, number>();
		const day0 = row.day - 1;
		perSid.set(day0, (perSid.get(day0) ?? 0) + 1);
		actual.set(row.enrollmentId, perSid);
	}
	for (const perSid of actual.values()) {
		for (const [day, count] of expected) {
			if ((perSid.get(day) ?? 0) !== count) {
				return { conform: false, reason: "count-vector-mismatch" };
			}
		}
	}
	if (!legacySkeletonOf(parsed, startISO, input.total)) {
		return { conform: false, reason: "skeleton-cap-tripped" };
	}
	return { conform: true };
}

export interface BackfillClassInput {
	classId: string;
	scheduleRaw: string;
	startDateRaw: string;
	total: number;
}

export interface BackfillLessonInput extends ConformsRow {
	id: string;
	classId: string;
	/** createdAt as epoch ms (dump column); ordering tiebreak after createdAt. */
	createdAtMs: number;
	/** Stable dump-provided ordinal (e.g. SQLite rowid) — createdAt truncates ms. */
	seq: number;
	/** `lesson.status` at dump time — drives the in-bucket ordering and guards the emitted UPDATE. */
	status: string;
}

export interface BackfillUpdate {
	id: string;
	date: string;
	/** Status the plan was computed against; the UPDATE only applies while it still holds. */
	status: string;
}

/**
 * Settled-first rank inside a backfill bucket. Mirrors the legacy renderer
 * (`sidStateAt` in the web `class-sessions.ts`): completed lessons are the
 * prefix, then cancelled, then everything still open — so a teacher's past
 * check-ins land on the earliest skeleton dates, not wherever `createdAt`
 * happened to put them.
 */
function backfillStatusRank(status: string): number {
	if (status === "completed") return 0;
	if (status === "cancelled") return 1;
	return 2;
}

export interface BackfillResult {
	/** Per-class decision summary — feeds the operator archive list (N1). */
	classes: Array<{
		classId: string;
		conforms: boolean;
		reason?: ConformsFailReason;
	}>;
	updates: BackfillUpdate[];
}

/**
 * Offline backfill planner (issue #98 Phase 1). Decides each class wholly:
 * conforming classes get EVERY row stamped (never mixed), non-conforming get
 * zero updates. Within one enrollment+weekday bucket, the k-th row by
 * `(status rank, createdAt ASC, seq ASC)` takes the k-th skeleton date —
 * completed → cancelled → rest, matching the prefix the legacy renderer
 * (`sidStateAt`) shows. Inputs arrive from the wrangler dump; the caller
 * re-runs freely (pure), while emitted SQL stays idempotent via
 * `WHERE date IS NULL AND status = <dump status>`.
 */
export function buildBackfillPlan(
	classes: BackfillClassInput[],
	rows: BackfillLessonInput[],
): BackfillResult {
	const rowsByClass = new Map<string, BackfillLessonInput[]>();
	for (const row of rows) {
		const list = rowsByClass.get(row.classId) ?? [];
		list.push(row);
		rowsByClass.set(row.classId, list);
	}
	const summary: BackfillResult["classes"] = [];
	const updates: BackfillUpdate[] = [];
	for (const cls of classes) {
		const clsRows = rowsByClass.get(cls.classId) ?? [];
		const verdict = conforms({
			scheduleRaw: cls.scheduleRaw,
			startDateRaw: cls.startDateRaw,
			total: cls.total,
			rows: clsRows.map(({ enrollmentId, day, time }) => ({
				enrollmentId,
				day,
				time,
			})),
		});
		if (!verdict.conform) {
			summary.push({
				classId: cls.classId,
				conforms: false,
				reason: verdict.reason,
			});
			continue;
		}
		const parsed = parseStoredSchedule(cls.scheduleRaw);
		const startISO = parseStartDateStrict(cls.startDateRaw);
		// conforms() guarantees both parses succeed; the guards keep TS honest.
		const skeleton =
			parsed && startISO ? legacySkeletonOf(parsed, startISO, cls.total) : null;
		if (!skeleton) {
			summary.push({
				classId: cls.classId,
				conforms: false,
				reason: "skeleton-cap-tripped",
			});
			continue;
		}
		const bucketKey = (row: BackfillLessonInput) =>
			`${row.enrollmentId}|${row.day - 1}`;
		const buckets = new Map<string, BackfillLessonInput[]>();
		for (const row of clsRows) {
			const key = bucketKey(row);
			const list = buckets.get(key) ?? [];
			list.push(row);
			buckets.set(key, list);
		}
		for (const list of buckets.values()) {
			list.sort(
				(a, b) =>
					backfillStatusRank(a.status) - backfillStatusRank(b.status) ||
					a.createdAtMs - b.createdAtMs ||
					a.seq - b.seq,
			);
		}
		summary.push({ classId: cls.classId, conforms: true });
		for (const row of clsRows) {
			const bucket = buckets.get(bucketKey(row));
			if (!bucket) continue;
			const ordinal = bucket.indexOf(row);
			const dates = skeleton.get(row.day);
			const date = dates?.[ordinal];
			if (!date) continue;
			updates.push({ id: row.id, date, status: row.status });
		}
	}
	return { classes: summary, updates };
}

/** Single-quote escape for emitted SQLite literals. */
function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Emit idempotent UPDATE lines: one statement per row, always guarded by
 * `WHERE … AND date IS NULL` so re-running the generated file is a no-op, and
 * by the dump-time `status` so a check-in landing between dump and apply skips
 * the row (the delta loop re-plans it) instead of stamping a stale ordinal.
 */
export function emitBackfillSql(updates: BackfillUpdate[]): string {
	return updates
		.map(
			(update) =>
				`UPDATE lesson SET date = ${sqlString(update.date)} WHERE id = ${sqlString(update.id)} AND date IS NULL AND status = ${sqlString(update.status)};`,
		)
		.join("\n");
}
