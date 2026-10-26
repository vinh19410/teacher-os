import { describe, expect, it } from "vitest";

import type { ClassGroup, Lesson } from "@/lib/mock-data";
import {
	buildMonthCells,
	type MonthCell,
	type MonthSourceData,
	type ScheduleEventLike,
} from "./schedule-month";

const cls = (id: string): ClassGroup => ({
	id,
	name: `Class ${id}`,
	level: "",
	type: "ielts",
	skills: [],
	mode: "online",
	syllabusId: "",
	studentIds: [],
	invitedStudentIds: [],
	schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
	sessionsDone: 0,
	sessionsTotal: 12,
	status: "active",
	startDate: "2026-10-01",
	tuitionFee: null,
	notes: "",
});

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

const event = (overrides: Partial<ScheduleEventLike> = {}) => ({
	id: "ev-1",
	title: "Họp phụ huynh",
	date: "2026-11-05",
	startTime: "18:00",
	endTime: "19:00",
	...overrides,
});

/** Nov 2026 grid: 2026-10-26 … 2026-12-06, Monday-first. */
const cellOf = (cells: readonly MonthCell[], date: string) => {
	const cell = cells.find((c) => c.date === date);
	expect(cell, `cell ${date} must exist in the 6×7 grid`).toBeDefined();
	return cell as NonNullable<typeof cell>;
};

describe("buildMonthCells — grid shape", () => {
	it("returns 42 cells with inMonth/isToday flags", () => {
		const cells = buildMonthCells(
			{ classes: [], lessons: [] },
			"2026-11-15",
			"2026-11-20",
		);
		expect(cells).toHaveLength(42);
		expect(cells.filter((c) => c.inMonth)).toHaveLength(30); // November
		expect(cells[0]).toMatchObject({ date: "2026-10-26", inMonth: false });
		expect(cells[41]).toMatchObject({ date: "2026-12-06", inMonth: false });
		const todays = cells.filter((c) => c.isToday);
		expect(todays).toHaveLength(1);
		expect(todays[0].date).toBe("2026-11-20");
	});

	it("defaults empty data to empty cells with zero overflow", () => {
		const cells = buildMonthCells({ classes: [], lessons: [] }, "2026-11-15");
		for (const cell of cells) {
			expect(cell.items).toEqual([]);
			expect(cell.overflow).toBe(0);
		}
	});
});

describe("buildMonthCells — lesson/event items and the 3-item cap", () => {
	it("caps a busy day at 3 items and counts the rest as overflow", () => {
		// 4 classes each hold one dated session on 2026-11-05 + 1 event.
		const classes = [1, 2, 3, 4].map((i) => cls(`cls-${i}`));
		const lessons = classes.map((c, i) =>
			lesson({
				id: `l-${i}`,
				classId: c.id,
				date: "2026-11-05",
				day: 4, // Thursday
				time: `${17 + i}:00`,
			}),
		);
		const cells = buildMonthCells(
			{
				classes,
				lessons,
				events: [event({ startTime: "21:00", endTime: "22:00" })],
			},
			"2026-11-15",
			"2026-11-20",
		);
		const cell = cellOf(cells, "2026-11-05");
		expect(cell.items).toHaveLength(3);
		expect(cell.overflow).toBe(2);
		expect(cell.items.map((i) => (i.kind === "holiday" ? "" : i.time))).toEqual(
			["17:00", "18:00", "19:00"],
		);
	});

	it("keeps 3 items + 0 overflow at the exact cap", () => {
		const classes = [1, 2].map((i) => cls(`cls-${i}`));
		const lessons = classes.map((c, i) =>
			lesson({ id: `l-${i}`, classId: c.id, date: "2026-11-05", day: 4 }),
		);
		const cells = buildMonthCells(
			{ classes, lessons, events: [event()] },
			"2026-11-15",
		);
		const cell = cellOf(cells, "2026-11-05");
		expect(cell.items).toHaveLength(3);
		expect(cell.overflow).toBe(0);
	});

	it("drops cancelled sessions from items and from the overflow count", () => {
		const classes = [1, 2, 3, 4].map((i) => cls(`cls-${i}`));
		const lessons = classes.map((c, i) =>
			lesson({
				id: `l-${i}`,
				classId: c.id,
				date: "2026-11-05",
				day: 4,
				time: `${17 + i}:00`,
				status: i === 0 ? "cancelled" : "upcoming",
			}),
		);
		const cells = buildMonthCells(
			{
				classes,
				lessons,
				events: [event({ startTime: "21:00", endTime: "22:00" })],
			},
			"2026-11-15",
		);
		const cell = cellOf(cells, "2026-11-05");
		expect(cell.overflow).toBe(1);
		expect(cell.items.map((i) => (i.kind === "holiday" ? "" : i.time))).toEqual(
			["18:00", "19:00", "20:00"],
		);
	});

	it("maps events to structural items sorted among lessons by time", () => {
		const lessons = [
			lesson({ id: "l-1", classId: "cls-1", date: "2026-11-05", day: 4 }),
		];
		const cells = buildMonthCells(
			{
				classes: [cls("cls-1")],
				lessons,
				events: [
					event({
						id: "ev-x",
						title: "Khai giảng",
						startTime: "08:30",
						endTime: "10:00",
						// Structural superset (KernelEventRow extras) must be accepted.
						note: "hội trường",
						createdAt: "2026-10-01T00:00:00.000Z",
						createdByUserId: "u-1",
					}),
				],
			},
			"2026-11-15",
		);
		const cell = cellOf(cells, "2026-11-05");
		expect(cell.items).toEqual([
			{
				kind: "event",
				id: "ev-x",
				title: "Khai giảng",
				time: "08:30",
				endTime: "10:00",
			},
			{
				kind: "lesson",
				id: "d:cls-1:2026-11-05",
				classId: "cls-1",
				time: "19:00",
				status: "upcoming",
				students: 1,
			},
		]);
	});

	it("ignores events outside the grid or on other cells", () => {
		const cells = buildMonthCells(
			{
				classes: [],
				lessons: [],
				events: [
					event({ id: "ev-in", date: "2026-12-01" }),
					event({ id: "ev-out", date: "2027-01-05" }),
				],
			},
			"2026-11-15",
		);
		expect(cellOf(cells, "2026-12-01").items).toHaveLength(1);
		expect(cells.filter((c) => c.items.length > 0)).toHaveLength(1);
	});
});

describe("buildMonthCells — legacy undated lessons follow the weekday", () => {
	const legClass: ClassGroup = {
		...cls("cls-leg"),
		schedule: '{"days":[2],"start":"18:00","end":"19:00"}',
	};
	const lessons = [
		lesson({
			id: "u-1",
			classId: "cls-leg",
			day: 2,
			time: "18:00",
			date: null,
		}),
	];

	it("renders on every Tuesday of the grid, nowhere else", () => {
		const cells = buildMonthCells(
			{ classes: [legClass], lessons },
			"2026-11-15",
			"2026-11-20",
		);
		// The Oct 26–Dec 6 grid holds 6 Tuesdays — 27/10, 3/11 … 1/12
		// (the trailing out-month 1/12 is still a Tuesday of the template).
		const tuesdays = [
			"2026-10-27",
			"2026-11-03",
			"2026-11-10",
			"2026-11-17",
			"2026-11-24",
			"2026-12-01",
		];
		for (const tuesday of tuesdays) {
			const cell = cellOf(cells, tuesday);
			expect(cell.items).toHaveLength(1);
			expect(cell.items[0]).toMatchObject({
				kind: "lesson",
				classId: "cls-leg",
				time: "18:00",
			});
		}
		expect(cells.filter((c) => c.items.length > 0)).toHaveLength(6);
	});

	it("drops fully cancelled legacy sessions from the cell", () => {
		const cancelled = [
			lesson({
				id: "u-1",
				classId: "cls-leg",
				day: 2,
				time: "18:00",
				date: null,
				status: "cancelled",
			}),
		];
		const cells = buildMonthCells(
			{ classes: [legClass], lessons: cancelled },
			"2026-11-15",
		);
		expect(cellOf(cells, "2026-11-03").items).toEqual([]);
	});
});

describe("buildMonthCells — holiday items (TOS-14b, #453)", () => {
	const holiday = {
		id: "hol-1",
		name: "Nghỉ lễ 30/4",
		fromDate: "2026-04-28",
		toDate: "2026-04-30",
	};

	it("shows one holiday item per day inside the span, none outside", () => {
		const cells = buildMonthCells(
			{ classes: [], lessons: [], holidays: [holiday] },
			"2026-04-15",
			"2026-04-20",
		);
		for (const date of ["2026-04-28", "2026-04-29", "2026-04-30"]) {
			expect(cellOf(cells, date).items).toEqual([
				{ kind: "holiday", id: "hol-1", name: "Nghỉ lễ 30/4" },
			]);
		}
		for (const date of ["2026-04-27", "2026-05-01"]) {
			expect(cellOf(cells, date).items).toEqual([]);
		}
	});

	it("sorts the holiday first and it counts toward the 3-item cap", () => {
		const classes = [1, 2, 3, 4].map((i) => cls(`cls-${i}`));
		const lessons = classes.map((c, i) =>
			lesson({
				id: `l-${i}`,
				classId: c.id,
				date: "2026-11-05",
				day: 4, // Thursday
				time: `${17 + i}:00`,
			}),
		);
		const cells = buildMonthCells(
			{
				classes,
				lessons,
				events: [event({ startTime: "21:00", endTime: "22:00" })],
				holidays: [
					{
						id: "hol-nov",
						name: "Nghỉ lễ",
						fromDate: "2026-11-05",
						toDate: "2026-11-05",
					},
				],
			},
			"2026-11-15",
			"2026-11-20",
		);
		const cell = cellOf(cells, "2026-11-05");
		// 1 holiday + 4 lessons + 1 event = 6 items → cap 3, overflow 3.
		expect(cell.overflow).toBe(3);
		expect(cell.items[0]).toEqual({
			kind: "holiday",
			id: "hol-nov",
			name: "Nghỉ lễ",
		});
		expect(
			cell.items.slice(1).map((i) => (i.kind === "holiday" ? "" : i.time)),
		).toEqual(["17:00", "18:00"]);
	});

	it("keeps old behavior when no holidays are passed", () => {
		const cells = buildMonthCells(
			{
				classes: [cls("cls-1")],
				lessons: [
					lesson({ id: "l-1", date: "2026-11-05", day: 4, time: "19:00" }),
				],
			},
			"2026-11-15",
		);
		const items = cellOf(cells, "2026-11-05").items;
		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("lesson");
	});
});

describe("buildMonthCells — perf (D6 budget: 50 classes × 24 sessions)", () => {
	it("indexes once outside the loop and stays under 50ms", () => {
		const classes = Array.from({ length: 50 }, (_, i) => cls(`cls-perf-${i}`));
		const lessons: Lesson[] = [];
		for (let i = 0; i < 50; i++) {
			for (let s = 0; s < 24; s++) {
				const day = ((s * 7 + i * 13) % 28) + 1; // deterministic 1..28
				const date = `2026-11-${String(day).padStart(2, "0")}`;
				lessons.push(
					lesson({
						id: `pl-${i}-${s}`,
						classId: `cls-perf-${i}`,
						sid: `s-${i}-${s}`,
						date,
						day: new Date(`${date}T00:00:00Z`).getUTCDay() || 7,
						time: s % 2 === 0 ? "18:00" : "19:00",
					}),
				);
			}
		}
		const data: MonthSourceData = { classes, lessons };

		const started = performance.now();
		const cells = buildMonthCells(data, "2026-11-15", "2026-11-20");
		const elapsed = performance.now() - started;

		expect(cells).toHaveLength(42);
		expect(cells.filter((c) => c.items.length > 0).length).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(50);
	});
});
