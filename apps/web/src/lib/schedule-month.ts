/**
 * Month view-model for /schedule (TOS-14, issue #447): folds dated lesson
 * rows, legacy weekday-template rows, projected zero-row-class blocks and org
 * events into 42 (6×7, Monday-first) grid cells, capped at 3 visible items
 * per cell with the remainder counted as `overflow`.
 *
 * All date math is UTC-anchored `yyyy-mm-dd` strings (week-grid convention).
 * The week selectors (`selectWeekColumnSessions`,
 * `resolveWeekColumnEntries`, `selectProjectedWeekBlocks`) stay the single
 * source of session grouping/rollup truth.
 */

import type { ClassGroup, Lesson, LessonStatus } from "@/lib/mock-data";
import {
	distinctStudentsBySid,
	resolveWeekColumnEntries,
	selectProjectedWeekBlocks,
	selectWeekColumnSessions,
} from "@/lib/schedule-week";
import { isoDayNumber, monthGridDates, todayISOVietnam } from "@/lib/week-grid";

/** Structural mirror of KernelEventRow — deliberately NOT imported from
 * `@teacher-os/api`. Optionals mirror KernelEventRow extras so object literals
 * (test fixtures, UI call sites) type-check without casts. */
export interface ScheduleEventLike {
	id: string;
	title: string;
	/** `yyyy-mm-dd`. */
	date: string;
	/** `HH:mm`. */
	startTime: string;
	/** `HH:mm`. */
	endTime: string;
	note?: string;
	createdAt?: string;
	createdByUserId?: string;
}

export interface MonthSourceData {
	classes: ClassGroup[];
	lessons: Lesson[];
	/** Org events (TOS-14). Optional — snapshots without events still build. */
	events?: readonly ScheduleEventLike[];
	/** Org holidays (TOS-14b/#453). Optional — snapshots without holidays
	 * still build. Structural mirror of KernelHolidaySummary — deliberately
	 * NOT imported from `@teacher-os/api` (same pattern as ScheduleEventLike). */
	holidays?: readonly HolidaySpanLike[];
}

/** Structural mirror of KernelHolidaySummary's span fields. */
export interface HolidaySpanLike {
	id: string;
	name: string;
	/** `yyyy-mm-dd`, both ends inclusive. */
	fromDate: string;
	toDate: string;
}

export interface MonthLessonItem {
	kind: "lesson";
	/** Session grouping key (`selectWeekColumnSessions`) or the projected
	 * block id `p:{classId}:{date}` for zero-row classes. */
	id: string;
	classId: string;
	time: string;
	status: LessonStatus;
	/** Enrollment rows in the session occurrence (0 for projected blocks). */
	students: number;
}

export interface MonthEventItem {
	kind: "event";
	id: string;
	title: string;
	time: string;
	endTime: string;
}

export interface MonthHolidayItem {
	kind: "holiday";
	id: string;
	name: string;
}

export type MonthItem = MonthLessonItem | MonthEventItem | MonthHolidayItem;

export interface MonthCell {
	date: string;
	/** Inside the anchor's calendar month (vs leading/trailing filler). */
	inMonth: boolean;
	isToday: boolean;
	/** Time-ascending, at most `MAX_VISIBLE_ITEMS`. */
	items: MonthItem[];
	/** Items beyond the visible cap (cancelled sessions never count). */
	overflow: number;
}

const MAX_VISIBLE_ITEMS = 3;

function lessonItemOf(entry: {
	key: string;
	classId: string;
	time: string;
	status: LessonStatus;
	rows: Lesson[];
}): MonthLessonItem {
	return {
		kind: "lesson",
		id: entry.key,
		classId: entry.classId,
		time: entry.time,
		status: entry.status,
		students: distinctStudentsBySid(entry.rows).length,
	};
}

function eventItemOf(event: ScheduleEventLike): MonthEventItem {
	return {
		kind: "event",
		id: event.id,
		title: event.title,
		time: event.startTime,
		endTime: event.endTime,
	};
}

/**
 * Expand inclusive `[fromDate..toDate]` holiday spans into a per-date index —
 * shared by the month view-model and the week view (one pass, UTC-safe +1 day
 * on `yyyy-mm-dd` strings per the week-grid convention).
 */
export function holidaysByDateIndex<T extends HolidaySpanLike>(
	holidays: readonly T[],
): Map<string, T[]> {
	const byDate = new Map<string, T[]>();
	for (const holiday of holidays) {
		let cursor = holiday.fromDate;
		while (cursor <= holiday.toDate) {
			const bucket = byDate.get(cursor);
			if (bucket) bucket.push(holiday);
			else byDate.set(cursor, [holiday]);
			const next = new Date(`${cursor}T00:00:00Z`);
			next.setUTCDate(next.getUTCDate() + 1);
			cursor = next.toISOString().slice(0, 10);
		}
	}
	return byDate;
}

/** Holidays are all-day spans → first; then time ascending; id tie-break. */
function compareItems(a: MonthItem, b: MonthItem): number {
	const aDay = a.kind === "holiday" ? 0 : 1;
	const bDay = b.kind === "holiday" ? 0 : 1;
	if (aDay !== bDay) return aDay - bDay;
	if (a.kind !== "holiday" && b.kind !== "holiday" && a.time !== b.time) {
		return a.time < b.time ? -1 : 1;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the 42-cell month grid for `anchor`. Rows and events are indexed by
 * date exactly once outside the cell loop (perf budget: 50 classes × 24
 * sessions < 50ms); per cell only the small legacy weekday bucket and the
 * zero-row-class projection run through the week selectors.
 */
export function buildMonthCells(
	data: MonthSourceData,
	anchor: string,
	today: string = todayISOVietnam(),
): MonthCell[] {
	const dates = monthGridDates(anchor);
	const monthPrefix = anchor.slice(0, 7);

	// One pass each: dated rows by exact date, legacy rows by weekday, events
	// by date — the cell loop never rescans the full lesson/event lists.
	const datedByDate = new Map<string, Lesson[]>();
	const legacyByDay = new Map<number, Lesson[]>();
	for (const lessonRow of data.lessons) {
		if (lessonRow.date != null) {
			const bucket = datedByDate.get(lessonRow.date);
			if (bucket) bucket.push(lessonRow);
			else datedByDate.set(lessonRow.date, [lessonRow]);
		} else {
			const bucket = legacyByDay.get(lessonRow.day);
			if (bucket) bucket.push(lessonRow);
			else legacyByDay.set(lessonRow.day, [lessonRow]);
		}
	}
	const eventsByDate = new Map<string, ScheduleEventLike[]>();
	for (const event of data.events ?? []) {
		const bucket = eventsByDate.get(event.date);
		if (bucket) bucket.push(event);
		else eventsByDate.set(event.date, [event]);
	}

	// Holidays expand their inclusive [fromDate..toDate] span into per-date
	// items once — the cell loop only reads the small per-date buckets.
	const holidaysByDate = holidaysByDateIndex(data.holidays ?? []);

	// Projection only ever applies to classes with zero lesson rows —
	// pre-filter once so the per-cell projection scan stays cheap.
	const classIdsWithRows = new Set(data.lessons.map((l) => l.classId));
	const projectedClasses = data.classes.filter(
		(cls) => !classIdsWithRows.has(cls.id),
	);

	return dates.map((date) => {
		const day = isoDayNumber(date);
		// Dated bucket for this exact date + legacy bucket for this weekday —
		// the week selectors do the session grouping/rollup for both.
		const rows = [
			...(datedByDate.get(date) ?? []),
			...(legacyByDay.get(day) ?? []),
		];
		const entries = resolveWeekColumnEntries(
			selectWeekColumnSessions(rows, day, [date]),
			data.classes,
			data.lessons,
			date,
		);
		const items: MonthItem[] = [];
		for (const entry of entries) {
			// Cancelled sessions render nowhere in the compact month cell —
			// not as items, not in the overflow count.
			if (entry.status === "cancelled") continue;
			items.push(lessonItemOf(entry));
		}
		if (projectedClasses.length > 0) {
			for (const block of selectProjectedWeekBlocks(
				projectedClasses,
				[],
				[date],
			)) {
				items.push({
					kind: "lesson",
					id: `p:${block.classId}:${block.dateISO}`,
					classId: block.classId,
					time: block.time,
					status: "upcoming",
					students: 0,
				});
			}
		}
		for (const event of eventsByDate.get(date) ?? []) {
			items.push(eventItemOf(event));
		}
		for (const holiday of holidaysByDate.get(date) ?? []) {
			items.push({
				kind: "holiday",
				id: holiday.id,
				name: holiday.name,
			});
		}
		items.sort(compareItems);

		return {
			date,
			inMonth: date.slice(0, 7) === monthPrefix,
			isToday: date === today,
			items: items.slice(0, MAX_VISIBLE_ITEMS),
			overflow: Math.max(0, items.length - MAX_VISIBLE_ITEMS),
		};
	});
}
