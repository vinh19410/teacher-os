import { describe, expect, it } from "vitest";

import {
	addDays,
	addMonths,
	addWeeks,
	formatDayLabel,
	formatDayMonth,
	formatMonthLabel,
	formatWeekRange,
	isoDayNumber,
	isSameISOWeek,
	monthGridDates,
	parseWeekParam,
	resolveWeek,
	startOfMonth,
	startOfWeekMonday,
	todayISOVietnam,
	weekDates,
} from "@/lib/week-grid";

describe("todayISOVietnam", () => {
	it("returns the Vietnam calendar date for a UTC clock that crossed midnight in VN", () => {
		// 18:30Z = 01:30 next day at UTC+7 — pins the UTC-drift guard.
		expect(todayISOVietnam(new Date("2026-08-21T18:30:00Z"))).toBe(
			"2026-08-22",
		);
	});

	it("returns the same calendar date while VN has not crossed midnight", () => {
		expect(todayISOVietnam(new Date("2026-08-21T10:00:00Z"))).toBe(
			"2026-08-21",
		);
	});
});

describe("parseWeekParam", () => {
	it("accepts a valid ISO date (any day of the week)", () => {
		expect(parseWeekParam("2026-08-21")).toBe("2026-08-21");
	});

	it("rejects garbage, non-padded, impossible dates, numbers, and out-of-bound years", () => {
		expect(parseWeekParam(undefined)).toBeNull();
		expect(parseWeekParam("abc")).toBeNull();
		expect(parseWeekParam("2026-8-1")).toBeNull();
		expect(parseWeekParam("2026-02-30")).toBeNull();
		expect(parseWeekParam("2026-13-01")).toBeNull();
		expect(parseWeekParam(20260821)).toBeNull();
		// Year bounds (1970–2099) — expanded-year guard for nav at the edges.
		expect(parseWeekParam("9999-12-31")).toBeNull();
		expect(parseWeekParam("0001-01-01")).toBeNull();
	});
});

describe("startOfWeekMonday", () => {
	it("maps a mid-week date to its Monday (Mon-first)", () => {
		expect(startOfWeekMonday("2026-08-21")).toBe("2026-08-17"); // Friday
	});

	it("maps a Sunday to the PREVIOUS week's Monday (Mon-first pin)", () => {
		expect(startOfWeekMonday("2026-08-16")).toBe("2026-08-10");
	});

	it("keeps a Monday as-is", () => {
		expect(startOfWeekMonday("2026-08-17")).toBe("2026-08-17");
	});
});

describe("addWeeks", () => {
	it("adds and subtracts whole weeks across month boundaries", () => {
		expect(addWeeks("2026-08-17", 1)).toBe("2026-08-24");
		expect(addWeeks("2026-08-17", -1)).toBe("2026-08-10");
		expect(addWeeks("2026-08-17", 0)).toBe("2026-08-17");
		expect(addWeeks("2026-08-31", 1)).toBe("2026-09-07");
	});

	it("guards the output against expanded-year garbage at the extreme edge", () => {
		// Without the guard, 9999-12-31 + 7d serializes as "+010000-01-07".
		expect(addWeeks("9999-12-31", 1)).toBe("9999-12-31");
	});

	it("stands still at the supported year bounds instead of bouncing back", () => {
		// 2099-12-28 + 1 week = 2100-01-04: format-valid but outside the
		// parser's 1970–2099 range — writing it to the URL would get scrubbed
		// back to the current week. Nav must stay put instead.
		expect(addWeeks("2099-12-28", 1)).toBe("2099-12-28");
		expect(addWeeks("1970-01-05", -1)).toBe("1970-01-05");
	});
});

describe("weekDates", () => {
	it("returns the 7 ISO dates Monday→Sunday for a week-start", () => {
		expect(weekDates("2026-08-17")).toEqual([
			"2026-08-17",
			"2026-08-18",
			"2026-08-19",
			"2026-08-20",
			"2026-08-21",
			"2026-08-22",
			"2026-08-23",
		]);
	});

	it("normalizes a mid-week input to the same week", () => {
		expect(weekDates("2026-08-20")).toEqual(weekDates("2026-08-17"));
	});

	it("crosses month boundaries (week of 31/08)", () => {
		expect(weekDates("2026-08-31")).toEqual([
			"2026-08-31",
			"2026-09-01",
			"2026-09-02",
			"2026-09-03",
			"2026-09-04",
			"2026-09-05",
			"2026-09-06",
		]);
	});

	it("crosses year boundaries (week of 28/12/2026)", () => {
		expect(weekDates("2026-12-28")).toEqual([
			"2026-12-28",
			"2026-12-29",
			"2026-12-30",
			"2026-12-31",
			"2027-01-01",
			"2027-01-02",
			"2027-01-03",
		]);
	});

	it("includes Feb 29 in a leap-year week", () => {
		expect(weekDates("2028-02-28")[1]).toBe("2028-02-29");
	});
});

describe("isSameISOWeek", () => {
	it("treats Friday and Sunday of one week as the same week", () => {
		expect(isSameISOWeek("2026-08-21", "2026-08-23")).toBe(true);
	});

	it("treats an old Sunday and a new Monday as different weeks", () => {
		expect(isSameISOWeek("2026-08-16", "2026-08-17")).toBe(false);
	});
});

describe("formatDayMonth", () => {
	it("formats dd/MM with zero padding", () => {
		expect(formatDayMonth("2026-08-21")).toBe("21/08");
		expect(formatDayMonth("2026-12-03")).toBe("03/12");
	});
});

describe("formatWeekRange", () => {
	it("formats a same-month week with an en-dash", () => {
		expect(formatWeekRange("2026-08-17")).toBe("17–23/08");
	});

	it("formats a cross-month week with both months", () => {
		expect(formatWeekRange("2026-08-31")).toBe("31/08–06/09");
	});

	it("formats a cross-year week", () => {
		expect(formatWeekRange("2026-12-28")).toBe("28/12–03/01");
	});
});

describe("resolveWeek", () => {
	it("resolves a valid param to that week", () => {
		const resolved = resolveWeek(
			"2026-08-20",
			new Date("2026-08-21T10:00:00Z"),
		);
		expect(resolved.weekStart).toBe("2026-08-17");
		expect(resolved.dates).toHaveLength(7);
		expect(resolved.dates[0]).toBe("2026-08-17");
		expect(resolved.isCurrentWeek).toBe(true);
	});

	it("falls back to the current (Vietnam) week on garbage params", () => {
		const resolved = resolveWeek("abc", new Date("2026-08-21T10:00:00Z"));
		expect(resolved.weekStart).toBe("2026-08-17");
		expect(resolved.isCurrentWeek).toBe(true);
	});

	it("falls back on missing params", () => {
		const resolved = resolveWeek(undefined, new Date("2026-08-21T10:00:00Z"));
		expect(resolved.weekStart).toBe("2026-08-17");
	});

	it("marks a non-current week via the Vietnam clock", () => {
		const resolved = resolveWeek(
			"2026-01-06",
			new Date("2026-08-21T10:00:00Z"),
		);
		expect(resolved.weekStart).toBe("2026-01-05");
		expect(resolved.isCurrentWeek).toBe(false);
	});

	it("uses the Vietnam date when the UTC clock crossed the VN midnight", () => {
		// 18:30Z on Sunday Aug 23 = Monday Aug 24 in Vietnam → current week is
		// Aug 24–30. A raw-UTC implementation would resolve Sunday's week
		// (Aug 17–23) — this pins the drift guard.
		const resolved = resolveWeek(undefined, new Date("2026-08-23T18:30:00Z"));
		expect(resolved.weekStart).toBe("2026-08-24");
		expect(resolved.isCurrentWeek).toBe(true);
	});
});

describe("startOfMonth", () => {
	it("maps a mid-month date to the 1st", () => {
		expect(startOfMonth("2026-11-15")).toBe("2026-11-01");
	});

	it("keeps the 1st as-is", () => {
		expect(startOfMonth("2026-01-01")).toBe("2026-01-01");
	});
});

describe("addMonths", () => {
	it("shifts calendar months across year boundaries", () => {
		expect(addMonths("2026-11-15", 1)).toBe("2026-12-15");
		expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
		expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
		expect(addMonths("2026-11-15", 0)).toBe("2026-11-15");
	});

	it("clamps the day to the target month length", () => {
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
	});

	it("handles the leap day (2028-02-29)", () => {
		expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
		expect(addMonths("2028-02-29", 1)).toBe("2028-03-29");
		expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
	});

	it("stands still at the supported year bounds (nav edge guard)", () => {
		expect(addMonths("2099-12-05", 1)).toBe("2099-12-05");
		expect(addMonths("1970-01-05", -1)).toBe("1970-01-05");
	});
});

describe("addDays", () => {
	it("crosses month and year boundaries", () => {
		expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
		expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
	});

	it("steps through the leap day", () => {
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
		expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
	});

	it("stands still at the supported year bounds (nav edge guard)", () => {
		expect(addDays("2099-12-31", 1)).toBe("2099-12-31");
		expect(addDays("1970-01-01", -1)).toBe("1970-01-01");
	});
});

describe("isoDayNumber", () => {
	it("returns the 1-7 Monday-first day number (lesson.day convention)", () => {
		expect(isoDayNumber("2026-10-26")).toBe(1); // Monday
		expect(isoDayNumber("2026-10-30")).toBe(5); // Friday
		expect(isoDayNumber("2026-10-25")).toBe(7); // Sunday
		expect(isoDayNumber("2026-11-01")).toBe(7); // Sunday
	});
});

describe("monthGridDates", () => {
	it("returns 42 Monday-first dates for the anchor's month", () => {
		const grid = monthGridDates("2026-11-15");
		expect(grid).toHaveLength(42);
		expect(grid[0]).toBe("2026-10-26"); // Monday on/before Nov 1 (Sunday)
		expect(grid[6]).toBe("2026-11-01");
		expect(grid[41]).toBe("2026-12-06");
	});

	it("normalizes any day of the month to the same grid", () => {
		expect(monthGridDates("2026-11-01")).toEqual(monthGridDates("2026-11-30"));
	});

	it("includes Feb 29 in a leap-year grid (starts Mon 2028-01-31)", () => {
		const grid = monthGridDates("2028-02-10");
		expect(grid[0]).toBe("2028-01-31");
		expect(grid).toContain("2028-02-29");
		expect(grid[41]).toBe("2028-03-12");
	});

	it("covers a 6-calendar-week span for a Sunday-starting 30-day month", () => {
		// Nov 2026 starts Sunday → grid Oct 26 … Dec 6 spans 6 weeks.
		const grid = monthGridDates("2026-11-15");
		expect(grid[34]).toBe("2026-11-29"); // Sunday of week 5, not the end
		expect(grid[41]).toBe("2026-12-06");
	});

	it("keeps the ISO-week-53 edge inside the grid (Dec 2026 → Jan 2027)", () => {
		const grid = monthGridDates("2026-12-15");
		expect(grid[0]).toBe("2026-11-30");
		expect(grid[41]).toBe("2027-01-10");
	});
});

describe("formatMonthLabel", () => {
	it("formats `Tháng M · YYYY` with an unpadded month", () => {
		expect(formatMonthLabel("2026-11-15")).toBe("Tháng 11 · 2026");
		expect(formatMonthLabel("2026-03-02")).toBe("Tháng 3 · 2026");
	});
});

describe("formatDayLabel", () => {
	it("formats the full Vietnamese weekday + dd/MM", () => {
		expect(formatDayLabel("2026-10-26")).toBe("Thứ Hai 26/10");
		expect(formatDayLabel("2026-10-25")).toBe("Chủ Nhật 25/10");
		expect(formatDayLabel("2026-11-01")).toBe("Chủ Nhật 01/11");
		expect(formatDayLabel("2026-11-15")).toBe("Chủ Nhật 15/11");
	});
});
