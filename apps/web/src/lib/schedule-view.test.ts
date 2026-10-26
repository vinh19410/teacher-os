import { describe, expect, it } from "vitest";

import { parseScheduleSearch, shiftAnchor } from "./schedule-view";

// Vietnam-clock pin: 18:30Z on Aug 21 = Aug 22 in Vietnam (UTC+7 drift guard).
const NOW = new Date("2026-08-21T18:30:00Z");

describe("parseScheduleSearch", () => {
	it("passes a canonical view+date through untouched", () => {
		expect(
			parseScheduleSearch({ view: "month", date: "2026-11-15" }, NOW),
		).toEqual({
			view: "month",
			date: "2026-11-15",
			scrub: false,
		});
		expect(
			parseScheduleSearch({ view: "day", date: "2026-08-22" }, NOW),
		).toEqual({ view: "day", date: "2026-08-22", scrub: false });
		expect(
			parseScheduleSearch({ view: "week", date: "2026-10-26" }, NOW),
		).toEqual({ view: "week", date: "2026-10-26", scrub: false });
	});

	it("maps the legacy ?week= link to the week view with a scrub", () => {
		expect(parseScheduleSearch({ week: "2026-10-26" }, NOW)).toEqual({
			view: "week",
			date: "2026-10-26",
			scrub: true,
		});
	});

	it("honors the legacy week only when view AND date are unusable", () => {
		expect(
			parseScheduleSearch(
				{ view: "day", date: "2026-11-15", week: "2026-08-03" },
				NOW,
			),
		).toEqual({ view: "day", date: "2026-11-15", scrub: false });
	});

	it("defaults to the current Vietnam week with no params (no scrub)", () => {
		expect(parseScheduleSearch({}, NOW)).toEqual({
			view: "week",
			date: "2026-08-22",
			scrub: false,
		});
	});

	it("resets a garbage view to the default week with a scrub", () => {
		expect(parseScheduleSearch({ view: "junk" }, NOW)).toEqual({
			view: "week",
			date: "2026-08-22",
			scrub: true,
		});
		// A valid date survives a garbage view — the fallback keeps what parses.
		expect(
			parseScheduleSearch({ view: "junk", date: "2026-10-26" }, NOW),
		).toEqual({ view: "week", date: "2026-10-26", scrub: true });
	});

	it("resets a garbage/impossible/out-of-domain date, keeping the view", () => {
		expect(
			parseScheduleSearch({ view: "month", date: "2026-02-30" }, NOW),
		).toEqual({ view: "month", date: "2026-08-22", scrub: true });
		expect(
			parseScheduleSearch({ view: "month", date: "not-a-date" }, NOW),
		).toEqual({ view: "month", date: "2026-08-22", scrub: true });
		expect(parseScheduleSearch({ date: "0001-01-01" }, NOW)).toEqual({
			view: "week",
			date: "2026-08-22",
			scrub: true,
		});
	});

	it("defaults the missing half of a partial search and flags the scrub", () => {
		expect(parseScheduleSearch({ view: "day" }, NOW)).toEqual({
			view: "day",
			date: "2026-08-22",
			scrub: true,
		});
		expect(parseScheduleSearch({ date: "2026-10-26" }, NOW)).toEqual({
			view: "week",
			date: "2026-10-26",
			scrub: true,
		});
	});

	it("coerces non-string values to the default with a scrub", () => {
		expect(parseScheduleSearch({ view: 42, date: 20260821 }, NOW)).toEqual({
			view: "week",
			date: "2026-08-22",
			scrub: true,
		});
	});
});

describe("shiftAnchor", () => {
	it("steps by the unit of the view (month/week/day)", () => {
		expect(shiftAnchor("month", "2026-11-15", 1)).toBe("2026-12-15");
		expect(shiftAnchor("month", "2026-11-15", -1)).toBe("2026-10-15");
		expect(shiftAnchor("week", "2026-11-15", 1)).toBe("2026-11-22");
		expect(shiftAnchor("week", "2026-11-15", -1)).toBe("2026-11-08");
		expect(shiftAnchor("day", "2026-10-31", 1)).toBe("2026-11-01");
		expect(shiftAnchor("day", "2026-11-01", -1)).toBe("2026-10-31");
		expect(shiftAnchor("week", "2026-11-15", 0)).toBe("2026-11-15");
	});

	it("clamps month steps with short-day months", () => {
		expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
	});

	it("stands still at the supported year bounds", () => {
		expect(shiftAnchor("month", "2099-12-15", 1)).toBe("2099-12-15");
		expect(shiftAnchor("day", "1970-01-01", -1)).toBe("1970-01-01");
	});
});
