import { describe, expect, test } from "vitest";
import {
	atRiskRows,
	formatDashboardGreeting,
	formatDashboardLead,
	groupLessonsByClassSession,
	lessonDayFromDate,
	lessonsToday,
	upcomingLessonsThisWeek,
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
		email: "",
		hasPackage: true,
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
		classId: "cl-1",
		time: "19:00",
		dur: 60,
		date: null,
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

describe("groupLessonsByClassSession", () => {
	test("groups multiple students in same class at same time into one session", () => {
		const l1 = lesson({
			id: "l1",
			sid: "s1",
			classId: "cl-1",
			time: "19:00",
			day: 1,
		});
		const l2 = lesson({
			id: "l2",
			sid: "s2",
			classId: "cl-1",
			time: "19:00",
			day: 1,
		});
		const result = groupLessonsByClassSession([l1, l2]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			classId: "cl-1",
			time: "19:00",
		});
		expect(result[0].lessons).toEqual([l1, l2]);
	});

	test("splits same class with different times into separate sessions", () => {
		const l1 = lesson({
			id: "l1",
			sid: "s1",
			classId: "cl-1",
			time: "19:00",
			day: 1,
		});
		const l2 = lesson({
			id: "l2",
			sid: "s2",
			classId: "cl-1",
			time: "20:00",
			day: 1,
		});
		const result = groupLessonsByClassSession([l1, l2]);
		expect(result).toHaveLength(2);
		expect(result[0].time).toBe("19:00");
		expect(result[1].time).toBe("20:00");
	});

	test("splits different classes with same time into separate sessions", () => {
		const l1 = lesson({
			id: "l1",
			sid: "s1",
			classId: "cl-1",
			time: "19:00",
			day: 1,
		});
		const l2 = lesson({
			id: "l2",
			sid: "s2",
			classId: "cl-2",
			time: "19:00",
			day: 1,
		});
		const result = groupLessonsByClassSession([l1, l2]);
		expect(result).toHaveLength(2);
		expect(result[0].classId).toBe("cl-1");
		expect(result[1].classId).toBe("cl-2");
	});

	test("preserves input group order without auto-sorting", () => {
		const l1 = lesson({
			id: "l1",
			sid: "s1",
			classId: "cl-1",
			time: "20:00",
			day: 1,
		});
		const l2 = lesson({
			id: "l2",
			sid: "s2",
			classId: "cl-2",
			time: "18:00",
			day: 1,
		});
		const result = groupLessonsByClassSession([l1, l2]);
		expect(result).toHaveLength(2);
		expect(result[0].classId).toBe("cl-1");
		expect(result[0].time).toBe("20:00");
		expect(result[1].classId).toBe("cl-2");
		expect(result[1].time).toBe("18:00");
	});

	test("derives session display fields from first lesson in group", () => {
		const l1 = lesson({
			id: "l1",
			sid: "s1",
			classId: "cl-1",
			time: "19:00",
			dur: 90,
			type: "1:2",
			topic: "Speaking Unit 1",
			day: 1,
		});
		const l2 = lesson({
			id: "l2",
			sid: "s2",
			classId: "cl-1",
			time: "19:00",
			dur: 60,
			type: "1:1",
			topic: "Different topic",
			day: 1,
		});
		const result = groupLessonsByClassSession([l1, l2]);
		expect(result).toHaveLength(1);
		expect(result[0].dur).toBe(90);
		expect(result[0].type).toBe("1:2");
		expect(result[0].topic).toBe("Speaking Unit 1");
		expect(result[0].lessons).toEqual([l1, l2]);
	});

	test("deduplicates multiple lessons for same student within same session (issue #249 / #204 shape)", () => {
		const rows: Lesson[] = [];
		for (let i = 0; i < 12; i++) {
			rows.push(
				lesson({
					id: `l-s1-${i}`,
					sid: "s1",
					classId: "cl-1",
					time: "19:00",
					day: 5,
					date: null,
				}),
				lesson({
					id: `l-s2-${i}`,
					sid: "s2",
					classId: "cl-1",
					time: "19:00",
					day: 5,
					date: null,
				}),
			);
		}
		expect(rows).toHaveLength(24);
		const result = groupLessonsByClassSession(rows);
		expect(result).toHaveLength(1);
		expect(result[0].lessons).toHaveLength(2);
		expect(result[0].lessons.map((l) => l.sid)).toEqual(["s1", "s2"]);
		expect(result[0].lessons.map((l) => l.id)).toEqual(["l-s1-0", "l-s2-0"]);
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

describe("formatDashboardGreeting", () => {
	test("greets morning between 05:00 and 11:59 Vietnam time", () => {
		// 05:00 ICT = 22:00 UTC previous day
		const start = new Date("2026-08-26T22:00:00Z");
		expect(formatDashboardGreeting("Cô Lan", start)).toBe(
			"Chào buổi sáng, Cô Lan",
		);

		// 08:30 ICT = 01:30 UTC
		const mid = new Date("2026-08-27T01:30:00Z");
		expect(formatDashboardGreeting("Thầy Tuấn", mid)).toBe(
			"Chào buổi sáng, Thầy Tuấn",
		);

		// 11:59 ICT = 04:59 UTC
		const end = new Date("2026-08-27T04:59:59Z");
		expect(formatDashboardGreeting("Giáo viên", end)).toBe(
			"Chào buổi sáng, Giáo viên",
		);
	});

	test("greets afternoon between 12:00 and 17:59 Vietnam time", () => {
		// 12:00 ICT = 05:00 UTC
		const start = new Date("2026-08-27T05:00:00Z");
		expect(formatDashboardGreeting("Cô Lan", start)).toBe(
			"Chào buổi chiều, Cô Lan",
		);

		// 14:30 ICT = 07:30 UTC
		const mid = new Date("2026-08-27T07:30:00Z");
		expect(formatDashboardGreeting("Thầy Tuấn", mid)).toBe(
			"Chào buổi chiều, Thầy Tuấn",
		);

		// 17:59 ICT = 10:59 UTC
		const end = new Date("2026-08-27T10:59:59Z");
		expect(formatDashboardGreeting("Giáo viên", end)).toBe(
			"Chào buổi chiều, Giáo viên",
		);
	});

	test("greets evening from 18:00 to 04:59 Vietnam time (including QC issue #120 repro at 20:39)", () => {
		// 18:00 ICT = 11:00 UTC
		const start = new Date("2026-08-27T11:00:00Z");
		expect(formatDashboardGreeting("Cô Lan", start)).toBe(
			"Chào buổi tối, Cô Lan",
		);

		// 20:39 ICT (QC repro: 2026-08-27 ~20:39 ICT = 13:39 UTC)
		const qcRepro = new Date("2026-08-27T13:39:00Z");
		expect(formatDashboardGreeting("QA Dogfood", qcRepro)).toBe(
			"Chào buổi tối, QA Dogfood",
		);

		// 23:59 ICT = 16:59 UTC
		const midnightBefore = new Date("2026-08-27T16:59:59Z");
		expect(formatDashboardGreeting("usertest1", midnightBefore)).toBe(
			"Chào buổi tối, usertest1",
		);

		// 00:00 ICT = 17:00 UTC
		const midnight = new Date("2026-08-27T17:00:00Z");
		expect(formatDashboardGreeting("usertest1", midnight)).toBe(
			"Chào buổi tối, usertest1",
		);

		// 04:59 ICT = 21:59 UTC
		const earlyMorning = new Date("2026-08-27T21:59:59Z");
		expect(formatDashboardGreeting("usertest1", earlyMorning)).toBe(
			"Chào buổi tối, usertest1",
		);
	});

	test("pins Asia/Ho_Chi_Minh timezone regardless of machine environment", () => {
		// At 13:39 UTC, in America/Los_Angeles it's 06:39 morning, but in Vietnam it's 20:39 night.
		// The helper must evaluate in Vietnam time, yielding 'Chào buổi tối'.
		const now = new Date("2026-08-27T13:39:00Z");
		expect(formatDashboardGreeting("Giáo viên", now)).toBe(
			"Chào buổi tối, Giáo viên",
		);
	});
});

describe("upcomingLessonsThisWeek (issue #212)", () => {
	test("legacy rows: keeps only days after today, drops today and past days", () => {
		const lessons: Lesson[] = [
			lesson({ id: "mon", sid: "s1", day: 1, time: "08:00", date: null }),
			lesson({ id: "tue", sid: "s1", day: 2, time: "08:00", date: null }),
			lesson({ id: "wed", sid: "s1", day: 3, time: "08:00", date: null }),
			lesson({ id: "thu", sid: "s1", day: 4, time: "08:00", date: null }),
			lesson({ id: "fri", sid: "s1", day: 5, time: "08:00", date: null }),
		];
		const result = upcomingLessonsThisWeek(lessons, wednesday);
		expect(result.map((l) => l.id)).toEqual(["thu", "fri"]);
	});

	test("drops cancelled lessons", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "thu-cancelled",
				sid: "s1",
				day: 4,
				time: "08:00",
				date: null,
				status: "cancelled",
			}),
			lesson({ id: "fri", sid: "s1", day: 5, time: "08:00", date: null }),
		];
		const result = upcomingLessonsThisWeek(lessons, wednesday);
		expect(result.map((l) => l.id)).toEqual(["fri"]);
	});

	test("dated rows: keeps only dates in the remaining part of this week", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "past",
				sid: "s1",
				day: 2,
				time: "08:00",
				date: "2026-08-18",
			}),
			lesson({
				id: "today",
				sid: "s1",
				day: 3,
				time: "08:00",
				date: "2026-08-19",
			}),
			lesson({
				id: "thu",
				sid: "s1",
				day: 4,
				time: "08:00",
				date: "2026-08-20",
			}),
			lesson({
				id: "sun",
				sid: "s1",
				day: 7,
				time: "08:00",
				date: "2026-08-23",
			}),
			lesson({
				id: "next-week",
				sid: "s1",
				day: 2,
				time: "08:00",
				date: "2026-08-25",
			}),
		];
		const result = upcomingLessonsThisWeek(lessons, wednesday);
		expect(result.map((l) => l.id)).toEqual(["thu", "sun"]);
	});

	test("Sunday boundary returns an empty list", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "legacy-sun",
				sid: "s1",
				day: 7,
				time: "08:00",
				date: null,
			}),
			lesson({
				id: "dated-sun",
				sid: "s1",
				day: 7,
				time: "09:00",
				date: "2026-08-23",
			}),
		];
		expect(upcomingLessonsThisWeek(lessons, sunday)).toEqual([]);
	});

	test("Monday keeps the whole rest of the week for legacy rows", () => {
		const lessons: Lesson[] = [
			lesson({ id: "tue", sid: "s1", day: 2, time: "08:00", date: null }),
			lesson({ id: "sun", sid: "s1", day: 7, time: "08:00", date: null }),
		];
		expect(upcomingLessonsThisWeek(lessons, monday).map((l) => l.id)).toEqual([
			"tue",
			"sun",
		]);
	});

	test("sorts by day then time across legacy and dated rows", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "fri-legacy-2000",
				sid: "s1",
				day: 5,
				time: "20:00",
				date: null,
			}),
			lesson({
				id: "thu-dated-1900",
				sid: "s1",
				day: 4,
				time: "19:00",
				date: "2026-08-20",
			}),
			lesson({
				id: "thu-legacy-0900",
				sid: "s1",
				day: 4,
				time: "09:00",
				date: null,
			}),
		];
		expect(
			upcomingLessonsThisWeek(lessons, wednesday).map((l) => l.id),
		).toEqual(["thu-legacy-0900", "thu-dated-1900", "fri-legacy-2000"]);
	});
});
