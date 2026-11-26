import { describe, expect, test } from "vitest";
import {
	buildDashboardCalendarIndex,
	formatAgendaDateLabel,
	formatMonthHeading,
	MAX_CALENDAR_YM,
	MIN_CALENDAR_YM,
	monthCalendarGrid,
	sessionsForDashboardDate,
	shiftCalendarMonth,
} from "./dashboard-calendar";
import type { ClassGroup, Lesson } from "./mock-data";

function cls(
	id: string,
	overrides: Partial<
		Pick<ClassGroup, "status" | "schedule" | "startDate" | "sessionsTotal">
	> = {},
): Pick<
	ClassGroup,
	"id" | "status" | "schedule" | "startDate" | "sessionsTotal"
> {
	return {
		id,
		status: "active",
		schedule: '{"days":[2],"start":"19:00","end":"20:30"}',
		startDate: "2026-10-01",
		sessionsTotal: 8,
		...overrides,
	};
}

function lesson(
	partial: Pick<Lesson, "id" | "sid" | "day"> & Partial<Lesson>,
): Lesson {
	return {
		classId: "cl-1",
		time: "19:00",
		dur: 90,
		date: null,
		type: "1:1",
		status: "upcoming",
		attendance: null,
		attendanceNote: null,
		topic: "T",
		zoom: "",
		...partial,
	};
}

describe("buildDashboardCalendarIndex & sessionsForDashboardDate", () => {
	test("dated multi-week rows appear only on their exact Vietnam ISO dates", () => {
		const classes = [cls("cl-1")];
		const lessons = [
			lesson({
				id: "l1",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "19:00",
			}),
			lesson({
				id: "l2",
				sid: "s1",
				day: 3,
				date: "2026-10-14",
				time: "19:00",
			}),
			lesson({
				id: "l3",
				sid: "s1",
				day: 3,
				date: "2026-10-21",
				time: "19:00",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-1", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-14")).toEqual([
			{ classId: "cl-1", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-21")).toEqual([
			{ classId: "cl-1", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-28")).toEqual([]);
	});

	test("keeps two different times for the same class on the same date, sorted by minutes, and deduplicates 9:00 vs 09:00", () => {
		const classes = [cls("cl-1")];
		const lessons = [
			lesson({
				id: "l-pm",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "14:00",
			}),
			lesson({
				id: "l-am1",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "9:00",
			}),
			lesson({
				id: "l-am2",
				sid: "s2",
				day: 3,
				date: "2026-10-07",
				time: "09:00",
			}),
			lesson({
				id: "l-pm2",
				sid: "s2",
				day: 3,
				date: "2026-10-07",
				time: " 14:00 ",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-1", time: "9:00", dur: 90 },
			{ classId: "cl-1", time: "14:00", dur: 90 },
		]);
	});

	test("deduplicates multi-student slots, keeps mixed cancelled+upcoming, drops all-cancelled or all-holiday", () => {
		const classes = [cls("cl-1"), cls("cl-2"), cls("cl-3")];
		const lessons = [
			// 1:2 class where one student is cancelled and one is upcoming → keep 1 session.
			lesson({
				id: "m1",
				classId: "cl-1",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "18:00",
				status: "cancelled",
			}),
			lesson({
				id: "m2",
				classId: "cl-1",
				sid: "s2",
				day: 3,
				date: "2026-10-07",
				time: "18:00",
				status: "upcoming",
			}),
			// All cancelled → drop.
			lesson({
				id: "c1",
				classId: "cl-2",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "19:00",
				status: "cancelled",
			}),
			// All holiday → drop.
			lesson({
				id: "h1",
				classId: "cl-3",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "20:00",
				status: "holiday",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-1", time: "18:00", dur: 90 },
		]);
	});

	test("uses fail-closed active class allowlist: excludes paused classes (including completed/absent history) and orphan classIds", () => {
		const classes = [
			cls("cl-active", { status: "active" }),
			cls("cl-paused", { status: "paused" }),
		];
		const lessons = [
			lesson({
				id: "p-completed",
				classId: "cl-paused",
				sid: "s1",
				day: 1,
				date: "2026-10-05",
				time: "08:00",
				status: "completed",
			}),
			lesson({
				id: "p-absent",
				classId: "cl-paused",
				sid: "s1",
				day: 2,
				date: "2026-10-06",
				time: "08:00",
				status: "absent",
			}),
			lesson({
				id: "p-upcoming",
				classId: "cl-paused",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "08:00",
				status: "upcoming",
			}),
			lesson({
				id: "p-legacy",
				classId: "cl-paused",
				sid: "s1",
				day: 4,
				date: null,
				time: "08:00",
				status: "upcoming",
			}),
			lesson({
				id: "orphan-dated",
				classId: "cl-missing",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "10:00",
				status: "upcoming",
			}),
			lesson({
				id: "orphan-undated",
				classId: "cl-missing",
				sid: "s1",
				day: 3,
				date: null,
				time: "11:00",
				status: "upcoming",
			}),
			lesson({
				id: "active-ok",
				classId: "cl-active",
				sid: "s1",
				day: 3,
				date: "2026-10-07",
				time: "19:00",
				status: "upcoming",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-05")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-06")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-08")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-active", time: "19:00", dur: 90 },
		]);
	});

	test("legacy undated structured class resolves finite dates via buildClassSessions, strips holiday before walk, and never leaks into future months", () => {
		// days: [0, 2] = Monday (day=1) & Wednesday (day=3), starting Monday 2026-10-05.
		const classes = [
			cls("cl-leg", {
				schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
				startDate: "2026-10-05",
				sessionsTotal: 4,
			}),
		];
		const lessons = [
			// Monday slot (day=1): completed then cancelled → 2026-10-05 kept, 2026-10-12 dropped.
			lesson({
				id: "mon-1",
				classId: "cl-leg",
				sid: "s1",
				day: 1,
				date: null,
				time: "19:00",
				status: "completed",
			}),
			lesson({
				id: "mon-2",
				classId: "cl-leg",
				sid: "s1",
				day: 1,
				date: "",
				time: "19:00",
				status: "cancelled",
			}),
			// Wednesday slot (day=3): completed, upcoming, holiday → holiday excluded before walk,
			// so only 2026-10-07 & 2026-10-14 exist; 2026-10-21 must NOT appear.
			lesson({
				id: "wed-1",
				classId: "cl-leg",
				sid: "s1",
				day: 3,
				date: null,
				time: "19:00",
				status: "completed",
			}),
			lesson({
				id: "wed-2",
				classId: "cl-leg",
				sid: "s1",
				day: 3,
				date: null,
				time: "19:00",
				status: "upcoming",
			}),
			lesson({
				id: "wed-hol",
				classId: "cl-leg",
				sid: "s1",
				day: 3,
				date: null,
				time: "19:00",
				status: "holiday",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-05")).toEqual([
			{ classId: "cl-leg", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-12")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-leg", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-14")).toEqual([
			{ classId: "cl-leg", time: "19:00", dur: 90 },
		]);
		expect(sessionsForDashboardDate(index, "2026-10-21")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-19")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-11-02")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-11-04")).toEqual([]);
	});

	test("all-holiday legacy structured class produces zero sessions (does not fall into projectClassSessions)", () => {
		const classes = [
			cls("cl-hol", {
				schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
				startDate: "2026-10-05",
				sessionsTotal: 4,
			}),
		];
		const lessons = [
			lesson({
				id: "h1",
				classId: "cl-hol",
				sid: "s1",
				day: 1,
				date: null,
				time: "19:00",
				status: "holiday",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		expect(sessionsForDashboardDate(index, "2026-10-05")).toEqual([]);
		expect(sessionsForDashboardDate(index, "2026-10-12")).toEqual([]);
	});

	test("unresolved legacy classes (free-text schedule, non-ISO startDate, malformed date, invalid day) and mixed dated+undated classes behave safely", () => {
		const classes = [
			cls("cl-free", { schedule: "T3 19:00", startDate: "01/08" }),
			cls("cl-mixed", {
				schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
				startDate: "2026-10-05",
				sessionsTotal: 4,
			}),
		];
		const lessons = [
			// Free-text class with null & empty dates + cancelled/holiday + invalid day values.
			lesson({
				id: "f1",
				classId: "cl-free",
				sid: "s1",
				day: 2,
				date: null,
				time: "19:00",
				status: "upcoming",
			}),
			lesson({
				id: "f2",
				classId: "cl-free",
				sid: "s2",
				day: 2,
				date: "",
				time: "19:00",
				status: "upcoming",
			}),
			lesson({
				id: "f-cx",
				classId: "cl-free",
				sid: "s1",
				day: 2,
				date: null,
				time: "20:00",
				status: "cancelled",
			}),
			lesson({
				id: "f-malformed",
				classId: "cl-free",
				sid: "s1",
				day: 4,
				date: "2026-02-30",
				time: "18:00",
				status: "upcoming",
			}),
			lesson({
				id: "f-bad-day-0",
				classId: "cl-free",
				sid: "s1",
				day: 0,
				date: null,
				time: "17:00",
				status: "upcoming",
			}),
			lesson({
				id: "f-bad-day-8",
				classId: "cl-free",
				sid: "s1",
				day: 8,
				date: null,
				time: "17:00",
				status: "upcoming",
			}),
			// Mixed dated + undated class: undated subset must NOT run buildClassSessions from startDate.
			lesson({
				id: "mx-dated",
				classId: "cl-mixed",
				sid: "s1",
				day: 1,
				date: "2026-10-05",
				time: "19:00",
				status: "upcoming",
			}),
			lesson({
				id: "mx-undated",
				classId: "cl-mixed",
				sid: "s1",
				day: 3,
				date: null,
				time: "19:00",
				status: "upcoming",
			}),
			// Duplicate (classId, normalizedTime) across dated & legacy on same Wednesday.
			lesson({
				id: "mx-dated-wed",
				classId: "cl-mixed",
				sid: "s2",
				day: 3,
				date: "2026-10-07",
				time: "19:00",
				status: "upcoming",
			}),
			// Separate Wednesday with both a dated morning slot ("9:00") and legacy evening slot ("19:00").
			lesson({
				id: "mx-dated-wed-morning",
				classId: "cl-mixed",
				sid: "s3",
				day: 3,
				date: "2026-10-21",
				time: "9:00",
				status: "upcoming",
			}),
		];
		const index = buildDashboardCalendarIndex(lessons, classes);
		// Tuesday 2026-10-06 matches cl-free (day 2), deduped.
		expect(sessionsForDashboardDate(index, "2026-10-06")).toEqual([
			{ classId: "cl-free", time: "19:00", dur: 90 },
		]);
		// Thursday 2026-10-08 matches malformed date row (day 4).
		expect(sessionsForDashboardDate(index, "2026-10-08")).toEqual([
			{ classId: "cl-free", time: "18:00", dur: 90 },
		]);
		// Monday 2026-10-05 has only dated row for cl-mixed.
		expect(sessionsForDashboardDate(index, "2026-10-05")).toEqual([
			{ classId: "cl-mixed", time: "19:00", dur: 90 },
		]);
		// Wednesday 2026-10-07 deduplicates dated + undated (same classId & time).
		expect(sessionsForDashboardDate(index, "2026-10-07")).toEqual([
			{ classId: "cl-mixed", time: "19:00", dur: 90 },
		]);
		// Another Wednesday (2026-10-14) with no dated rows still receives mx-undated via legacyByWeekday,
		// proving the mixed class bypassed buildClassSessions instead of anchoring to startDate.
		expect(sessionsForDashboardDate(index, "2026-10-14")).toEqual([
			{ classId: "cl-mixed", time: "19:00", dur: 90 },
		]);
		// Wednesday 2026-10-21 merges dated ("9:00") and legacy ("19:00") buckets sorted by minutes.
		expect(sessionsForDashboardDate(index, "2026-10-21")).toEqual([
			{ classId: "cl-mixed", time: "9:00", dur: 90 },
			{ classId: "cl-mixed", time: "19:00", dur: 90 },
		]);
		// Invalid dateIso returns empty safely.
		expect(sessionsForDashboardDate(index, "not-a-date")).toEqual([]);
	});
});

describe("monthCalendarGrid, shiftCalendarMonth, formatMonthHeading, formatAgendaDateLabel", () => {
	test("builds Monday-first grid with exact leadingBlanks, weekend flags, and leap years", () => {
		// 2026-11-01 is Sunday → 6 leading blanks (Mon..Sat), 30 days.
		const nov2026 = monthCalendarGrid("2026-11");
		expect(nov2026.ym).toBe("2026-11");
		expect(nov2026.leadingBlanks).toBe(6);
		expect(nov2026.days).toHaveLength(30);
		expect(nov2026.days[0]).toEqual({
			iso: "2026-11-01",
			day: 1,
			isWeekend: true,
		});
		expect(nov2026.days[1]).toEqual({
			iso: "2026-11-02",
			day: 2,
			isWeekend: false,
		});
		expect(nov2026.days[6]).toEqual({
			iso: "2026-11-07",
			day: 7,
			isWeekend: true,
		});

		// 2026-06-01 is Monday → 0 leading blanks, 30 days, Sat/Sun at indices 5 & 6.
		const jun2026 = monthCalendarGrid("2026-06");
		expect(jun2026.leadingBlanks).toBe(0);
		expect(jun2026.days).toHaveLength(30);
		expect(jun2026.days[0]).toEqual({
			iso: "2026-06-01",
			day: 1,
			isWeekend: false,
		});
		expect(jun2026.days[5]?.isWeekend).toBe(true);
		expect(jun2026.days[6]?.isWeekend).toBe(true);

		// Leap year vs non-leap year February.
		expect(monthCalendarGrid("2024-02").days).toHaveLength(29);
		expect(monthCalendarGrid("2026-02").days).toHaveLength(28);
	});

	test("shifts months across year boundaries and stands still outside 1970-01..2099-12", () => {
		expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
		expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
		expect(shiftCalendarMonth(MIN_CALENDAR_YM, -1)).toBe(MIN_CALENDAR_YM);
		expect(shiftCalendarMonth(MAX_CALENDAR_YM, 1)).toBe(MAX_CALENDAR_YM);
		expect(shiftCalendarMonth("1970-02", -5)).toBe("1970-02");
	});

	test("guards invalid inputs without throwing RangeError or emitting Thứ NaN", () => {
		expect(shiftCalendarMonth("invalid", 1)).toBe("invalid");
		expect(shiftCalendarMonth("2026-10", Number.NaN)).toBe("2026-10");
		expect(shiftCalendarMonth("2026-10", 1.5)).toBe("2026-10");
		expect(shiftCalendarMonth("2026-10", 1e308)).toBe("2026-10");

		expect(monthCalendarGrid("2026-13")).toEqual({
			ym: "2026-13",
			leadingBlanks: 0,
			days: [],
		});
		expect(monthCalendarGrid("bad")).toEqual({
			ym: "bad",
			leadingBlanks: 0,
			days: [],
		});

		expect(formatMonthHeading("2026-11")).toBe("Tháng 11 năm 2026");
		expect(formatMonthHeading("2026-01")).toBe("Tháng 1 năm 2026");
		expect(formatMonthHeading("invalid")).toBe("");

		expect(formatAgendaDateLabel("2026-10-07", "2026-10-07")).toBe("Hôm nay");
		expect(formatAgendaDateLabel("2026-10-08", "2026-10-07")).toBe("Thứ Năm");
		expect(formatAgendaDateLabel("", "2026-10-07")).toBe("");
		expect(formatAgendaDateLabel("2026-02-30", "2026-10-07")).toBe("");
	});
});
