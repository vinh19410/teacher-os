/**
 * Pure calendar index and UTC month-grid helpers for the `/teacher/dashboard`
 * read-only Mini Calendar ("Lịch tháng").
 *
 * - Fail-closed active class allowlist: only classes with `status === "active"`
 *   appear (excludes paused classes including historical rows, and orphan lessons).
 * - Excludes `cancelled` and `holiday` lessons (TOS-11).
 * - Legacy undated classes (`date == null || date === ""`): hybrid 1-pass via
 *   `buildClassSessions` (stripping `holiday` before walking so prefix status
 *   heuristics stay intact without leaking holiday slots); unresolved/free-text
 *   or mixed dated+undated classes fall back to `lesson.day` (1..7).
 * - All date/month math is UTC-anchored `yyyy-mm` / `yyyy-mm-dd` strings.
 */

import { buildClassSessions, sessionStatus } from "@/lib/class-sessions";
import {
	compareLessonTime,
	formatWeekdayLong,
	parseTimeToMinutes,
} from "@/lib/dashboard-from-kernel";
import type { ClassGroup, Lesson } from "@/lib/mock-data";
import { addMonths, isoDayNumber, isValidISODate } from "@/lib/week-grid";

export const MIN_CALENDAR_YM = "1970-01";
export const MAX_CALENDAR_YM = "2099-12";

const YM_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const EMPTY_SESSIONS: readonly DashboardCalendarSession[] = [];

export interface DashboardCalendarSession {
	classId: string;
	time: string;
	dur: number;
}

export interface DashboardCalendarIndex {
	datedByIso: ReadonlyMap<string, readonly DashboardCalendarSession[]>;
	legacyByWeekday: ReadonlyMap<number, readonly DashboardCalendarSession[]>;
}

export interface CalendarDayCell {
	iso: string;
	day: number;
	isWeekend: boolean;
}

export interface CalendarMonthGrid {
	ym: string;
	leadingBlanks: number;
	days: CalendarDayCell[];
}

export type DashboardCalendarClassInput = Pick<
	ClassGroup,
	"id" | "status" | "schedule" | "startDate" | "sessionsTotal"
>;

function isValidCalendarYm(ym: string): boolean {
	return YM_PATTERN.test(ym) && ym >= MIN_CALENDAR_YM && ym <= MAX_CALENDAR_YM;
}

function sessionDedupKey(classId: string, time: string): string {
	const minutes = parseTimeToMinutes(time);
	return minutes !== null
		? `${classId}|m:${minutes}`
		: `${classId}|t:${time.trim()}`;
}

function dedupAndSortSessions(
	items: readonly DashboardCalendarSession[],
): DashboardCalendarSession[] {
	const seen = new Set<string>();
	const unique: DashboardCalendarSession[] = [];
	for (const item of items) {
		const key = sessionDedupKey(item.classId, item.time);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(item);
	}
	unique.sort((a, b) => compareLessonTime(a.time, b.time));
	return unique;
}

function pushBucket<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const existing = map.get(key);
	if (existing) {
		existing.push(value);
	} else {
		map.set(key, [value]);
	}
}

/**
 * Builds a single-pass read-only teaching-session index for the dashboard mini
 * calendar from kernel `lessons` and `classes`.
 */
export function buildDashboardCalendarIndex(
	lessons: readonly Lesson[],
	classes: readonly DashboardCalendarClassInput[],
): DashboardCalendarIndex {
	const activeClassById = new Map<string, DashboardCalendarClassInput>();
	for (const cls of classes) {
		if (cls.status === "active") {
			activeClassById.set(cls.id, cls);
		}
	}

	const classesWithDatedRows = new Set<string>();
	const datedBuckets = new Map<string, DashboardCalendarSession[]>();
	const nullDateByClass = new Map<string, Lesson[]>();
	const unresolvedLegacyRows: Lesson[] = [];

	for (const lesson of lessons) {
		if (!activeClassById.has(lesson.classId)) continue;

		if (lesson.date != null && isValidISODate(lesson.date)) {
			classesWithDatedRows.add(lesson.classId);
			if (lesson.status === "cancelled" || lesson.status === "holiday") {
				continue;
			}
			pushBucket(datedBuckets, lesson.date, {
				classId: lesson.classId,
				time: lesson.time.trim(),
				dur: lesson.dur,
			});
			continue;
		}

		if (lesson.date == null || lesson.date === "") {
			// TOS-11 (I4): holiday rows do not consume session occurrences and are
			// ignored by legacy slotStatsBySid; strip them before buildClassSessions
			// while retaining cancelled rows so prefix heuristics stay exact.
			if (lesson.status === "holiday") continue;
			pushBucket(nullDateByClass, lesson.classId, lesson);
			continue;
		}

		// Non-empty malformed date string (e.g. "2026-02-30") → legacy weekday fallback.
		if (lesson.status === "cancelled" || lesson.status === "holiday") {
			continue;
		}
		unresolvedLegacyRows.push(lesson);
	}

	for (const [classId, undatedRows] of nullDateByClass) {
		const cls = activeClassById.get(classId);
		if (!cls || undatedRows.length === 0 || classesWithDatedRows.has(classId)) {
			for (const row of undatedRows) {
				if (row.status !== "cancelled" && row.status !== "holiday") {
					unresolvedLegacyRows.push(row);
				}
			}
			continue;
		}

		const normalizedRows = undatedRows.map((row) =>
			row.date === null ? row : { ...row, date: null },
		);
		const resolved = buildClassSessions({
			schedule: cls.schedule,
			startDate: cls.startDate,
			lessons: normalizedRows,
			sessionsTotal: cls.sessionsTotal,
		});

		if (resolved !== null) {
			for (const occ of resolved) {
				if (sessionStatus(occ) === "cancelled") continue;
				pushBucket(datedBuckets, occ.dateISO, {
					classId,
					time: occ.time.trim(),
					dur: occ.dur,
				});
			}
		} else {
			for (const row of undatedRows) {
				if (row.status !== "cancelled" && row.status !== "holiday") {
					unresolvedLegacyRows.push(row);
				}
			}
		}
	}

	const datedByIso = new Map<string, readonly DashboardCalendarSession[]>();
	for (const [iso, bucket] of datedBuckets) {
		datedByIso.set(iso, dedupAndSortSessions(bucket));
	}

	const legacyBuckets = new Map<number, DashboardCalendarSession[]>();
	for (const row of unresolvedLegacyRows) {
		if (!Number.isInteger(row.day) || row.day < 1 || row.day > 7) continue;
		pushBucket(legacyBuckets, row.day, {
			classId: row.classId,
			time: row.time.trim(),
			dur: row.dur,
		});
	}

	const legacyByWeekday = new Map<
		number,
		readonly DashboardCalendarSession[]
	>();
	for (const [day, bucket] of legacyBuckets) {
		legacyByWeekday.set(day, dedupAndSortSessions(bucket));
	}

	return { datedByIso, legacyByWeekday };
}

/**
 * Returns the deduplicated, time-sorted teaching sessions on `dateIso`
 * (`yyyy-mm-dd`). Zero-allocation fast path when only one bucket has data.
 */
export function sessionsForDashboardDate(
	index: DashboardCalendarIndex,
	dateIso: string,
): readonly DashboardCalendarSession[] {
	const dated = index.datedByIso.get(dateIso) ?? EMPTY_SESSIONS;
	const legacy =
		index.legacyByWeekday.size > 0 && isValidISODate(dateIso)
			? (index.legacyByWeekday.get(isoDayNumber(dateIso)) ?? EMPTY_SESSIONS)
			: EMPTY_SESSIONS;

	if (legacy.length === 0) return dated;
	if (dated.length === 0) return legacy;
	return dedupAndSortSessions([...dated, ...legacy]);
}

/**
 * Builds the Monday-first calendar grid for `viewYm` (`yyyy-mm`) containing
 * only the days of that month (`1..daysInMonth`) plus `leadingBlanks` (0..6).
 */
export function monthCalendarGrid(viewYm: string): CalendarMonthGrid {
	if (!isValidCalendarYm(viewYm)) {
		return { ym: viewYm, leadingBlanks: 0, days: [] };
	}
	const year = Number(viewYm.slice(0, 4));
	const month = Number(viewYm.slice(5, 7));
	const leadingBlanks =
		(new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

	const days: CalendarDayCell[] = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const col = (leadingBlanks + d - 1) % 7;
		days.push({
			iso: `${viewYm}-${String(d).padStart(2, "0")}`,
			day: d,
			isWeekend: col >= 5,
		});
	}
	return { ym: viewYm, leadingBlanks, days };
}

/**
 * Shifts `viewYm` (`yyyy-mm`) by `delta` calendar months. Returns `viewYm`
 * unchanged when the input is invalid or the shifted month falls outside
 * `MIN_CALENDAR_YM..MAX_CALENDAR_YM`.
 */
export function shiftCalendarMonth(viewYm: string, delta: number): string {
	if (!isValidCalendarYm(viewYm) || !Number.isSafeInteger(delta)) {
		return viewYm;
	}
	return addMonths(`${viewYm}-01`, delta).slice(0, 7);
}

/** Deterministic Vietnamese month heading: `"Tháng 11 năm 2026"`. */
export function formatMonthHeading(viewYm: string): string {
	if (!isValidCalendarYm(viewYm)) return "";
	return `Tháng ${Number(viewYm.slice(5, 7))} năm ${viewYm.slice(0, 4)}`;
}

/** Agenda weekday label: `"Hôm nay"` when matching `todayIso`, else full VN weekday. */
export function formatAgendaDateLabel(
	dateIso: string,
	todayIso: string,
): string {
	if (!isValidISODate(dateIso)) return "";
	if (dateIso === todayIso) return "Hôm nay";
	return formatWeekdayLong(isoDayNumber(dateIso));
}
