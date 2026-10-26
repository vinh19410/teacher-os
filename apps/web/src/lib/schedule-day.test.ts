import { describe, expect, it } from "vitest";

import type { ClassGroup, Lesson } from "@/lib/mock-data";
import { buildDayAgenda } from "./schedule-day";

const cls = (
	id: string,
	schedule = '{"days":[1],"start":"19:00","end":"20:30"}',
): ClassGroup => ({
	id,
	name: `Class ${id}`,
	level: "",
	type: "ielts",
	skills: [],
	mode: "online",
	syllabusId: "",
	studentIds: [],
	invitedStudentIds: [],
	schedule,
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

// 2026-11-05 is a Thursday; 2026-11-03 a Tuesday.
const DAY = "2026-11-05";

describe("buildDayAgenda — dated and legacy lessons", () => {
	it("includes the dated session of that day with computed endTime", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [
					lesson({ id: "d1", date: DAY, day: 4, time: "19:00", dur: 90 }),
				],
			},
			DAY,
		);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			kind: "lesson",
			id: "d:cls-1:2026-11-05",
			classId: "cls-1",
			time: "19:00",
			endTime: "20:30",
			status: "upcoming",
			students: 1,
		});
	});

	it("excludes dated sessions of other days", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [lesson({ id: "d1", date: "2026-11-03", day: 2 })],
			},
			DAY,
		);
		expect(items).toEqual([]);
	});

	it("keeps legacy undated rows on their weekday and drops off-weekday days", () => {
		const lessons = [
			lesson({
				id: "u-1",
				classId: "cls-leg",
				day: 2,
				time: "18:00",
				date: null,
			}),
		];
		const tuesday = buildDayAgenda(
			{
				classes: [cls("cls-leg", '{"days":[2],"start":"18:00","end":"19:00"}')],
				lessons,
			},
			"2026-11-03",
		);
		expect(tuesday).toHaveLength(1);
		expect(tuesday[0]).toMatchObject({
			kind: "lesson",
			id: "l:cls-leg:2:18:00",
			time: "18:00",
			// endTime derives from the row's dur (90'), not the schedule end.
			endTime: "19:30",
			dateISO: null,
		});

		const wednesday = buildDayAgenda(
			{
				classes: [cls("cls-leg", '{"days":[2],"start":"18:00","end":"19:00"}')],
				lessons,
			},
			"2026-11-04",
		);
		expect(wednesday).toEqual([]);
	});

	it("keeps a cancelled session visible with its status", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [lesson({ id: "d1", date: DAY, day: 4, status: "cancelled" })],
			},
			DAY,
		);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ kind: "lesson", status: "cancelled" });
	});
});

describe("buildDayAgenda — events", () => {
	it("includes only the events of that date", () => {
		const items = buildDayAgenda(
			{
				classes: [],
				lessons: [],
				events: [
					{
						id: "ev-1",
						title: "Họp phụ huynh",
						date: DAY,
						startTime: "18:00",
						endTime: "19:30",
						note: "hội trường", // structural superset accepted
					},
					{
						id: "ev-other",
						title: "Khai giảng",
						date: "2026-11-06",
						startTime: "08:00",
						endTime: "09:00",
					},
				],
			},
			DAY,
		);
		expect(items).toEqual([
			{
				kind: "event",
				id: "ev-1",
				title: "Họp phụ huynh",
				time: "18:00",
				endTime: "19:30",
			},
		]);
	});
});

describe("buildDayAgenda — ordering and mixed sources", () => {
	it("sorts lessons and events together by ascending time", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [lesson({ id: "d1", date: DAY, day: 4, time: "19:00" })],
				events: [
					{
						id: "ev-morning",
						title: "Sáng",
						date: DAY,
						startTime: "08:00",
						endTime: "09:00",
					},
					{
						id: "ev-evening",
						title: "Tối",
						date: DAY,
						startTime: "21:00",
						endTime: "22:00",
					},
				],
			},
			DAY,
		);
		expect(items.map((i) => i.id)).toEqual([
			"ev-morning",
			"d:cls-1:2026-11-05",
			"ev-evening",
		]);
	});

	it("adds projected blocks for zero-row classes hitting the day", () => {
		// Thursday class starting exactly on 2026-11-05 with zero rows.
		const projClass = cls(
			"cls-proj",
			'{"days":[3],"start":"18:00","end":"19:30"}',
		);
		projClass.startDate = DAY;
		const items = buildDayAgenda({ classes: [projClass], lessons: [] }, DAY);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			kind: "lesson",
			classId: "cls-proj",
			time: "18:00",
			status: "upcoming",
			students: 0,
		});
	});

	it("wraps endTime past midnight (23:00 + 90 → 00:30)", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [
					lesson({ id: "d1", date: DAY, day: 4, time: "23:00", dur: 90 }),
				],
			},
			DAY,
		);
		expect(items[0]).toMatchObject({ kind: "lesson", endTime: "00:30" });
	});
});
