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

describe("buildDayAgenda — holiday items (TOS-14b, #453)", () => {
	const holiday = {
		id: "hol-1",
		name: "Nghỉ lễ 30/4",
		fromDate: "2026-11-04",
		toDate: "2026-11-06",
	};

	it("includes the holiday item with its span on a covered day", () => {
		const items = buildDayAgenda(
			{ classes: [], lessons: [], holidays: [holiday] },
			DAY,
		);
		expect(items).toEqual([
			{
				kind: "holiday",
				id: "hol-1",
				name: "Nghỉ lễ 30/4",
				fromDate: "2026-11-04",
				toDate: "2026-11-06",
			},
		]);
	});

	it("sorts the holiday before earlier-time lessons and events", () => {
		const items = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [
					lesson({ id: "d1", date: DAY, day: 4, time: "07:00", dur: 60 }),
				],
				events: [
					{
						id: "ev-early",
						title: "Chợ sáng",
						date: DAY,
						startTime: "06:00",
						endTime: "07:00",
					},
				],
				holidays: [holiday],
			},
			DAY,
		);
		expect(items[0]).toMatchObject({ kind: "holiday", id: "hol-1" });
		// Sau holiday, các item thường quay lại sort theo giờ: event 06:00 < lesson 07:00.
		expect(items.map((i) => i.kind)).toEqual(["holiday", "event", "lesson"]);
	});

	it("has no holiday item outside the span or when holidays are absent", () => {
		const withSpan = buildDayAgenda(
			{ classes: [], lessons: [], holidays: [holiday] },
			"2026-11-07",
		);
		expect(withSpan).toEqual([]);

		const without = buildDayAgenda(
			{
				classes: [cls("cls-1")],
				lessons: [
					lesson({ id: "d1", date: DAY, day: 4, time: "19:00", dur: 90 }),
				],
			},
			DAY,
		);
		expect(without.map((i) => i.kind)).toEqual(["lesson"]);
	});
});

describe("buildDayAgenda — paused classes (#694)", () => {
	it("omits projected, legacy, and unrecorded paused buckets while keeping dated historical sessions", () => {
		const tue = "2026-11-03"; // Tuesday = day 2, matching cls default days:[1]
		const items = buildDayAgenda(
			{
				classes: [
					{ ...cls("c-paused-proj"), status: "paused" },
					{ ...cls("c-paused-unrec"), status: "paused" },
					{ ...cls("c-paused-hist"), status: "paused" },
				],
				lessons: [
					lesson({
						id: "l-unrec",
						classId: "c-paused-unrec",
						sid: "s1",
						day: 2,
						date: tue,
						status: "upcoming",
					}),
					lesson({
						id: "l-hist-1",
						classId: "c-paused-hist",
						sid: "s1",
						day: 2,
						date: tue,
						status: "completed",
					}),
					lesson({
						id: "l-hist-2",
						classId: "c-paused-hist",
						sid: "s2",
						day: 2,
						date: tue,
						status: "upcoming",
					}),
				],
			},
			tue,
		);
		expect(items).toHaveLength(1);
		expect(items[0].kind).toBe("lesson");
		if (items[0].kind === "lesson") {
			expect(items[0].classId).toBe("c-paused-hist");
			expect(items[0].rows).toHaveLength(2);
			expect(items[0].status).toBe("completed");
		}
	});
});
