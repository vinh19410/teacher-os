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

import {
	findClassOccurrence,
	lessonWeekdayFromISO,
	type OccurrenceSidState,
	projectClassSessions,
	sessionStatus,
} from "@/lib/class-sessions";
import type {
	ClassGroup,
	ClassSessionItem,
	Lesson,
	LessonStatus,
	LessonType,
	Syllabus,
} from "@/lib/mock-data";
import { splitSyllabi } from "@/lib/repos/syllabus";

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
 * - All holiday (TOS-11: "Nghỉ lễ — Đã dời lịch") -> "holiday"
 * - Remaining (mixed, all upcoming, absent) -> "upcoming"
 */
export function rollupSessionStatus(rows: readonly Lesson[]): LessonStatus {
	if (rows.length === 0) return "upcoming";
	if (rows.every((r) => r.status === "cancelled")) return "cancelled";
	if (rows.every((r) => r.status === "completed")) return "completed";
	if (rows.every((r) => r.status === "holiday")) return "holiday";
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
 *
 * Issue #649: manual classes (`schedulingMode: "manual"`) skip the schedule
 * skeleton projection — their real occurrences come from `classSessions`
 * (optional 4th arg) and fall on the teacher-chosen dates, not the weekday
 * skeleton. Without that arg a manual class simply renders no projected
 * block (its sessions still show on the class tab).
 */
export function selectProjectedWeekBlocks(
	classes: readonly ClassGroup[],
	lessons: readonly Lesson[],
	dates: readonly string[],
	classSessions: readonly ClassSessionItem[] = [],
	syllabi?: readonly Syllabus[],
): ProjectedWeekBlock[] {
	const classIdsWithRows = new Set(lessons.map((l) => l.classId));
	const curriculumByClassId =
		syllabi !== undefined
			? splitSyllabi([...syllabi]).curriculumByClassId
			: null;
	const dateSet = new Set(dates);
	const blocks: ProjectedWeekBlock[] = [];
	for (const cls of classes) {
		if (classIdsWithRows.has(cls.id)) continue;
		const byDate = new Map<string, ClassSessionItem>();
		for (const cs of classSessions) {
			if (cs.classId === cls.id) byDate.set(cs.date, cs);
		}
		const attachedCurriculum = curriculumByClassId
			? (curriculumByClassId.get(cls.id) ?? null)
			: null;
		const hasCurriculum = curriculumByClassId
			? attachedCurriculum !== null
			: Boolean(cls.syllabusId);
		const isManual =
			byDate.size > 0 || (!hasCurriculum && cls.schedulingMode === "manual");
		if (isManual) {
			// Manual class: real occurrences only — from class_session rows.
			for (const dateISO of dates) {
				const cs = byDate.get(dateISO);
				if (!cs) continue;
				blocks.push({
					classId: cls.id,
					className: cls.name,
					day: lessonWeekdayFromISO(cs.date),
					time: cs.time,
					dateISO: cs.date,
				});
			}
			continue;
		}
		const attachedLessonCount = attachedCurriculum
			? attachedCurriculum.modules.reduce((sum, m) => sum + m.lessons.length, 0)
			: 0;
		const effectiveSessionsTotal =
			cls.sessionsTotal === 0 && attachedLessonCount > 0
				? attachedLessonCount
				: cls.sessionsTotal;
		const sessions = projectClassSessions({
			schedule: cls.schedule,
			startDate: cls.startDate,
			sessionsTotal: effectiveSessionsTotal,
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
			// Buổi đã hủy và buổi nghỉ lễ đã dời (TOS-11) không chiếm slot.
			if (item.status !== "cancelled" && item.status !== "holiday") {
				slots.add(`${item.day}|${item.time}`);
			}
		}
	}
	for (const block of projectedBlocks) {
		slots.add(`${block.day}|${block.time}`);
	}
	return slots.size;
}

/** View-model của lưới tuần (TOS-14 tách route): cột theo ngày + projected. */
export interface WeekModel {
	columns: WeekSessionEntry[][];
	projected: ProjectedWeekBlock[];
	slotCount: number;
}

/**
 * Composition point dùng chung bởi route /schedule: chọn buổi theo ngày cho
 * 7 cột, block dự chiếu cho lớp chưa có dòng, và số buổi hiển thị.
 */
export function buildWeekModel(
	data: {
		classes: ClassGroup[];
		lessons: Lesson[];
		classSessions?: ClassSessionItem[];
		syllabi?: Syllabus[];
	},
	dates: readonly string[],
): WeekModel {
	const columns = [1, 2, 3, 4, 5, 6, 7].map((day, i) =>
		resolveWeekColumnEntries(
			selectWeekColumnSessions(data.lessons, day, dates),
			data.classes,
			data.lessons,
			dates[i],
		),
	);
	const projected = selectProjectedWeekBlocks(
		data.classes,
		data.lessons,
		dates,
		data.classSessions ?? [],
		data.syllabi,
	);
	return { columns, projected, slotCount: weekSlotCount(columns, projected) };
}

/**
 * Per-student state when the occurrence cannot be resolved (divergent rows,
 * free-text schedule): keep the row-based actions the popup always had — they
 * are the only way to settle such a class. A student bundles many rows, so the
 * earliest UPCOMING row (id-asc) is the target and the state; only a student
 * with nothing left to settle shows the first row's final status. Điểm danh is
 * hidden on a target that carries a date after today.
 */
export function fallbackSidStates(
	rows: readonly Lesson[],
	todayISO: string,
): OccurrenceSidState[] {
	return distinctStudentsBySid(rows).map((first) => {
		const target = rows
			.filter((r) => r.sid === first.sid && r.status === "upcoming")
			.sort((a, b) => a.id.localeCompare(b.id))[0];
		const targetLessonId = target?.id ?? null;
		const canCancelEdit = targetLessonId !== null;
		const future = target?.date != null && target.date > todayISO;
		return {
			sid: first.sid,
			status: target ? "upcoming" : first.status,
			targetLessonId,
			canCancelEdit,
			canCheckIn: canCancelEdit && !future,
		};
	});
}

/**
 * Legacy undated blocks bundle a whole course (weeks × students). Re-read each
 * one for the column date it is drawn in: its status becomes that occurrence's
 * own status, and a block whose column is outside the class schedule (the
 * weekday template repeats forever) is dropped. Dated blocks and blocks whose
 * class model cannot be resolved are returned untouched.
 */
export function resolveWeekColumnEntries(
	entries: readonly WeekSessionEntry[],
	classes: readonly ClassGroup[],
	lessons: readonly Lesson[],
	columnDateISO: string,
): WeekSessionEntry[] {
	const out: WeekSessionEntry[] = [];
	for (const entry of entries) {
		const cls =
			entry.dateISO === null
				? classes.find((c) => c.id === entry.classId)
				: undefined;
		if (!cls) {
			out.push(entry);
			continue;
		}
		const lookup = findClassOccurrence(cls, lessons, {
			dateISO: null,
			columnDateISO,
			time: entry.time,
		});
		if (lookup.kind === "outside-schedule") continue;
		out.push(
			lookup.kind === "found"
				? { ...entry, status: sessionStatus(lookup.session) }
				: entry,
		);
	}
	return out;
}
