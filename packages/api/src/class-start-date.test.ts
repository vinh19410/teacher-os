import { describe, expect, test } from "vitest";
import {
	chunkDateMappings,
	DATE_ONLY_REMAP_CHUNK,
	evaluateClassStartDateEditability,
	LESSON_REMAP_CHUNK,
	planUnstartedStartDateShift,
	SHIFT_DATE_PREFIX,
	topologicalUnwindShifts,
} from "./class-start-date";

const TUE_THU_SCHEDULE = JSON.stringify({
	days: [1, 3],
	start: "19:00",
	end: "20:30",
});

describe("evaluateClassStartDateEditability", () => {
	test("allows editing when class has zero lessons", () => {
		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 12,
				isManual: false,
				lessons: [],
			}),
		).toEqual({ editable: true, reason: null });
	});

	test("allows editing unstarted auto class with upcoming dated lessons regardless of calendar date", () => {
		const res = evaluateClassStartDateEditability({
			schedule: TUE_THU_SCHEDULE,
			sessionsTotal: 2,
			isManual: false,
			lessons: [
				{
					date: "2025-01-07",
					status: "upcoming",
					enrollmentKey: "enr-1",
					attendance: null,
					attendanceNote: null,
				},
				{
					date: "2025-01-09",
					status: "upcoming",
					enrollmentKey: "enr-1",
					attendance: null,
					attendanceNote: null,
				},
				{
					date: "2025-01-07",
					status: "upcoming",
					enrollmentKey: "enr-2",
					attendance: null,
					attendanceNote: null,
				},
				{
					date: "2025-01-09",
					status: "upcoming",
					enrollmentKey: "enr-2",
					attendance: null,
					attendanceNote: null,
				},
			],
		});
		expect(res).toEqual({ editable: true, reason: null });
	});

	test("allows editing auto class with holiday shifts and holiday-cancelled lessons", () => {
		const res = evaluateClassStartDateEditability({
			schedule: TUE_THU_SCHEDULE,
			sessionsTotal: 3,
			isManual: false,
			lessons: [
				{ date: "2026-12-01", status: "holiday", enrollmentKey: "enr-1" },
				{ date: "2026-12-03", status: "cancelled", enrollmentKey: "enr-1" },
				{ date: "2026-12-08", status: "upcoming", enrollmentKey: "enr-1" },
				{ date: "2026-12-10", status: "cancelled", enrollmentKey: "enr-1" },
			],
			holidayShifts: [{ originalDate: "2026-12-01", makeupDate: "2026-12-10" }],
			holidayCancelDates: ["2026-12-03", "2026-12-10"],
		});
		expect(res).toEqual({ editable: true, reason: null });
	});

	test("locks class when any lesson is completed, absent, has attendance, has attendanceNote, or is manually cancelled", () => {
		const base = {
			schedule: TUE_THU_SCHEDULE,
			sessionsTotal: 2,
			isManual: false,
		};

		expect(
			evaluateClassStartDateEditability({
				...base,
				lessons: [
					{ date: "2026-12-01", status: "completed", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "class-started" });

		expect(
			evaluateClassStartDateEditability({
				...base,
				lessons: [
					{ date: "2026-12-01", status: "absent", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "class-started" });

		expect(
			evaluateClassStartDateEditability({
				...base,
				lessons: [
					{
						date: "2026-12-01",
						status: "upcoming",
						enrollmentKey: "e1",
						attendance: "present",
					},
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "class-started" });

		expect(
			evaluateClassStartDateEditability({
				...base,
				lessons: [
					{
						date: "2026-12-01",
						status: "upcoming",
						enrollmentKey: "e1",
						attendanceNote: "Đến muộn 10 phút",
					},
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "class-started" });

		expect(
			evaluateClassStartDateEditability({
				...base,
				lessons: [
					{ date: "2026-12-01", status: "cancelled", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
				holidayCancelDates: [],
			}),
		).toEqual({ editable: false, reason: "class-started" });
	});

	test("allows unstarted manual class even without structured schedule and locks once started", () => {
		expect(
			evaluateClassStartDateEditability({
				schedule: "",
				sessionsTotal: 2,
				isManual: true,
				lessons: [
					{ date: "2026-12-01", status: "upcoming", enrollmentKey: "e1" },
					{ date: "2026-12-05", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: true, reason: null });

		expect(
			evaluateClassStartDateEditability({
				schedule: "",
				sessionsTotal: 2,
				isManual: true,
				lessons: [
					{ date: "2026-12-01", status: "completed", enrollmentKey: "e1" },
					{ date: "2026-12-05", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "class-started" });
	});

	test("locks legacy undated lessons and invalid or diverged auto schedules", () => {
		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 1,
				isManual: false,
				lessons: [{ date: null, status: "upcoming", enrollmentKey: "e1" }],
			}),
		).toEqual({ editable: false, reason: "legacy-undated" });

		expect(
			evaluateClassStartDateEditability({
				schedule: "T3 & T5 19:00",
				sessionsTotal: 1,
				isManual: false,
				lessons: [
					{ date: "2026-12-01", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "invalid-schedule" });

		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 53,
				isManual: false,
				lessons: [
					{ date: "2026-12-01", status: "upcoming", enrollmentKey: "e1" },
				],
			}),
		).toEqual({ editable: false, reason: "invalid-schedule" });

		// Orphan holiday row not tracked by holidayShifts
		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 2,
				isManual: false,
				lessons: [
					{ date: "2026-12-01", status: "holiday", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
				],
				holidayShifts: [],
			}),
		).toEqual({ editable: false, reason: "invalid-schedule" });

		// Diverged enrollments after moveDate + later enrollment activation
		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 2,
				isManual: false,
				lessons: [
					{ date: "2026-12-02", status: "upcoming", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e1" },
					{ date: "2026-12-01", status: "upcoming", enrollmentKey: "e2" },
					{ date: "2026-12-03", status: "upcoming", enrollmentKey: "e2" },
				],
			}),
		).toEqual({ editable: false, reason: "invalid-schedule" });

		// Cycle in holidayShifts
		expect(
			evaluateClassStartDateEditability({
				schedule: TUE_THU_SCHEDULE,
				sessionsTotal: 2,
				isManual: false,
				lessons: [
					{ date: "2026-12-01", status: "holiday", enrollmentKey: "e1" },
					{ date: "2026-12-03", status: "holiday", enrollmentKey: "e1" },
				],
				holidayShifts: [
					{ originalDate: "2026-12-01", makeupDate: "2026-12-03" },
					{ originalDate: "2026-12-03", makeupDate: "2026-12-01" },
				],
			}),
		).toEqual({ editable: false, reason: "invalid-schedule" });
	});
});

describe("topologicalUnwindShifts", () => {
	test("always peels chained shifts from tip to root regardless of input order", () => {
		const aToB = { originalDate: "2026-12-01", makeupDate: "2026-12-15" };
		const bToC = { originalDate: "2026-12-15", makeupDate: "2026-12-17" };
		const cToD = { originalDate: "2026-12-17", makeupDate: "2026-12-22" };

		expect(topologicalUnwindShifts([aToB, bToC, cToD])).toEqual({
			ok: true,
			orderedDesc: [cToD, bToC, aToB],
		});
		expect(topologicalUnwindShifts([bToC, cToD, aToB])).toEqual({
			ok: true,
			orderedDesc: [cToD, bToC, aToB],
		});
	});

	test("detects cycles and fails closed", () => {
		expect(
			topologicalUnwindShifts([
				{ originalDate: "2026-12-01", makeupDate: "2026-12-03" },
				{ originalDate: "2026-12-03", makeupDate: "2026-12-01" },
			]),
		).toEqual({ ok: false });
	});
});

describe("planUnstartedStartDateShift", () => {
	test("maps materialized dates chronologically including overlapping ranges", () => {
		const res = planUnstartedStartDateShift({
			oldSchedule: TUE_THU_SCHEDULE,
			newSchedule: TUE_THU_SCHEDULE,
			oldStartDate: "2026-12-01",
			newStartDate: "2026-12-03",
			oldSessionsTotal: 3,
			newSessionsTotal: 3,
			existingLessonDates: [
				{ date: "2026-12-01", status: "upcoming" },
				{ date: "2026-12-03", status: "upcoming" },
				{ date: "2026-12-08", status: "upcoming" },
			],
			existingShifts: [],
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.mode).toBe("materialized");
		expect(res.mappings).toEqual([
			{ oldDate: "2026-12-01", newDate: "2026-12-03", newDay: 4 },
			{ oldDate: "2026-12-03", newDate: "2026-12-08", newDay: 2 },
			{ oldDate: "2026-12-08", newDate: "2026-12-10", newDay: 4 },
		]);
	});

	test("unwinds chained holiday shifts topologically even when tip makeup is holiday-cancelled", () => {
		const res = planUnstartedStartDateShift({
			oldSchedule: TUE_THU_SCHEDULE,
			newSchedule: TUE_THU_SCHEDULE,
			oldStartDate: "2026-12-01",
			newStartDate: "2026-12-15",
			oldSessionsTotal: 2,
			newSessionsTotal: 2,
			existingLessonDates: [
				{ date: "2026-12-01", status: "holiday" },
				{ date: "2026-12-03", status: "upcoming" },
				{ date: "2026-12-08", status: "holiday" },
				{ date: "2026-12-10", status: "cancelled" },
			],
			existingShifts: [
				{ originalDate: "2026-12-08", makeupDate: "2026-12-10" },
				{ originalDate: "2026-12-01", makeupDate: "2026-12-08" },
			],
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.unwindShiftsDesc).toEqual([
			{ originalDate: "2026-12-08", makeupDate: "2026-12-10" },
			{ originalDate: "2026-12-01", makeupDate: "2026-12-08" },
		]);
		expect(res.oldBaseDates).toEqual(["2026-12-01", "2026-12-03"]);
		expect(res.newBaseDates).toEqual(["2026-12-15", "2026-12-17"]);
	});

	test("handles projected 0-lesson classes when startDate, schedule, sessionsTotal change or startDate is cleared", () => {
		const monWedSchedule = JSON.stringify({
			days: [0, 2],
			start: "18:00",
			end: "19:30",
		});

		const shrunk = planUnstartedStartDateShift({
			oldSchedule: TUE_THU_SCHEDULE,
			newSchedule: monWedSchedule,
			oldStartDate: "2026-12-01",
			newStartDate: "2026-12-07",
			oldSessionsTotal: 5,
			newSessionsTotal: 3,
			existingLessonDates: [],
			existingShifts: [],
		});
		expect(shrunk.ok).toBe(true);
		if (!shrunk.ok) return;
		expect(shrunk.mode).toBe("projected");
		expect(shrunk.mappings).toHaveLength(3);
		expect(shrunk.mappings[0]).toEqual({
			oldDate: "2026-12-01",
			newDate: "2026-12-07",
			newDay: 1,
		});
		expect(shrunk.surplusOldDates).toEqual(["2026-12-10", "2026-12-15"]);

		const cleared = planUnstartedStartDateShift({
			oldSchedule: TUE_THU_SCHEDULE,
			newSchedule: TUE_THU_SCHEDULE,
			oldStartDate: "2026-12-01",
			newStartDate: "",
			oldSessionsTotal: 4,
			newSessionsTotal: 4,
			existingLessonDates: [],
			existingShifts: [],
		});
		expect(cleared.ok).toBe(true);
		if (!cleared.ok) return;
		expect(cleared.mode).toBe("projected");
		expect(cleared.mappings).toEqual([]);
		expect(cleared.surplusOldDates).toEqual([
			"2026-12-01",
			"2026-12-03",
			"2026-12-08",
			"2026-12-10",
		]);
	});
});

describe("D1 chunking constants & chunkDateMappings", () => {
	test("keeps SQLite/D1 bound parameter counts strictly under 100 for 52 sessions", () => {
		expect(SHIFT_DATE_PREFIX).toBe("__shift__:");
		expect(LESSON_REMAP_CHUNK * 5 + 2).toBeLessThanOrEqual(100);
		expect(DATE_ONLY_REMAP_CHUNK * 3 + 2).toBeLessThanOrEqual(100);

		const items = Array.from({ length: 52 }, (_, i) => i);
		expect(
			chunkDateMappings(items, LESSON_REMAP_CHUNK).map((c) => c.length),
		).toEqual([18, 18, 16]);
		expect(
			chunkDateMappings(items, DATE_ONLY_REMAP_CHUNK).map((c) => c.length),
		).toEqual([30, 22]);
	});
});
