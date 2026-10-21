/**
 * Chronological session list for the class detail "Lịch học" tab (issue #83).
 *
 * The kernel generates `sessionsTotal` lesson rows PER ENROLLMENT — same time,
 * cycling `schedule.days` — so a Tue&Fri class with 26 sessions has 26 rows
 * per student but only 2 distinct (day,time) slots, and rows carry no
 * occurrence index (UUID ids; createdAt never reaches the API response).
 * Derivation therefore:
 * - counts the occurrences of each weekday as max rows-per-sid on that
 *   weekday (real generated rows, never `sessionsTotal` and never a flat
 *   total — the generator cycles the raw days array, so an odd total gives
 *   the extra occurrence to the array's first day, not the first class day
 *   after startDate),
 * - walks calendar dates from `startDate` (weekday ∈ schedule.days) to build
 *   the chronological skeleton,
 * - attaches rows to each occurrence by slot (day,time) only — row-index
 *   mapping is impossible because the generator does not align with startDate.
 *
 * Display heuristics (rows have no occurrence identity):
 * - status: per-sid in-order prefix inside a slot — c completed rows mark the
 *   first c occurrences of that weekday "Đã học", the next x cancelled rows
 *   "Đã hủy". Check-ins normally happen in teaching order, so totals per
 *   status are always right even if an out-of-order edit shifts a label.
 * - topic: edited topics distribute in order across the slot's occurrences;
 *   otherwise syllabus lesson `index` (chronological) fills, then "—".
 *
 * DUAL-MODE (#98): when EVERY lesson row carries a non-null `date`, the
 * list is the plain date-grouped chronology — the bucket of `(classId, date)`
 * IS the physical occurrence, and the helpers below read bucket rows directly
 * instead of running prefix heuristics. Any NULL date in a class ⇒ whole
 * class falls back to the legacy walk below (frozen, fallback-only). There
 * is deliberately NO client-side count-vector gate: one moveDate permanently
 * breaks the generator formula, and identity needs no re-derivation.
 *
 * All date math runs on `yyyy-mm-dd` strings anchored at UTC midnight
 * (week-grid.ts convention) so results are deterministic on any machine.
 */

import {
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import { addMinutes, parseSchedule } from "@/lib/format-schedule";
import type { ClassGroup, Lesson, Syllabus } from "@/lib/mock-data";
import { formatDayMonth } from "@/lib/week-grid";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ClassSessionLesson = Pick<
	Lesson,
	"id" | "sid" | "day" | "time" | "dur" | "topic" | "status" | "date" | "zoom"
>;

export interface ClassSession {
	/** 1-based chronological position across the whole class. */
	index: number;
	/**
	 * Display ordinal only. Legacy: 1-based position among the occurrences
	 * of this slot (weekday+time) driving the prefix heuristics. V2 (#98):
	 * 1-based ordinal among the same-weekday dated occurrences — helpers
	 * MUST NOT run prefix math on it.
	 */
	slotIndex: number;
	dateISO: string;
	/** Lesson-day convention: 1-7, Monday = 1. */
	day: number;
	time: string;
	/** Legacy: generator-formula duration. V2: the bucket's own dur. */
	dur: number;
	/** All lesson rows of this occurrence's bucket/slot, every enrollment. */
	rows: ClassSessionLesson[];
	/** Absent on legacy construction — set to "v2" by the dated read path. */
	mode?: "v2";
}

export type SessionStatus = "completed" | "cancelled" | "upcoming";

/**
 * Accepts only strict ISO `yyyy-mm-dd` — the sole format the create-class
 * form writes (`<input type="date">`). Legacy free text or slash formats
 * return null so the UI falls back to the old weekday-grouped table instead
 * of rendering fabricated dates.
 */
export function parseStartDate(raw: string): string | null {
	if (!ISO_DATE_PATTERN.test(raw)) return null;
	const year = Number(raw.slice(0, 4));
	if (year < MIN_YEAR || year > MAX_YEAR) return null;
	const date = new Date(`${raw}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	// Roundtrip guard: 2026-02-30 and friends silently roll over.
	return date.toISOString().slice(0, 10) === raw ? raw : null;
}

function hhmmToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

function lessonWeekday(date: Date): number {
	// getUTCDay(): 0=Sunday … 6=Saturday → Monday-first 1-7.
	const day = date.getUTCDay();
	return day === 0 ? 7 : day;
}

/**
 * Schedule-derived projection for classes with ZERO lesson rows (issue #121).
 *
 * Lesson rows are generated per enrollment (issue #55), so a freshly created
 * class has nothing persisted yet — but its schedule + startDate +
 * sessionsTotal already determine every future occurrence. This function
 * derives the same chronological sessions the generator will mint on first
 * enrollment, using the SERVER's own pure skeleton helpers
 * (`@teacher-os/api/skeleton`) so projection and generation are date-for-date
 * identical by construction — never the weaker web-local parsers (no
 * dedupe/sort, no `start === end` guard).
 *
 * Fail-closed: returns null for legacy free-text schedules, empty/invalid
 * startDate, `start === end`, or totals outside the create schema's 1..52 —
 * callers keep today's rendering (empty legacy table). The result is
 * display-only: every session carries `rows: []` + `mode: "v2"`, which yields
 * zero action targets (`sessionRowTargets`), zero attendance sids, and the
 * muted "Dự kiến" badge.
 */
export function projectClassSessions(input: {
	schedule: string;
	startDate: string;
	sessionsTotal: number;
}): ClassSession[] | null {
	const parsed = parseStoredSchedule(input.schedule);
	if (!parsed) return null;
	// 52 is classCreateSchema's max — a corrupt stored row must not walk the
	// skeleton into a render hang (the walk is O(total)).
	if (
		!Number.isInteger(input.sessionsTotal) ||
		input.sessionsTotal <= 0 ||
		input.sessionsTotal > 52
	) {
		return null;
	}
	const startISO = parseStartDateStrict(input.startDate);
	if (!startISO) return null;
	const skeleton = skeletonOf(parsed, startISO, input.sessionsTotal);
	if (!skeleton) return null;

	const dur =
		(hhmmToMinutes(parsed.end) - hhmmToMinutes(parsed.start) + 1440) % 1440;
	const dated: Array<{ dateISO: string; day: number }> = [];
	for (const [day, dates] of skeleton) {
		for (const dateISO of dates) dated.push({ dateISO, day });
	}
	dated.sort((a, b) => a.dateISO.localeCompare(b.dateISO));

	const weekdayOrdinal = new Map<number, number>();
	return dated.map((entry, i) => {
		const slotIndex = (weekdayOrdinal.get(entry.day) ?? 0) + 1;
		weekdayOrdinal.set(entry.day, slotIndex);
		return {
			index: i + 1,
			slotIndex,
			dateISO: entry.dateISO,
			day: entry.day,
			time: parsed.start,
			dur,
			rows: [],
			mode: "v2" as const,
		};
	});
}

/**
 * Build the chronological session list. Returns null — and the caller keeps
 * the legacy table — when the inputs cannot be derived truthfully: legacy
 * free-text schedule, missing startDate, no rows, rows edited away from the
 * schedule slots (lesson-edit can move day/time per row), or the safety cap.
 *
 * Issue #121: `sessionsTotal` unlocks the pre-enrollment projection — with
 * zero lessons AND a positive sessionsTotal the class's sessions are derived
 * from its schedule skeleton instead of gating to the empty legacy table.
 * Any lessons present ⇒ the row-derived paths below run unchanged, so
 * projection and real rows can never mix.
 */
export function buildClassSessions(input: {
	schedule: string;
	startDate: string;
	lessons: ClassSessionLesson[];
	sessionsTotal?: number;
}): ClassSession[] | null {
	if (
		input.lessons.length === 0 &&
		typeof input.sessionsTotal === "number" &&
		Number.isInteger(input.sessionsTotal) &&
		input.sessionsTotal > 0
	) {
		return projectClassSessions({
			schedule: input.schedule,
			startDate: input.startDate,
			sessionsTotal: input.sessionsTotal,
		});
	}
	const parsed = parseSchedule(input.schedule);
	const startISO = parseStartDate(input.startDate);
	if (!parsed || !startISO || input.lessons.length === 0) return null;

	// V2 gate (#98, red-team round-2 N1): ANY fully-dated class goes v2 and
	// the ONLY client-side divergence signal remains a NULL date. No
	// count-vector/conforms mirror here — a single moveDate permanently
	// breaks the skeleton formula, so mirroring it would silently drop a
	// live class back onto the frozen table forever. Conforms() lives only
	// at backfill-time (server).
	if (
		input.lessons.length > 0 &&
		input.lessons.every((r) => typeof r.date === "string" && r.date !== "")
	) {
		return buildClassSessionsV2(input.lessons);
	}

	// Divergence guard: every row must live on a schedule slot. A row moved
	// by lesson-edit (day or time) means data no longer matches the schedule
	// JSON — fall back rather than drop sessions or mis-attach rows.
	const scheduleDays = new Set(parsed.days);
	for (const row of input.lessons) {
		if (row.time !== parsed.start || !scheduleDays.has(row.day - 1)) {
			return null;
		}
	}

	const rowsBySlot = new Map<string, ClassSessionLesson[]>();
	// Occurrences required per weekday (0-6 Mon-first) = the max per-sid row
	// count on that weekday. The generator cycles the raw `days` ARRAY, so an
	// odd total gives the extra occurrence to the array's first day — while
	// chronology alone would give it to the first class day after startDate.
	// Driving the walk by per-weekday row counts matches the rows no matter
	// how the two orders diverge (and handles duplicate days entries).
	const rowsPerSidDay = new Map<string, Map<number, number>>();
	let total = 0;
	for (const row of input.lessons) {
		const perSid = rowsPerSidDay.get(row.sid) ?? new Map<number, number>();
		const day0 = row.day - 1;
		perSid.set(day0, (perSid.get(day0) ?? 0) + 1);
		rowsPerSidDay.set(row.sid, perSid);
		const slotKey = `${row.day}|${row.time}`;
		const list = rowsBySlot.get(slotKey) ?? [];
		list.push(row);
		rowsBySlot.set(slotKey, list);
	}
	const required = new Map<number, number>();
	for (const perSid of rowsPerSidDay.values()) {
		for (const [day0, n] of perSid) {
			required.set(day0, Math.max(required.get(day0) ?? 0, n));
		}
	}
	for (const n of required.values()) total += n;

	// Duration mirrors the server generator exactly (wraps midnight).
	const dur =
		(hhmmToMinutes(parsed.end) - hhmmToMinutes(parsed.start) + 1440) % 1440;

	const sessions: ClassSession[] = [];
	const nextSlotIndex = new Map<string, number>();
	const startMs = new Date(`${startISO}T00:00:00Z`).getTime();
	// Safety cap: a weekly schedule always yields enough occurrences, so the
	// cap only trips on a weekday-convention bug — bail to the fallback.
	const capDays = total * 7 + 14;
	for (let offset = 0; offset < capDays && sessions.length < total; offset++) {
		const date = new Date(startMs + offset * DAY_MS);
		const weekday = lessonWeekday(date);
		const day0 = weekday - 1;
		if (!scheduleDays.has(day0)) continue;
		const slotKey = `${weekday}|${parsed.start}`;
		const generated = nextSlotIndex.get(slotKey) ?? 0;
		if (generated >= (required.get(day0) ?? 0)) continue;
		nextSlotIndex.set(slotKey, generated + 1);
		sessions.push({
			index: sessions.length + 1,
			slotIndex: generated + 1,
			dateISO: date.toISOString().slice(0, 10),
			day: weekday,
			time: parsed.start,
			dur,
			rows: rowsBySlot.get(slotKey) ?? [],
		});
	}
	return sessions.length === total ? sessions : null;
}

function lessonWeekdayFromISO(dateISO: string): number {
	const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/**
 * Occurrence-identity grouping (#98): rows sharing `(classId, date)` ARE one
 * physical session. Chronology is the plain sort of distinct dates; the
 * bucket supplies its own time/dur (generator + bucket-LWW writes keep them
 * uniform, and a divergent bucket can never reach here — it carries NULLs).
 */
function buildClassSessionsV2(lessons: ClassSessionLesson[]): ClassSession[] {
	const byDate = new Map<string, ClassSessionLesson[]>();
	for (const row of lessons) {
		const dateISO = row.date;
		const bucket = byDate.get(dateISO ?? "") ?? [];
		bucket.push(row);
		if (dateISO) byDate.set(dateISO, bucket);
	}
	const dates = [...byDate.keys()].sort();
	const weekdayOrdinal = new Map<number, number>();
	return dates.map((dateISO, i) => {
		const bucket = [...(byDate.get(dateISO) ?? [])].sort((a, b) =>
			a.id.localeCompare(b.id),
		);
		const day = lessonWeekdayFromISO(dateISO);
		const slotIndex = (weekdayOrdinal.get(day) ?? 0) + 1;
		weekdayOrdinal.set(day, slotIndex);
		const head = bucket[0];
		return {
			index: i + 1,
			slotIndex,
			dateISO,
			day,
			time: head?.time ?? "",
			dur: head?.dur ?? 0,
			rows: bucket,
			mode: "v2" as const,
		};
	});
}

/** "19:00–20:30" style range; wraps midnight (23:00 + 90 → 00:30). */
export function sessionTimeRange(session: ClassSession): string {
	return `${session.time}–${addMinutes(session.time, session.dur)}`;
}

const weekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
	weekday: "long",
	// ISO strings parse to UTC midnight — pin the zone or western-timezone
	// browsers shift the weekday by one day.
	timeZone: "UTC",
});

/** "Thứ Ba, 25/08" — weekday from the UTC-anchored date, dd/MM from week-grid. */
export function formatSessionDate(dateISO: string): string {
	const weekday = weekdayFormatter.format(new Date(`${dateISO}T00:00:00Z`));
	const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
	return `${capitalized}, ${formatDayMonth(dateISO)}`;
}

interface SlotSidStats {
	completed: number;
	cancelled: number;
}

function slotStatsBySid(rows: ClassSessionLesson[]): Map<string, SlotSidStats> {
	const stats = new Map<string, SlotSidStats>();
	for (const row of rows) {
		const entry = stats.get(row.sid) ?? { completed: 0, cancelled: 0 };
		if (row.status === "completed") entry.completed += 1;
		else if (row.status === "cancelled") entry.cancelled += 1;
		stats.set(row.sid, entry);
	}
	return stats;
}

/** Per-sid in-order prefix state of one occurrence within its slot. */
function sidStateAt(stats: SlotSidStats, slotIndex: number): SessionStatus {
	if (slotIndex <= stats.completed) return "completed";
	if (slotIndex <= stats.completed + stats.cancelled) return "cancelled";
	return "upcoming";
}

/**
 * Aggregate status of one occurrence: "completed" only when every enrollment
 * has it completed, "cancelled" only when every enrollment has it cancelled,
 * otherwise "upcoming" (`absent` counts as not-completed, matching the
 * legacy table's rendering).
 */
export function sessionStatus(session: ClassSession): SessionStatus {
	if (session.mode === "v2") {
		// Bucket-read semantics (#98): no prefix math — the rows ARE the truth.
		let allCompleted = true;
		let allCancelled = true;
		for (const row of session.rows) {
			if (row.status !== "completed") allCompleted = false;
			if (row.status !== "cancelled") allCancelled = false;
		}
		if (session.rows.length > 0 && allCompleted) return "completed";
		if (session.rows.length > 0 && allCancelled) return "cancelled";
		return "upcoming";
	}
	const stats = slotStatsBySid(session.rows);
	let allCompleted = true;
	let allCancelled = true;
	for (const entry of stats.values()) {
		const state = sidStateAt(entry, session.slotIndex);
		if (state !== "completed") allCompleted = false;
		if (state !== "cancelled") allCancelled = false;
	}
	if (stats.size > 0 && allCompleted) return "completed";
	if (stats.size > 0 && allCancelled) return "cancelled";
	return "upcoming";
}

/**
 * Sids attending this occurrence: a sid with n rows in the slot attends the
 * first n occurrences of that slot (same in-order assumption as the status
 * prefix). Unique, in first-appearance order.
 */
export function sessionStudents(session: ClassSession): string[] {
	if (session.mode === "v2") {
		// One row per sid in a conforming bucket — appearance order it is.
		return [...new Set(session.rows.map((r) => r.sid))];
	}
	const counts = new Map<string, number>();
	const order: string[] = [];
	for (const row of session.rows) {
		if (!counts.has(row.sid)) order.push(row.sid);
		counts.set(row.sid, (counts.get(row.sid) ?? 0) + 1);
	}
	return order.filter((sid) => (counts.get(sid) ?? 0) >= session.slotIndex);
}

/**
 * Topic of one occurrence: edited topics of the slot distribute in order
 * (nth topic → nth occurrence of the slot), otherwise the syllabus lesson at
 * the chronological index, otherwise null (caller renders "—"). Render-only:
 * syllabus titles are never written back to `lesson.topic`.
 */
export function sessionTopic(
	session: ClassSession,
	syLessons: ReadonlyArray<{ title: string }>,
): string | null {
	if (session.mode === "v2") {
		// Identity read (fixes the mis-fan that option 3 targets): the topic
		// authored on THIS occurrence wins. Multi-authored buckets collapse
		// to the id-min non-empty winner — a declared lossy pick (plan #98
		// Behavior Changes 7), deterministic across tabs.
		const winner = [...session.rows]
			.filter((r) => r.topic !== "")
			.sort((a, b) => a.id.localeCompare(b.id))[0]?.topic;
		if (winner !== undefined) return winner;
		return syLessons[session.index - 1]?.title ?? null;
	}
	const editedTopics: string[] = [];
	for (const row of session.rows) {
		if (row.topic !== "" && !editedTopics.includes(row.topic)) {
			editedTopics.push(row.topic);
		}
	}
	const edited = editedTopics[session.slotIndex - 1];
	if (edited !== undefined) return edited;
	return syLessons[session.index - 1]?.title ?? null;
}

export interface SessionLessonInfo {
	title: string | null;
	moduleTitle: string | null;
	lessonId: string | null;
	materials: string | null;
	objectives: string | null;
}

/**
 * Detailed syllabus lesson info for one occurrence: derives topic title (with
 * edited-topic slot override), parent module title, lesson id, materials,
 * and objectives according to the chronological index.
 */
export function sessionLessonInfo(
	session: ClassSession,
	syllabus: Syllabus | null,
): SessionLessonInfo {
	const flattenedLessons =
		syllabus?.modules.flatMap((m) =>
			m.lessons.map((l) => ({
				lessonId: l.id,
				title: l.title,
				moduleTitle: m.title,
				materials: l.materials,
				objectives: l.objectives,
			})),
		) ?? [];

	const title = sessionTopic(session, flattenedLessons);
	const mapped = flattenedLessons[session.index - 1];

	return {
		title,
		moduleTitle: mapped?.moduleTitle ?? null,
		lessonId: mapped?.lessonId ?? null,
		materials: mapped?.materials ?? null,
		objectives: mapped?.objectives ?? null,
	};
}

/**
 * In-place attendance support (issue #91).
 *
 * `session.rows` is a SLOT BAG — every lesson row of every enrollment sharing
 * the weekday+time slot — so a row never identifies the occurrence being
 * displayed. Binding `rowsForSid[slotIndex-1]` would POST a different
 * occurrence's id than the row the teacher is looking at. Check-in on ANY
 * upcoming row of a sid paints the earliest unmarked occurrence (prefix
 * heuristic), so the CTA must be sequential-head-only and carry exactly one
 * upcoming id per sid per click. Never iterate `session.rows` in JSX and never
 * use `sessionLessonInfo().lessonId` (syllabus id) for check-in.
 */

/**
 * In-place attendance support — LEGACY notes (#98). On dated (v2) classes
 * each row is the single row of its sid inside a one-date bucket, so the
 * old bag-dangers below do not apply there; on legacy classes they still do.
 */

/** Date gate for the CTA: occurrence already started (or today) in VN time. */
export function sessionIsEligibleDate(
	session: ClassSession,
	todayISO: string,
): boolean {
	return session.dateISO <= todayISO;
}

/**
 * One upcoming enrollment lesson id of `sid` from the slot bag (id-sort).
 * LEGACY-ONLY targeting — on dated classes the v2 branches post the bucket's
 * own row id instead (R6: min-UUID guesses never touch v2).
 */
export function firstUpcomingLessonId(
	session: ClassSession,
	sid: string,
): string | null {
	// filter() already copies, so sort() cannot mutate the slot bag.
	const row = session.rows
		.filter((r) => r.sid === sid && r.status === "upcoming")
		.sort((a, b) => a.id.localeCompare(b.id))[0];
	return row?.id ?? null;
}

/**
 * V2 action targets (#98 Phase 4 entry gate): the upcoming rows OF THIS
 * OCCURRENCE, deterministic id-asc, one per sid when backfill conformed.
 * Legacy classes have no targets — the modal never mounts on them.
 * Replaces every min-UUID/sequential-head guess for dated classes (R6).
 */
export function sessionRowTargets(session: ClassSession): ClassSessionLesson[] {
	if (session.mode !== "v2") return [];
	return session.rows.filter((r) => r.status === "upcoming");
}

/** Sequential head: `sid`'s earliest unmarked occurrence within its slot. */
function isSequentialHead(session: ClassSession, sid: string): boolean {
	// Prefix math is meaningless on dated buckets — v2 never reaches here.
	if (session.mode === "v2") return false;
	const stats = slotStatsBySid(session.rows).get(sid);
	if (!stats) return false;
	return (
		sidStateAt(stats, session.slotIndex) === "upcoming" &&
		session.slotIndex === stats.completed + stats.cancelled + 1
	);
}

export type SessionAttendanceDisplay =
	| "completed"
	| "cancelled"
	| "check-in"
	| "upcoming";

export interface SessionAttendanceSid {
	sid: string;
	/** Enrollment lesson id to POST check-in for (null = nothing to click). */
	enrollmentLessonId: string | null;
	display: SessionAttendanceDisplay;
}

export type SessionAttendanceKind =
	| "completed"
	| "cancelled"
	| "future"
	| "upcoming"
	| "actionable";

export interface SessionAttendanceState {
	kind: SessionAttendanceKind;
	sids: SessionAttendanceSid[];
}

/**
 * Render state for the Trạng thái column: aggregate kind for badge-only rows
 * (cancelled / completed / future), otherwise per-sid display where only the
 * sequential head of each sid gets `check-in` with an `enrollmentLessonId`.
 */
export function sessionAttendanceState(
	session: ClassSession,
	todayISO: string,
): SessionAttendanceState {
	const aggregate = sessionStatus(session);
	if (aggregate === "cancelled") return { kind: "cancelled", sids: [] };
	if (aggregate === "completed") return { kind: "completed", sids: [] };
	if (!sessionIsEligibleDate(session, todayISO)) {
		return { kind: "future", sids: [] };
	}
	const sids: SessionAttendanceSid[] = sessionStudents(session).map((sid) => {
		let enrollmentLessonId: string | null = null;
		let state: SessionStatus = "upcoming";
		if (session.mode === "v2") {
			// The dated row itself is authoritative — no head-of-prefix guess.
			const row = [...session.rows]
				.filter((r) => r.sid === sid)
				.sort((a, b) => a.id.localeCompare(b.id))[0];
			state =
				row?.status === "completed" || row?.status === "cancelled"
					? row.status
					: "upcoming"; // absent counts as not-completed, legacy parity
			enrollmentLessonId = state === "upcoming" ? (row?.id ?? null) : null;
			if (state === "completed") {
				return { sid, enrollmentLessonId: null, display: "completed" };
			}
			if (state === "cancelled") {
				return { sid, enrollmentLessonId: null, display: "cancelled" };
			}
			return {
				sid,
				enrollmentLessonId,
				display: enrollmentLessonId ? "check-in" : "upcoming",
			};
		}
		const stats = slotStatsBySid(session.rows).get(sid);
		state = stats ? sidStateAt(stats, session.slotIndex) : "upcoming";
		if (state === "completed") {
			return { sid, enrollmentLessonId: null, display: "completed" };
		}
		if (state === "cancelled") {
			return { sid, enrollmentLessonId: null, display: "cancelled" };
		}
		if (isSequentialHead(session, sid)) {
			const enrollmentLessonId = firstUpcomingLessonId(session, sid);
			return {
				sid,
				enrollmentLessonId,
				display: enrollmentLessonId ? "check-in" : "upcoming",
			};
		}
		return { sid, enrollmentLessonId: null, display: "upcoming" };
	});
	return {
		kind: sids.some((s) => s.display === "check-in")
			? "actionable"
			: "upcoming",
		sids,
	};
}

/** Status of one student at one occurrence; `absent` only exists on dated rows. */
export type OccurrenceStatus = SessionStatus | "absent";

export interface OccurrenceSidState {
	sid: string;
	status: OccurrenceStatus;
	/**
	 * The one row Điểm danh / Hủy / Sửa write to; null = no valid row (settled,
	 * absent, or a legacy occurrence that is not this student's sequential head).
	 */
	targetLessonId: string | null;
	/** Hủy/Sửa need a target; the date never blocks them (future sessions stay editable). */
	canCancelEdit: boolean;
	/** Điểm danh needs a target AND an occurrence date that has arrived. */
	canCheckIn: boolean;
}

/**
 * Per-student state of ONE occurrence. Unlike `sessionAttendanceState` this
 * never collapses to an aggregate "future": the /schedule popup must show each
 * student's own status and know which single row each action writes to.
 * - dated (v2): the bucket row of the student IS the truth;
 * - legacy: in-order prefix status, and only the sequential head owns a row.
 */
export function occurrenceSidStates(
	session: ClassSession,
	todayISO: string,
): OccurrenceSidState[] {
	const dateArrived = sessionIsEligibleDate(session, todayISO);
	return sessionStudents(session).map((sid) => {
		let status: OccurrenceStatus = "upcoming";
		let targetLessonId: string | null = null;
		if (session.mode === "v2") {
			const row = session.rows
				.filter((r) => r.sid === sid)
				.sort((a, b) => a.id.localeCompare(b.id))[0];
			if (
				row?.status === "completed" ||
				row?.status === "cancelled" ||
				row?.status === "absent"
			) {
				status = row.status;
			} else if (row) {
				targetLessonId = row.id;
			}
		} else {
			const stats = slotStatsBySid(session.rows).get(sid);
			status = stats ? sidStateAt(stats, session.slotIndex) : "upcoming";
			if (status === "upcoming" && isSequentialHead(session, sid)) {
				targetLessonId = firstUpcomingLessonId(session, sid);
			}
		}
		const canCancelEdit = targetLessonId !== null;
		return {
			sid,
			status,
			targetLessonId,
			canCancelEdit,
			canCheckIn: canCancelEdit && dateArrived,
		};
	});
}

export type ClassOccurrenceLookup =
	| { kind: "found"; session: ClassSession }
	/** The class model is valid but this column date is not on its schedule. */
	| { kind: "outside-schedule" }
	/** No trustworthy model (free-text schedule, rows moved off their slot). */
	| { kind: "unresolved" };

/**
 * Resolve the occurrence a /schedule block stands for.
 * - Dated entry: its `(classId, date)` bucket alone is the occurrence. Going
 *   through `buildClassSessions` would let any undated row of the same class
 *   push the whole class onto the legacy walk and mis-read the dated rows.
 * - Undated entry: the legacy walk over the class's UNDATED rows only, matched
 *   by the column date the block was drawn in.
 */
export function findClassOccurrence(
	cls: Pick<ClassGroup, "id" | "schedule" | "startDate" | "sessionsTotal">,
	lessons: readonly Lesson[],
	ref: { dateISO: string | null; columnDateISO?: string; time: string },
): ClassOccurrenceLookup {
	const classLessons = lessons.filter((l) => l.classId === cls.id);
	if (ref.dateISO != null) {
		const bucket = classLessons.filter((l) => l.date === ref.dateISO);
		const [session] = buildClassSessionsV2(bucket);
		return session ? { kind: "found", session } : { kind: "unresolved" };
	}
	const sessions = buildClassSessions({
		schedule: cls.schedule,
		startDate: cls.startDate,
		lessons: classLessons.filter((l) => l.date == null),
		sessionsTotal: cls.sessionsTotal,
	});
	if (!sessions) return { kind: "unresolved" };
	const session = sessions.find(
		(s) => s.dateISO === ref.columnDateISO && s.time === ref.time,
	);
	return session ? { kind: "found", session } : { kind: "outside-schedule" };
}
