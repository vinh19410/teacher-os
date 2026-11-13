/**
 * Day view-model for /schedule (TOS-14, issue #447): one date's agenda —
 * dated sessions of that day, legacy weekday-template rows, projected
 * zero-row-class blocks and same-day org events — sorted by ascending time.
 *
 * Reuses the week selectors (schedule-week.ts) as the single source of
 * session grouping/rollup truth; all date math is UTC-anchored `yyyy-mm-dd`
 * strings (week-grid convention).
 */

import { addMinutes } from "@/lib/format-schedule";
import type {
	ClassGroup,
	ClassSessionItem,
	Lesson,
	LessonStatus,
	LessonType,
	Syllabus,
} from "@/lib/mock-data";
import type { HolidaySpanLike, ScheduleEventLike } from "@/lib/schedule-month";
import {
	distinctStudentsBySid,
	resolveWeekColumnEntries,
	selectProjectedWeekBlocks,
	selectWeekColumnSessions,
} from "@/lib/schedule-week";
import { isoDayNumber } from "@/lib/week-grid";

export interface DaySourceData {
	classes: ClassGroup[];
	lessons: Lesson[];
	/** Issue #649: buổi thủ công của lớp manual — optional (deploy skew). */
	classSessions?: readonly ClassSessionItem[];
	syllabi?: readonly Syllabus[];
	/** Org events (TOS-14). Optional — snapshots without events still build. */
	events?: readonly ScheduleEventLike[];
	/** Org holidays (TOS-14b/#453). Optional — snapshots without holidays
	 * still build. */
	holidays?: readonly HolidaySpanLike[];
}

export interface DayLessonItem {
	kind: "lesson";
	/** Session grouping key (`selectWeekColumnSessions`). */
	id: string;
	classId: string;
	time: string;
	/** `time + rows[0].dur` minutes, wrapped past midnight. */
	endTime: string;
	status: LessonStatus;
	topic: string;
	type: LessonType;
	/** null for legacy weekday-template occurrences. */
	dateISO: string | null;
	students: number;
	/** Live rows for the occurrence (modal/actions reuse). */
	rows: Lesson[];
}

export interface DayEventItem {
	kind: "event";
	id: string;
	title: string;
	time: string;
	endTime: string;
}

export interface DayHolidayItem {
	kind: "holiday";
	id: string;
	name: string;
	fromDate: string;
	toDate: string;
}

export type DayAgendaItem = DayLessonItem | DayEventItem | DayHolidayItem;

/** Holidays are all-day spans → first; then time ascending; id tie-break. */
function compareItems(a: DayAgendaItem, b: DayAgendaItem): number {
	const aDay = a.kind === "holiday" ? 0 : 1;
	const bDay = b.kind === "holiday" ? 0 : 1;
	if (aDay !== bDay) return aDay - bDay;
	if (a.kind !== "holiday" && b.kind !== "holiday" && a.time !== b.time) {
		return a.time < b.time ? -1 : 1;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * One day's agenda items, time-ascending: dated + legacy sessions (via the
 * week selectors, including projected blocks for zero-row classes) and
 * same-day org events. Cancelled sessions stay visible — the day view is the
 * detailed agenda (unlike the capped month cell).
 */
export function buildDayAgenda(
	data: DaySourceData,
	dateISO: string,
): DayAgendaItem[] {
	const day = isoDayNumber(dateISO);
	const entries = resolveWeekColumnEntries(
		selectWeekColumnSessions(data.lessons, day, [dateISO]),
		data.classes,
		data.lessons,
		dateISO,
	);

	const items: DayAgendaItem[] = entries.map((entry) => ({
		kind: "lesson",
		id: entry.key,
		classId: entry.classId,
		time: entry.time,
		endTime: addMinutes(entry.time, entry.rows[0]?.dur ?? 0),
		status: entry.status,
		topic: entry.topic,
		type: entry.type,
		dateISO: entry.dateISO,
		students: distinctStudentsBySid(entry.rows).length,
		rows: entry.rows,
	}));

	for (const block of selectProjectedWeekBlocks(
		data.classes,
		data.lessons,
		[dateISO],
		data.classSessions ?? [],
		data.syllabi,
	)) {
		items.push({
			kind: "lesson",
			id: `p:${block.classId}:${block.dateISO}`,
			classId: block.classId,
			time: block.time,
			endTime: block.time,
			status: "upcoming",
			topic: "",
			type: "1:1",
			dateISO: block.dateISO,
			students: 0,
			rows: [],
		});
	}

	for (const event of data.events ?? []) {
		if (event.date !== dateISO) continue;
		items.push({
			kind: "event",
			id: event.id,
			title: event.title,
			time: event.startTime,
			endTime: event.endTime,
		});
	}

	// TOS-14b: holidays covering this date surface as all-day agenda items.
	for (const holiday of data.holidays ?? []) {
		if (holiday.fromDate <= dateISO && dateISO <= holiday.toDate) {
			items.push({
				kind: "holiday",
				id: holiday.id,
				name: holiday.name,
				fromDate: holiday.fromDate,
				toDate: holiday.toDate,
			});
		}
	}

	items.sort(compareItems);
	return items;
}
