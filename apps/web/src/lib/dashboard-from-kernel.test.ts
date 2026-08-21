import { describe, expect, test } from "vitest";
import {
	atRiskRows,
	formatDashboardLead,
	lessonDayFromDate,
	lessonsToday,
} from "./dashboard-from-kernel";
import type { Lesson, Student } from "./mock-data";

const monday = new Date(2026, 7, 17, 12, 0, 0);
const wednesday = new Date(2026, 7, 19, 12, 0, 0);
const sunday = new Date(2026, 7, 23, 12, 0, 0);

function student(id: string, overrides: Partial<Student> = {}): Student {
	return {
		id,
		name: id,
		phone: "",
		zalo: "",
		parent: { name: "", phone: "" },
		targetBand: "—",
		skills: [],
		examDate: "",
		pkg: {
			total: 10,
			done: 0,
			remaining: 10,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		},
		tags: [],
		notes: "",
		avatar: "X",
		atRisk: false,
		...overrides,
	};
}

function lesson(
	partial: Pick<Lesson, "id" | "sid" | "day"> & Partial<Lesson>,
): Lesson {
	return {
		time: "19:00",
		dur: 60,
		type: "1:1",
		status: "upcoming",
		topic: "T",
		zoom: "",
		...partial,
	};
}

describe("lessonDayFromDate", () => {
	test("Monday is 1 and Sunday is 7 (schedule.tsx column convention)", () => {
		expect(lessonDayFromDate(monday)).toBe(1);
		expect(lessonDayFromDate(wednesday)).toBe(3);
		expect(lessonDayFromDate(sunday)).toBe(7);
	});
});

describe("lessonsToday", () => {
	const rows: Lesson[] = [
		lesson({
			id: "late",
			sid: "s1",
			day: 3,
			time: "20:00",
			status: "upcoming",
		}),
		lesson({
			id: "early",
			sid: "s1",
			day: 3,
			time: "09:00",
			status: "completed",
		}),
		lesson({
			id: "cancel",
			sid: "s1",
			day: 3,
			time: "10:00",
			status: "cancelled",
		}),
		lesson({
			id: "absent",
			sid: "s2",
			day: 3,
			time: "11:00",
			status: "absent",
		}),
		lesson({ id: "tue", sid: "s1", day: 2, time: "09:00", status: "upcoming" }),
	];

	test("keeps same weekday except cancelled, sorted by time", () => {
		expect(lessonsToday(rows, wednesday).map((l) => l.id)).toEqual([
			"early",
			"absent",
			"late",
		]);
	});

	test("empty when no matching day", () => {
		expect(lessonsToday(rows, monday)).toEqual([]);
	});

	test("weekday-model: twelve upcoming Monday rows all appear on Monday", () => {
		const series = Array.from({ length: 12 }, (_, i) =>
			lesson({ id: `m${i}`, sid: "s1", day: 1, time: "19:00" }),
		);
		expect(lessonsToday(series, monday)).toHaveLength(12);
		expect(lessonsToday(series, wednesday)).toHaveLength(0);
	});
});

describe("atRiskRows", () => {
	const s1 = student("s1", {
		atRisk: true,
		tags: ["nợ học phí", "sắp hết buổi"],
	});
	const s2 = student("s2");
	const s3 = student("s3");
	const students = [s1, s2, s3];

	test("ignores mock atRisk and tuition tags", () => {
		expect(atRiskRows(students, [], wednesday)).toEqual([]);
		expect(
			atRiskRows(
				students,
				[lesson({ id: "today", sid: "s1", day: 3, status: "upcoming" })],
				wednesday,
			),
		).toEqual([]);
	});

	test("absent is a risk reason", () => {
		const rows = atRiskRows(
			students,
			[lesson({ id: "a", sid: "s2", day: 5, status: "absent" })],
			wednesday,
		);
		expect(rows).toEqual([{ student: s2, reasons: ["absent"] }]);
	});

	test("upcoming before today is missed check-in; today upcoming is not", () => {
		const lessons: Lesson[] = [
			lesson({ id: "mon", sid: "s1", day: 1, status: "upcoming" }),
			lesson({ id: "wed", sid: "s1", day: 3, status: "upcoming" }),
			lesson({ id: "done", sid: "s3", day: 1, status: "completed" }),
			lesson({ id: "cx", sid: "s3", day: 1, status: "cancelled" }),
		];
		expect(atRiskRows(students, lessons, wednesday)).toEqual([
			{ student: s1, reasons: ["missed-check-in"] },
		]);
	});

	test("Monday wrap does not treat Sunday as missed", () => {
		const lessons = [
			lesson({ id: "sun", sid: "s1", day: 7, status: "upcoming" }),
		];
		expect(atRiskRows(students, lessons, monday)).toEqual([]);
	});

	test("Sunday treats Mon–Sat upcoming as missed; merges reasons without duplicate students", () => {
		const lessons: Lesson[] = [
			lesson({ id: "a", sid: "s2", day: 2, status: "absent" }),
			lesson({ id: "m", sid: "s2", day: 4, status: "upcoming" }),
		];
		expect(atRiskRows(students, lessons, sunday)).toEqual([
			{ student: s2, reasons: ["absent", "missed-check-in"] },
		]);
	});
});

describe("formatDashboardLead", () => {
	test("uses local date and the today count, including zero", () => {
		const lead = formatDashboardLead(monday, 0);
		expect(lead).toContain("17/08");
		expect(lead).toContain("Hôm nay có 0 buổi học");
		expect(lead).not.toContain("19/08");
	});
});
