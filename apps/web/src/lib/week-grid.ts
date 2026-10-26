/**
 * Week math for the /schedule grid (issue #56).
 *
 * Three day conventions live in this codebase — do not mix them:
 * 1. Class schedule JSON `days` is 0-6 Monday-first (see `parseSchedule`).
 * 2. `lesson.day` is 1-7 Monday-first (server generates `scheduleDay + 1`) —
 *    never 0-based, never a calendar date.
 * 3. JS `Date.getDay()` is 0=Sunday — never use it raw here; all math runs
 *    on `yyyy-mm-dd` strings anchored at UTC midnight so results are
 *    deterministic on UTC CI runners.
 *
 * "Today" is resolved in Asia/Ho_Chi_Minh (mirrors the server's
 * `formatDayMonth` UTC-drift guard) because a UTC clock lags Vietnam by 7h.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 2099;
const DAY_MS = 24 * 60 * 60 * 1000;

const vietnamDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Today as `yyyy-mm-dd` in Vietnam (UTC+7), regardless of machine timezone. */
export function todayISOVietnam(now = new Date()): string {
	const parts = vietnamDateFormatter.formatToParts(now);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar-true yyyy-mm-dd check (UTC roundtrip) — shared with
 * tuition-from-kernel so due dates like 2026-02-30 never render. */
export function isValidISODate(iso: string): boolean {
	const date = new Date(`${iso}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return false;
	// Roundtrip guard: 2026-02-30 and friends silently roll over.
	return date.toISOString().slice(0, 10) === iso;
}

/**
 * Parse the `?week=` search param. Returns a valid `yyyy-mm-dd` (any day of
 * the week) or null. Years are bounded to 1970–2099 so week nav can never
 * emit expanded-year garbage like "+010000-01-07" into the URL.
 */
export function parseWeekParam(raw: unknown): string | null {
	if (typeof raw !== "string" || !ISO_DATE_PATTERN.test(raw)) return null;
	const year = Number(raw.slice(0, 4));
	if (year < MIN_YEAR || year > MAX_YEAR) return null;
	return isValidISODate(raw) ? raw : null;
}

function toUtcDate(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function fromUtcDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** ISO Monday of the week containing `iso` (inputs assumed parse-valid). */
export function startOfWeekMonday(iso: string): string {
	const date = toUtcDate(iso);
	// getUTCDay(): 0=Sunday … 6=Saturday → Monday-first offset.
	const mondayOffset = (date.getUTCDay() + 6) % 7;
	return fromUtcDate(new Date(date.getTime() - mondayOffset * DAY_MS));
}

/** `iso + n*7 days` on the UTC anchor; returns `iso` when the result would
 * leave the supported year range (1970–2099) or the 4-digit ISO format —
 * nav stands still at the edges instead of writing a param the parser would
 * reject (which would bounce the user back to the current week). */
export function addWeeks(iso: string, n: number): string {
	const shifted = fromUtcDate(
		new Date(toUtcDate(iso).getTime() + n * 7 * DAY_MS),
	);
	const year = Number(shifted.slice(0, 4));
	return ISO_DATE_PATTERN.test(shifted) && year >= MIN_YEAR && year <= MAX_YEAR
		? shifted
		: iso;
}

/** The 7 ISO dates Monday→Sunday of the week containing `weekStartIso`. */
export function weekDates(weekStartIso: string): string[] {
	const start = toUtcDate(startOfWeekMonday(weekStartIso));
	return Array.from({ length: 7 }, (_, i) =>
		fromUtcDate(new Date(start.getTime() + i * DAY_MS)),
	);
}

export function isSameISOWeek(a: string, b: string): boolean {
	return startOfWeekMonday(a) === startOfWeekMonday(b);
}

/** `dd/MM` straight from the ISO string — deterministic, no locale math. */
export function formatDayMonth(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Week range label with en-dash: `17–23/08`, `31/08–06/09`, `28/12–03/01`. */
export function formatWeekRange(weekStartIso: string): string {
	const dates = weekDates(weekStartIso);
	const first = dates[0];
	const last = dates[6];
	return `${first.slice(8, 10)}${first.slice(5, 7) === last.slice(5, 7) ? "" : `/${first.slice(5, 7)}`}–${formatDayMonth(last)}`;
}

export interface ResolvedWeek {
	weekStart: string;
	dates: string[];
	isCurrentWeek: boolean;
}

/**
 * Single composition point for the schedule route: URL param (or fallback to
 * the Vietnam "today") → week start, the 7 dates, and whether the viewed week
 * is the current one. The route component consumes only this.
 */
export function resolveWeek(
	rawParam: unknown,
	now: Date = new Date(),
): ResolvedWeek {
	const today = todayISOVietnam(now);
	const effective = parseWeekParam(rawParam) ?? today;
	const weekStart = startOfWeekMonday(effective);
	return {
		weekStart,
		dates: weekDates(weekStart),
		isCurrentWeek: weekStart === startOfWeekMonday(today),
	};
}

/** Full Vietnamese weekday names Monday-first — the `formatDayLabel` table.
 * Fixed strings instead of Intl so the label is deterministic everywhere. */
const weekdayLongNames = [
	"Thứ Hai",
	"Thứ Ba",
	"Thứ Tư",
	"Thứ Năm",
	"Thứ Sáu",
	"Thứ Bảy",
	"Chủ Nhật",
] as const;

/** 1-based Monday-first day number (1=Mon … 7=Sun) — the `lesson.day`
 * convention, derived from the calendar date instead of a stored field. */
export function isoDayNumber(iso: string): number {
	return ((toUtcDate(iso).getUTCDay() + 6) % 7) + 1;
}

/** First day of the month containing `iso` (inputs assumed parse-valid). */
export function startOfMonth(iso: string): string {
	return `${iso.slice(0, 4)}-${iso.slice(5, 7)}-01`;
}

function dayOfMonthClamped(year: number, month1: number, day: number): string {
	// Date.UTC(y, m, 0) is the last day of month `m` (1-based).
	const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
	return fromUtcDate(
		new Date(Date.UTC(year, month1 - 1, Math.min(day, lastDay))),
	);
}

/** `iso` shifted by `n` calendar months, the day clamped to the target
 * month's length (2026-01-31 + 1 → 2026-02-28; leap days included). Returns
 * `iso` when the result would leave the supported year range — month nav
 * stands still at the edges, mirroring `addWeeks`. */
export function addMonths(iso: string, n: number): string {
	const year = Number(iso.slice(0, 4));
	const month = Number(iso.slice(5, 7));
	const total = year * 12 + (month - 1) + n;
	const newYear = Math.floor(total / 12);
	const newMonth = (total % 12) + 1;
	if (newYear < MIN_YEAR || newYear > MAX_YEAR) return iso;
	return dayOfMonthClamped(newYear, newMonth, Number(iso.slice(8, 10)));
}

/** `iso + n days` on the UTC anchor; stands still at the 1970–2099 bounds
 * (same guard as `addWeeks`). */
export function addDays(iso: string, n: number): string {
	const shifted = fromUtcDate(new Date(toUtcDate(iso).getTime() + n * DAY_MS));
	const year = Number(shifted.slice(0, 4));
	return ISO_DATE_PATTERN.test(shifted) && year >= MIN_YEAR && year <= MAX_YEAR
		? shifted
		: iso;
}

/** The 42 ISO dates (6×7, Monday-first) of the month grid containing `iso`:
 * the Monday on/before the 1st, then 41 more days, so short months still
 * fill all 6 rows with leading/trailing neighbor-month days. */
export function monthGridDates(iso: string): string[] {
	const start = toUtcDate(startOfWeekMonday(startOfMonth(iso)));
	return Array.from({ length: 42 }, (_, i) =>
		fromUtcDate(new Date(start.getTime() + i * DAY_MS)),
	);
}

/** `Tháng 11 · 2026` straight from the ISO string — unpadded month. */
export function formatMonthLabel(iso: string): string {
	return `Tháng ${Number(iso.slice(5, 7))} · ${iso.slice(0, 4)}`;
}

/** `Thứ Hai 26/10` — full weekday name + `dd/MM` (see `formatDayMonth`). */
export function formatDayLabel(iso: string): string {
	return `${weekdayLongNames[isoDayNumber(iso) - 1]} ${formatDayMonth(iso)}`;
}
