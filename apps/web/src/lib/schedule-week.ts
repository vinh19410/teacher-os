/**
 * Week-accurate selection for the /schedule grid (issue #121, #162).
 *
 * The grid renders weekly sessions grouped by class (issue #162):
 * - a physical session of a class (multiple enrollments sharing classId + date)
 *   renders as a single block on the week grid;
 * - dated real rows render only in the week containing their `date`;
 * - undated legacy rows keep the frozen weekday-template behavior, grouped by (classId, day, time);
 * - classes with ZERO rows contribute projected blocks (display-only, from
 *   the shared skeleton via projectClassSessions — see class-sessions.ts);
 * - the header lead counts the distinct non-cancelled slots actually
 *   rendered for the viewed week, deduped by `day|time` across sources (AC8).
 *
 * All date math is UTC-anchored `yyyy-mm-dd` strings (week-grid convention).
 */

import { projectClassSessions } from "@/lib/class-sessions";
import type {
	ClassGroup,
	Lesson,
	LessonStatus,
	LessonType,
} from "@/lib/mock-data";

/** Real lessons for one weekday column of the viewed week. */
export function selectWeekColumnLessons(
	lessons: Lesson[],
	day: number,
	dates: readonly string[],
): Lesson[] {
	return lessons.filter(
		(l) => l.day === day && (l.date == null || dates.includes(l.date)),
	);
}

export interface WeekSessionEntry {
	key: string;
	classId: string;
	dateISO: string | null;
	day: number;
	time: string;
	rows: Lesson[];
	status: LessonStatus;
	type: LessonType;
	topic: string;
}

export interface SessionRef {
	classId: string;
	dateISO: string | null;
	day: number;
	time: string;
}

/**
 * Shared grouping key helper so `selectWeekColumnSessions` and `findSessionRows`
 * never drift in their occurrence grouping predicate.
 */
export function sessionKeyOf(l: {
	classId: string;
	date: string | null;
	day: number;
	time: string;
}): string {
	return l.date != null
		? `d:${l.classId}:${l.date}`
		: `l:${l.classId}:${l.day}:${l.time}`;
}

export function sessionKeyOfRef(ref: SessionRef): string {
	return ref.dateISO != null
		? `d:${ref.classId}:${ref.dateISO}`
		: `l:${ref.classId}:${ref.day}:${ref.time}`;
}

/**
 * Status rollup:
 * - All cancelled -> "cancelled"
 * - All completed -> "completed"
 * - Remaining (mixed, all upcoming, absent) -> "upcoming"
 */
export function rollupSessionStatus(rows: readonly Lesson[]): LessonStatus {
	if (rows.length === 0) return "upcoming";
	if (rows.every((r) => r.status === "cancelled")) return "cancelled";
	if (rows.every((r) => r.status === "completed")) return "completed";
	return "upcoming";
}

/**
 * Session selector grouping lesson rows into session blocks by class for one weekday column.
 * - Dated rows group by `d:{classId}:{date}`
 * - Legacy undated rows group by `l:{classId}:{day}:{time}`
 * - Rows within an entry are sorted by `id` for stable rendering
 * - type/topic come from the first row (sorted by id)
 */
export function selectWeekColumnSessions(
	lessons: Lesson[],
	day: number,
	dates: readonly string[],
): WeekSessionEntry[] {
	const columnLessons = selectWeekColumnLessons(lessons, day, dates);
	const groups = new Map<string, Lesson[]>();

	for (const l of columnLessons) {
		const key = sessionKeyOf(l);
		const list = groups.get(key);
		if (list) {
			list.push(l);
		} else {
			groups.set(key, [l]);
		}
	}

	const entries: WeekSessionEntry[] = [];
	for (const [key, rows] of groups) {
		rows.sort((a, b) => a.id.localeCompare(b.id));
		const first = rows[0];
		entries.push({
			key,
			classId: first.classId,
			dateISO: first.date,
			day: first.day,
			time: first.time,
			rows,
			status: rollupSessionStatus(rows),
			type: first.type,
			topic: first.topic,
		});
	}

	return entries;
}

/**
 * Issue #204: legacy undated rows collapse a whole course (weeks × students)
 * into one entry, so `rows.length` counts rows — not people. Dedupe by
 * `sid`, keeping the first row of each student (stable by id sort).
 */
export function distinctStudentsBySid<T extends { sid: string }>(
	rows: readonly T[],
): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const row of rows) {
		if (seen.has(row.sid)) continue;
		seen.add(row.sid);
		out.push(row);
	}
	return out;
}

/**
 * Lookup live rows for a session occurrence from store state (e.g. for modal display).
 * Prevents holding stale snapshot rows after check-in/cancel mutations.
 */
export function findSessionRows(
	lessons: readonly Lesson[],
	ref: SessionRef,
): Lesson[] {
	const targetKey = sessionKeyOfRef(ref);
	return lessons
		.filter((l) => sessionKeyOf(l) === targetKey)
		.sort((a, b) => a.id.localeCompare(b.id));
}

export interface ProjectedWeekBlock {
	classId: string;
	className: string;
	/** Lesson-day convention 1-7, Monday = 1. */
	day: number;
	time: string;
	dateISO: string;
}

/**
 * Projected (display-only) blocks for the viewed week from every class that
 * has zero lesson rows. Classes with any real row are skipped entirely — the
 * projection never mixes with persisted rows.
 */
export function selectProjectedWeekBlocks(
	classes: readonly ClassGroup[],
	lessons: readonly Lesson[],
	dates: readonly string[],
): ProjectedWeekBlock[] {
	const classIdsWithRows = new Set(lessons.map((l) => l.classId));
	const dateSet = new Set(dates);
	const blocks: ProjectedWeekBlock[] = [];
	for (const cls of classes) {
		if (classIdsWithRows.has(cls.id)) continue;
		const sessions = projectClassSessions({
			schedule: cls.schedule,
			startDate: cls.startDate,
			sessionsTotal: cls.sessionsTotal,
		});
		if (!sessions) continue;
		for (const session of sessions) {
			if (!dateSet.has(session.dateISO)) continue;
			blocks.push({
				classId: cls.id,
				className: cls.name,
				day: session.day,
				time: session.time,
				dateISO: session.dateISO,
			});
		}
	}
	return blocks;
}

/**
 * Distinct non-cancelled `day|time` slots actually rendered for the viewed
 * week — real column lessons plus projected blocks, deduped across sources
 * (a 1:2 slot with one row per enrollment counts once; a projected slot at
 * the same day|time as a real row does not double-count).
 */
export function weekSlotCount(
	columns: readonly (readonly (WeekSessionEntry | Lesson)[])[],
	projectedBlocks: readonly ProjectedWeekBlock[],
): number {
	const slots = new Set<string>();
	for (const column of columns) {
		for (const item of column) {
			if (item.status !== "cancelled") slots.add(`${item.day}|${item.time}`);
		}
	}
	for (const block of projectedBlocks) {
		slots.add(`${block.day}|${block.time}`);
	}
	return slots.size;
}
