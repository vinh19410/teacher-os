import { describe, expect, test } from "vitest";
import type { ClassGroup, Lesson } from "@/lib/mock-data";
import {
	selectProjectedWeekBlocks,
	selectWeekColumnLessons,
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
	schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
	sessionsDone: 0,
	sessionsTotal: 12,
	status: "active",
	startDate: "2026-08-28",
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
});
