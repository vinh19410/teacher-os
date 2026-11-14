import { describe, expect, test } from "vitest";
import type { ClassGroup, Lesson, Syllabus } from "@/lib/mock-data";
import {
	buildWeekModel,
	distinctStudentsBySid,
	findSessionRows,
	rollupSessionStatus,
	selectProjectedWeekBlocks,
	selectWeekColumnLessons,
	selectWeekColumnSessions,
	weekSlotCount,
} from "./schedule-week";

// Issue #121 fixture truth: Mon-only 19:00–20:30 from start 2026-08-28 (Fri)
// → sessions are the Mondays 2026-08-31 … 2026-11-16 (12th).
const QC_CLASS: ClassGroup = {
	id: "cls-qc",
	name: "QC-CTA-CLASS",
	level: "",
	type: "ielts",
	skills: [],
	mode: "online",
	syllabusId: "",
	studentIds: [],
	invitedStudentIds: [],
	schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
	sessionsDone: 0,
	sessionsTotal: 12,
	status: "active",
	startDate: "2026-08-28",
	tuitionFee: null,
	notes: "",
};

const mondayWeek = (startISO: string): string[] => {
	const start = new Date(`${startISO}T00:00:00Z`).getTime();
	return Array.from({ length: 7 }, (_, i) =>
		new Date(start + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
	);
};

const lesson = (overrides: Partial<Lesson>): Lesson => ({
	id: "l1",
	classId: "cls-1",
	sid: "s1",
	day: 1,
	time: "19:00",
	dur: 90,
	date: null,
	type: "1:1",
	status: "upcoming",
	attendance: null,
	attendanceNote: null,
	topic: "",
	zoom: "",
	...overrides,
});

describe("selectWeekColumnLessons (date-accurate weeks)", () => {
	test("dated row renders only in the week containing its date", () => {
		const dated = lesson({ id: "d1", day: 1, date: "2026-09-07" });
		expect(
			selectWeekColumnLessons([dated], 1, mondayWeek("2026-09-07")),
		).toHaveLength(1);
		expect(
			selectWeekColumnLessons([dated], 1, mondayWeek("2026-08-31")),
		).toHaveLength(0);
	});

	test("undated legacy row keeps the weekday-template behavior", () => {
		const undated = lesson({ id: "u1", day: 3, date: null });
		expect(
			selectWeekColumnLessons([undated], 3, mondayWeek("2025-01-06")),
		).toHaveLength(1);
		expect(
			selectWeekColumnLessons([undated], 2, mondayWeek("2025-01-06")),
		).toHaveLength(0);
	});
});

describe("selectWeekColumnSessions (issue #162 — sessions grouped by class)", () => {
	test("1:2 class with 2 enrollments on same date produces 1 session entry with 2 rows", () => {
		const rowA = lesson({
			id: "row-2",
			classId: "cls-1",
			sid: "s-bob",
			day: 1,
			time: "19:00",
			date: "2026-09-07",
			type: "1:2",
			topic: "Unit 1 Speaking",
		});
		const rowB = lesson({
			id: "row-1",
			classId: "cls-1",
			sid: "s-alice",
			day: 1,
			time: "19:00",
			date: "2026-09-07",
			type: "1:2",
			topic: "Unit 1 Speaking",
		});

		const entries = selectWeekColumnSessions(
			[rowA, rowB],
			1,
			mondayWeek("2026-09-07"),
		);
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry.classId).toBe("cls-1");
		expect(entry.key).toBe("d:cls-1:2026-09-07");
		expect(entry.dateISO).toBe("2026-09-07");
		expect(entry.day).toBe(1);
		expect(entry.time).toBe("19:00");
		expect(entry.type).toBe("1:2");
		expect(entry.topic).toBe("Unit 1 Speaking");
		expect(entry.status).toBe("upcoming");
		// Rows sorted stably by id
		expect(entry.rows.map((r) => r.id)).toEqual(["row-1", "row-2"]);
	});

	test("two distinct classes at same day and time produce 2 separate entries", () => {
		const c1 = lesson({
			id: "l-c1",
			classId: "cls-1",
			day: 1,
			time: "19:00",
			date: "2026-09-07",
		});
		const c2 = lesson({
			id: "l-c2",
			classId: "cls-2",
			day: 1,
			time: "19:00",
			date: "2026-09-07",
		});

		const entries = selectWeekColumnSessions(
			[c1, c2],
			1,
			mondayWeek("2026-09-07"),
		);
		expect(entries).toHaveLength(2);
		expect(entries.map((e) => e.classId).sort()).toEqual(["cls-1", "cls-2"]);
	});

	test("legacy undated class with 2 enrollments groups by (classId, day, time)", () => {
		const u1 = lesson({
			id: "u-1",
			classId: "cls-leg",
			sid: "s-1",
			day: 2,
			time: "18:00",
			date: null,
		});
		const u2 = lesson({
			id: "u-2",
			classId: "cls-leg",
			sid: "s-2",
			day: 2,
			time: "18:00",
			date: null,
		});

		const entries = selectWeekColumnSessions(
			[u1, u2],
			2,
			mondayWeek("2026-09-07"),
		);
		expect(entries).toHaveLength(1);
		expect(entries[0].key).toBe("l:cls-leg:2:18:00");
		expect(entries[0].dateISO).toBeNull();
		expect(entries[0].rows).toHaveLength(2);
	});

	test("dated row out of viewed week is excluded", () => {
		const l = lesson({
			id: "l-out",
			classId: "cls-1",
			day: 1,
			date: "2026-09-14",
		});
		const entries = selectWeekColumnSessions([l], 1, mondayWeek("2026-09-07"));
		expect(entries).toHaveLength(0);
	});
});

describe("rollupSessionStatus (homogenous vs mixed)", () => {
	test("all cancelled -> cancelled", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "cancelled" }),
				lesson({ status: "cancelled" }),
			]),
		).toBe("cancelled");
	});

	test("all completed -> completed", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "completed" }),
				lesson({ status: "completed" }),
			]),
		).toBe("completed");
	});

	test("mixed completed and upcoming -> upcoming", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "completed" }),
				lesson({ status: "upcoming" }),
			]),
		).toBe("upcoming");
	});

	test("mixed completed and cancelled -> upcoming", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "completed" }),
				lesson({ status: "cancelled" }),
			]),
		).toBe("upcoming");
	});

	test("all absent -> upcoming", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "absent" }),
				lesson({ status: "absent" }),
			]),
		).toBe("upcoming");
	});

	test("empty rows -> upcoming", () => {
		expect(rollupSessionStatus([])).toBe("upcoming");
	});

	test("TOS-11: all holiday -> holiday", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "holiday" }),
				lesson({ status: "holiday" }),
			]),
		).toBe("holiday");
	});

	test("TOS-11: mixed holiday and upcoming -> upcoming", () => {
		expect(
			rollupSessionStatus([
				lesson({ status: "holiday" }),
				lesson({ status: "upcoming" }),
			]),
		).toBe("upcoming");
	});
});

describe("findSessionRows (live lookup by ref)", () => {
	test("finds dated rows by classId and date, sorted by id", () => {
		const all = [
			lesson({ id: "r-2", classId: "cls-target", date: "2026-09-07" }),
			lesson({ id: "r-1", classId: "cls-target", date: "2026-09-07" }),
			lesson({ id: "r-other", classId: "cls-target", date: "2026-09-14" }),
			lesson({ id: "r-diff", classId: "cls-other", date: "2026-09-07" }),
		];
		const matched = findSessionRows(all, {
			classId: "cls-target",
			dateISO: "2026-09-07",
			day: 1,
			time: "19:00",
		});
		expect(matched.map((r) => r.id)).toEqual(["r-1", "r-2"]);
	});

	test("finds legacy undated rows by (classId, day, time)", () => {
		const all = [
			lesson({
				id: "u-b",
				classId: "cls-leg",
				day: 2,
				time: "18:00",
				date: null,
			}),
			lesson({
				id: "u-a",
				classId: "cls-leg",
				day: 2,
				time: "18:00",
				date: null,
			}),
			lesson({
				id: "u-diff-time",
				classId: "cls-leg",
				day: 2,
				time: "20:00",
				date: null,
			}),
		];
		const matched = findSessionRows(all, {
			classId: "cls-leg",
			dateISO: null,
			day: 2,
			time: "18:00",
		});
		expect(matched.map((r) => r.id)).toEqual(["u-a", "u-b"]);
	});
});

describe("selectProjectedWeekBlocks (issue #121)", () => {
	test("0-row QC class: blocks appear only in weeks containing sessions", () => {
		const classes = [QC_CLASS];
		// Week before the course: nothing.
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-08-24")),
		).toEqual([]);
		// First session Monday 31/08.
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-08-31")),
		).toEqual([
			{
				classId: "cls-qc",
				className: "QC-CTA-CLASS",
				day: 1,
				time: "19:00",
				dateISO: "2026-08-31",
			},
		]);
		// Weekly continuation + mid-course week 19/10 (session #8).
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-09-07")),
		).toHaveLength(1);
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-10-19")),
		).toHaveLength(1);
		// 12th session week.
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-11-16")),
		).toHaveLength(1);
		// After the course ends: nothing.
		expect(
			selectProjectedWeekBlocks(classes, [], mondayWeek("2026-11-23")),
		).toEqual([]);
	});

	test("a class with any real row contributes no projected blocks", () => {
		const rows = [
			lesson({ id: "r1", classId: "cls-qc", day: 1, date: "2026-08-31" }),
		];
		expect(
			selectProjectedWeekBlocks([QC_CLASS], rows, mondayWeek("2026-08-31")),
		).toEqual([]);
	});

	test("legacy schedule class projects nothing (fail-closed)", () => {
		const legacy: ClassGroup = {
			...QC_CLASS,
			id: "cls-legacy",
			schedule: "free text",
		};
		expect(
			selectProjectedWeekBlocks([legacy], [], mondayWeek("2026-08-31")),
		).toEqual([]);
	});

	test("manual class (#649): no skeleton projection — real block from classSessions on its own date", () => {
		const manual: ClassGroup = {
			...QC_CLASS,
			id: "cls-manual",
			schedulingMode: "manual",
			sessionsTotal: 1,
		};
		// 2026-09-02 is a Wednesday — OFF the Mon-only schedule skeleton. A
		// skeleton projection would mint a Monday block; the manual class must
		// render its real class_session date instead.
		const classSessions = [
			{
				id: "cs-1",
				classId: "cls-manual",
				date: "2026-09-02",
				time: "19:00",
				dur: 90,
				topic: "Manual only",
				zoom: "",
			},
		];
		// Week of Mon 07/09 does NOT contain 02/09 → no manual block, and the
		// skeleton never mints one for a manual class.
		expect(
			selectProjectedWeekBlocks(
				[manual],
				[],
				mondayWeek("2026-09-07"),
				classSessions,
			),
		).toEqual([]);
		// Wednesday 02/09 (the real class_session date) → exactly that block.
		expect(
			selectProjectedWeekBlocks([manual], [], ["2026-09-02"], classSessions),
		).toEqual([
			{
				classId: "cls-manual",
				className: "QC-CTA-CLASS",
				day: 3,
				time: "19:00",
				dateISO: "2026-09-02",
			},
		]);
		// Without classSessions arg (deploy skew) → nothing at all, no skeleton mint.
		expect(
			selectProjectedWeekBlocks([manual], [], mondayWeek("2026-08-31")),
		).toEqual([]);
	});

	test("class with attached curriculum in syllabi projects sessions even if schedulingMode='manual' and sessionsTotal=0 (#670)", () => {
		const stuckClass: ClassGroup = {
			...QC_CLASS,
			id: "cls-stuck",
			schedulingMode: "manual",
			sessionsTotal: 0,
			syllabusId: "sy-copy",
		};
		const syllabi: Syllabus[] = [
			{
				id: "sy-copy",
				name: "Copy 3 bài",
				level: "7.0",
				type: "ielts",
				classId: "cls-stuck",
				sourceTemplateId: "sy-tpl",
				skills: ["Writing"],
				totalLessons: 3,
				description: "",
				modules: [
					{
						id: "m-1",
						title: "M1",
						lessons: [
							{
								id: "l-1",
								title: "B1",
								objectives: "—",
								materials: "—",
								kind: "lesson",
								status: "upcoming",
							},
							{
								id: "l-2",
								title: "B2",
								objectives: "—",
								materials: "—",
								kind: "lesson",
								status: "upcoming",
							},
							{
								id: "l-3",
								title: "B3",
								objectives: "—",
								materials: "—",
								kind: "lesson",
								status: "upcoming",
							},
						],
					},
				],
			},
		];
		expect(
			selectProjectedWeekBlocks(
				[stuckClass],
				[],
				mondayWeek("2026-08-31"),
				[],
				syllabi,
			),
		).toEqual([
			{
				classId: "cls-stuck",
				className: "QC-CTA-CLASS",
				day: 1,
				time: "19:00",
				dateISO: "2026-08-31",
			},
		]);
	});

	test("manual class with stale template pointer (classId: null in syllabi) stays manual and does not project (#670)", () => {
		const manualWithStalePtr: ClassGroup = {
			...QC_CLASS,
			id: "cls-stale",
			schedulingMode: "manual",
			sessionsTotal: 12,
			syllabusId: "sy-tpl",
		};
		const syllabi: Syllabus[] = [
			{
				id: "sy-tpl",
				name: "Shared Template",
				level: "7.0",
				type: "ielts",
				classId: null,
				sourceTemplateId: null,
				skills: ["Writing"],
				totalLessons: 3,
				description: "",
				modules: [],
			},
		];
		expect(
			selectProjectedWeekBlocks(
				[manualWithStalePtr],
				[],
				mondayWeek("2026-08-31"),
				[],
				syllabi,
			),
		).toEqual([]);
	});
});

describe("weekSlotCount (AC8 — rendered-week distinct slots)", () => {
	test("dedups day|time across sources and excludes cancelled", () => {
		const columns = [
			[
				lesson({ id: "a", day: 1, time: "19:00" }),
				lesson({ id: "b", day: 1, time: "19:00", sid: "s2" }), // 1:2 twin
				lesson({ id: "c", day: 1, time: "20:00", status: "cancelled" }),
			],
			[lesson({ id: "d", day: 2, time: "18:00", date: "2026-09-01" })],
		];
		const projected = [
			{
				classId: "cls-qc",
				className: "QC",
				day: 3,
				time: "19:00",
				dateISO: "2026-09-02",
			},
			{
				classId: "cls-qc2",
				className: "QC2",
				day: 1,
				time: "19:00", // same slot as real a/b — deduped
				dateISO: "2026-09-02",
			},
		];
		expect(weekSlotCount(columns, projected)).toBe(3);
	});
	test("excludes fully-cancelled session entries and counts 1:2 sessions once", () => {
		const cancelledEntry = {
			key: "d:cls-1:2026-09-07",
			classId: "cls-1",
			dateISO: "2026-09-07",
			day: 1,
			time: "19:00",
			rows: [lesson({ id: "r1", status: "cancelled" })],
			status: "cancelled" as const,
			type: "1:1" as const,
			topic: "",
		};
		const multiEnrollmentActiveEntry = {
			key: "d:cls-2:2026-09-07",
			classId: "cls-2",
			dateISO: "2026-09-07",
			day: 1,
			time: "20:00",
			rows: [
				lesson({ id: "r2", status: "upcoming" }),
				lesson({ id: "r3", status: "upcoming" }),
			],
			status: "upcoming" as const,
			type: "1:2" as const,
			topic: "",
		};
		const columns = [[cancelledEntry, multiEnrollmentActiveEntry]];
		expect(weekSlotCount(columns, [])).toBe(1);
	});
	test("TOS-11: holiday session entry không chiếm slot", () => {
		const holidayEntry = {
			key: "d:cls-1:2026-09-07",
			classId: "cls-1",
			dateISO: "2026-09-07",
			day: 1,
			time: "19:00",
			rows: [lesson({ id: "r1", status: "holiday" })],
			status: "holiday" as const,
			type: "1:1" as const,
			topic: "",
		};
		expect(weekSlotCount([[holidayEntry]], [])).toBe(0);
	});
});

describe("distinctStudentsBySid (issue #204)", () => {
	test("legacy N-lessons x M-students bundle counts people, not rows", () => {
		const rows: Lesson[] = [];
		// "Lớp Test 1" shape: 2 enrollments x 13 lessons for one (day, time).
		for (let lessonIndex = 0; lessonIndex < 13; lessonIndex += 1) {
			for (const sid of ["s-1", "s-2"]) {
				rows.push(
					lesson({
						id: `legacy-${lessonIndex}-${sid}`,
						classId: "cls-leg",
						sid,
						day: 2,
						time: "19:00",
						date: null,
					}),
				);
			}
		}
		expect(rows).toHaveLength(26);
		const students = distinctStudentsBySid(rows);
		expect(students).toHaveLength(2);
		expect(students.map((r) => r.sid)).toEqual(["s-1", "s-2"]);
	});

	test("dated rows are unaffected (one row per student already)", () => {
		const rows = [
			lesson({
				id: "d-1",
				classId: "c",
				sid: "s-1",
				day: 2,
				time: "19:00",
				date: "2026-09-15",
			}),
			lesson({
				id: "d-2",
				classId: "c",
				sid: "s-2",
				day: 2,
				time: "19:00",
				date: "2026-09-15",
			}),
		];
		expect(distinctStudentsBySid(rows)).toHaveLength(2);
	});
});

describe("buildWeekModel — paused classes (#694)", () => {
	test("drops paused projected blocks, legacy buckets, and unrecorded dated buckets; preserves mixed historical buckets with full headcount and non-upcoming status", () => {
		const dates = mondayWeek("2026-10-12");
		const pausedProjected: ClassGroup = {
			...QC_CLASS,
			id: "c-paused-proj",
			name: "Paused Projected",
			status: "paused",
			startDate: "2026-10-01",
			schedule: '{"days":[2],"start":"18:00","end":"19:30"}',
		};
		const activeProjected: ClassGroup = {
			...QC_CLASS,
			id: "c-active-proj",
			name: "Active Projected",
			status: "active",
			startDate: "2026-10-01",
			schedule: '{"days":[3],"start":"18:00","end":"19:30"}',
		};
		const pausedLegacy: ClassGroup = {
			...QC_CLASS,
			id: "c-paused-legacy",
			name: "Paused Legacy",
			status: "paused",
			schedule: '{"days":[0],"start":"17:00","end":"18:30"}',
		};
		const pausedUnrecorded: ClassGroup = {
			...QC_CLASS,
			id: "c-paused-unrec",
			name: "Paused Unrecorded",
			status: "paused",
			schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
		};
		const pausedMixed: ClassGroup = {
			...QC_CLASS,
			id: "c-paused-mixed",
			name: "Paused Mixed",
			status: "paused",
			schedule: '{"days":[0,1],"start":"20:45","end":"22:00"}',
		};
		const lessons: Lesson[] = [
			lesson({
				id: "l-leg",
				classId: "c-paused-legacy",
				sid: "s1",
				day: 1,
				time: "17:00",
				date: null,
				status: "completed",
			}),
			lesson({
				id: "l-unrec",
				classId: "c-paused-unrec",
				sid: "s1",
				day: 1,
				time: "19:00",
				date: "2026-10-12",
				status: "upcoming",
			}),
			lesson({
				id: "l-mix-1",
				classId: "c-paused-mixed",
				sid: "s1",
				day: 1,
				time: "20:45",
				date: "2026-10-12",
				status: "completed",
			}),
			lesson({
				id: "l-mix-2",
				classId: "c-paused-mixed",
				sid: "s2",
				day: 1,
				time: "20:45",
				date: "2026-10-12",
				status: "upcoming",
			}),
			lesson({
				id: "l-abs-1",
				classId: "c-paused-mixed",
				sid: "s1",
				day: 2,
				time: "20:45",
				date: "2026-10-13",
				status: "absent",
			}),
			lesson({
				id: "l-abs-2",
				classId: "c-paused-mixed",
				sid: "s2",
				day: 2,
				time: "20:45",
				date: "2026-10-13",
				status: "upcoming",
			}),
		];

		const model = buildWeekModel(
			{
				classes: [
					pausedProjected,
					activeProjected,
					pausedLegacy,
					pausedUnrecorded,
					pausedMixed,
				],
				lessons,
			},
			dates,
		);

		expect(model.projected.map((b) => b.classId)).toEqual(["c-active-proj"]);
		expect(model.columns[0].map((e) => e.classId)).toEqual(["c-paused-mixed"]);
		expect(model.columns[0][0].rows).toHaveLength(2);
		expect(model.columns[0][0].status).toBe("completed");
		expect(model.columns[1].map((e) => e.classId)).toEqual(["c-paused-mixed"]);
		expect(model.columns[1][0].rows).toHaveLength(2);
		expect(model.columns[1][0].status).toBe("absent");
	});
});
