/**
 * URL view-model for /schedule (TOS-14, issue #447): parses `?view=` +
 * `?date=` into the {view, date, scrub} triple the route needs, translating
 * legacy `?week=` links, and steps the anchor date by the view's unit.
 *
 * All date math is UTC-anchored `yyyy-mm-dd` strings (week-grid convention).
 */

import {
	addDays,
	addMonths,
	addWeeks,
	parseWeekParam,
	todayISOVietnam,
} from "@/lib/week-grid";

export type ScheduleView = "month" | "week" | "day";

export interface ScheduleViewSearch {
	view: ScheduleView;
	/** Anchor date `yyyy-mm-dd` (any day of its week/month). */
	date: string;
	/**
	 * True when the raw search is NOT canonical (garbage values, the legacy
	 * `?week=` form, or a partial view+date pair) and the caller must rewrite
	 * the URL before rendering state that doesn't match it.
	 */
	scrub: boolean;
}

const SCHEDULE_VIEWS: readonly ScheduleView[] = ["month", "week", "day"];

function parseView(raw: unknown): ScheduleView | null {
	return typeof raw === "string" && SCHEDULE_VIEWS.includes(raw as ScheduleView)
		? (raw as ScheduleView)
		: null;
}

const isPresent = (raw: Record<string, unknown>, key: string): boolean =>
	raw[key] !== undefined && raw[key] !== null;

/**
 * `?view=&date=` (new) / `?week=` (legacy) → the effective view triple.
 * Defaults: week + today (Vietnam clock). `scrub` is false only for a fully
 * canonical search — valid `view` + valid `date`, or no params at all.
 */
export function parseScheduleSearch(
	raw: Record<string, unknown>,
	now: Date = new Date(),
): ScheduleViewSearch {
	const view = parseView(raw.view);
	const date = parseWeekParam(raw.date);

	if (view && date) return { view, date, scrub: false };

	// Legacy pre-TOS-14 links carry only `?week=` — a date in the week
	// namespace; honored when neither new param yields a usable value.
	if (!view && !date) {
		const legacy = parseWeekParam(raw.week);
		if (legacy) return { view: "week", date: legacy, scrub: true };
	}

	return {
		view: view ?? "week",
		date: date ?? todayISOVietnam(now),
		scrub:
			isPresent(raw, "view") ||
			isPresent(raw, "date") ||
			isPresent(raw, "week"),
	};
}

/** Anchor date after stepping `delta` units of the view (month → calendar
 * months, week → weeks, day → days). Stands still at the 1970–2099 bounds. */
export function shiftAnchor(
	view: ScheduleView,
	date: string,
	delta: number,
): string {
	if (view === "month") return addMonths(date, delta);
	if (view === "day") return addDays(date, delta);
	return addWeeks(date, delta);
}
