/**
 * Week-accurate selection for the /schedule grid (issue #121).
 *
 * The grid used to render every dated class as a weekly template — a pure
 * `l.day` filter repeated the same slots in all weeks and showed nothing for
 * classes whose lesson rows don't exist yet (generation is per-enrollment).
 * These pure helpers own the per-week selection so the route stays thin and
 * the QC #121 week semantics are unit-testable without React:
 * - dated real rows render only in the week containing their `date`;
 * - undated legacy rows keep the frozen weekday-template behavior;
 * - classes with ZERO rows contribute projected blocks (display-only, from
 *   the shared skeleton via projectClassSessions — see class-sessions.ts);
 * - the header lead counts the distinct non-cancelled slots actually
 *   rendered for the viewed week, deduped by `day|time` across sources (AC8).
 *
 * All date math is UTC-anchored `yyyy-mm-dd` strings (week-grid convention).
 */

import { projectClassSessions } from "@/lib/class-sessions";
import type { ClassGroup, Lesson } from "@/lib/mock-data";

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
	columns: readonly (readonly Lesson[])[],
	projectedBlocks: readonly ProjectedWeekBlock[],
): number {
	const slots = new Set<string>();
	for (const column of columns) {
		for (const l of column) {
			if (l.status !== "cancelled") slots.add(`${l.day}|${l.time}`);
		}
	}
	for (const block of projectedBlocks) {
		slots.add(`${block.day}|${block.time}`);
	}
	return slots.size;
}
