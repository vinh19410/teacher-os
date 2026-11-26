import { describe, expect, test } from "vitest";
import {
	atRiskRows,
	formatClassSessionMeta,
	formatDashboardGreeting,
	formatDashboardLead,
	formatDurationVi,
	formatEndTime,
	formatWeekdayLong,
	groupLessonsByClassSession,
	groupUpcomingByDay,
	hasPendingTodayAttendance,
	lessonDayFromDate,
	lessonsToday,
	parseTimeToMinutes,
	resolveDashboardFocus,
	sessionTimelineState,
	studentRiskDetails,
	upcomingLessonsThisWeek,
	vietnamNowMinutes,
} from "./dashboard-from-kernel";
import type {
	Assignment,
	ClassAssignment,
	ClassGroup,
	Lesson,
	Student,
} from "./mock-data";

const monday = new Date("2026-08-17T12:00:00+07:00");
const wednesday = new Date("2026-08-19T12:00:00+07:00");
const sunday = new Date("2026-08-23T12:00:00+07:00");

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
		attendance: null,
		attendanceNote: null,
		topic: "T",
		zoom: "",
		...partial,
	};
}

function classAssignment(
	partial: Partial<ClassAssignment> = {},
): ClassAssignment {
	return {
		id: "ca-1",
		classId: "cl-1",
		promptId: "pr-1",
		title: "Essay Task 2",
		due: "2026-08-18",
		dueAt: null,
		note: "",
		createdAt: "2026-08-10T00:00:00.000Z",
		targets: [],
		...partial,
	};
}

function legacyAssignment(
	partial: Pick<Assignment, "id" | "sid"> & Partial<Assignment>,
): Assignment {
	return {
		title: "Legacy Essay",
		type: "Writing",
		due: "2026-08-18",
		status: "not-submitted",
		scores: null,
		...partial,
	};
}

describe("lessonDayFromDate", () => {
	test("Monday is 1 and Sunday is 7 in Vietnam timezone", () => {
		expect(lessonDayFromDate(monday)).toBe(1);
		expect(lessonDayFromDate(wednesday)).toBe(3);
		expect(lessonDayFromDate(sunday)).toBe(7);
	});

	test("pins Asia/Ho_Chi_Minh across UTC midnight boundary (01:00 VN Thursday while UTC is still Wednesday)", () => {
		expect(lessonDayFromDate(new Date("2026-08-19T18:00:00Z"))).toBe(4);
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
			id: "holiday",
			sid: "s2",
			day: 3,
			time: "12:00",
			status: "holiday",
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

	test("keeps same weekday except cancelled/holiday, sorted by time", () => {
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

	test("dated multi-week rows: keeps only rows whose Vietnam ISO date matches today", () => {
		const multiWeek: Lesson[] = [
			lesson({
				id: "last-wed",
				sid: "s1",
				day: 3,
				date: "2026-08-12",
				time: "18:00",
				status: "completed",
			}),
			lesson({
				id: "today-wed",
				sid: "s1",
				day: 3,
				date: "2026-08-19",
				time: "18:00",
				status: "upcoming",
			}),
			lesson({
				id: "next-wed",
				sid: "s1",
				day: 3,
				date: "2026-08-26",
				time: "18:00",
				status: "upcoming",
			}),
			lesson({
				id: "today-cancelled",
				classId: "cl-2",
				sid: "s2",
				day: 3,
				date: "2026-08-19",
				time: "20:00",
				status: "cancelled",
			}),
			lesson({
				id: "next-wed-cl2",
				classId: "cl-2",
				sid: "s2",
				day: 3,
				date: "2026-08-26",
				time: "20:00",
				status: "upcoming",
			}),
			lesson({
				id: "empty-date-legacy",
				classId: "cl-3",
				sid: "s3",
				day: 3,
				date: "",
				time: "09:00",
				status: "upcoming",
			}),
		];
		expect(lessonsToday(multiWeek, wednesday).map((l) => l.id)).toEqual([
			"empty-date-legacy",
			"today-wed",
		]);
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

	test("does not flag absence statuses — attention table only tracks missed check-ins and overdue assignments", () => {
		const rows = atRiskRows(
			students,
			[
				lesson({
					id: "a",
					sid: "s2",
					day: 5,
					status: "absent",
					date: "2026-08-18",
				}),
				lesson({
					id: "u",
					sid: "s3",
					day: 3,
					status: "completed",
					attendance: "unexcused",
					date: "2026-08-19",
				}),
				lesson({
					id: "e",
					sid: "s1",
					day: 3,
					status: "absent",
					attendance: "excused",
					date: "2026-08-19",
				}),
			],
			wednesday,
		);
		expect(rows).toEqual([]);
	});

	test("legacy undated upcoming before today is missed check-in; today upcoming is not", () => {
		const lessons: Lesson[] = [
			lesson({ id: "mon", sid: "s1", day: 1, status: "upcoming", date: null }),
			lesson({ id: "wed", sid: "s1", day: 3, status: "upcoming", date: null }),
			lesson({
				id: "done",
				sid: "s3",
				day: 1,
				status: "completed",
				date: null,
			}),
			lesson({ id: "cx", sid: "s3", day: 1, status: "cancelled", date: null }),
		];
		expect(atRiskRows(students, lessons, wednesday)).toEqual([
			{ student: s1, reasons: ["missed-check-in"] },
		]);
	});

	test("Monday wrap does not treat legacy Sunday as missed", () => {
		const lessons = [
			lesson({ id: "sun", sid: "s1", day: 7, status: "upcoming", date: null }),
		];
		expect(atRiskRows(students, lessons, monday)).toEqual([]);
	});

	test("dated upcoming lessons compare against Vietnam ISO date: flags past dates, ignores today and future dates even when weekday < today", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "past",
				sid: "s1",
				day: 2,
				date: "2026-08-18",
				status: "upcoming",
			}),
			lesson({
				id: "today",
				sid: "s2",
				day: 3,
				date: "2026-08-19",
				status: "upcoming",
			}),
			// Future Monday (day=1 < wednesday=3) must NOT be falsely flagged.
			lesson({
				id: "next-mon",
				sid: "s3",
				day: 1,
				date: "2026-08-24",
				status: "upcoming",
			}),
		];
		expect(atRiskRows(students, lessons, wednesday)).toEqual([
			{ student: s1, reasons: ["missed-check-in"] },
		]);
	});

	test("dated past lesson from previous week is still flagged on Monday", () => {
		const lessons = [
			lesson({
				id: "last-fri",
				sid: "s2",
				day: 5,
				date: "2026-08-14",
				status: "upcoming",
			}),
		];
		expect(atRiskRows(students, lessons, monday)).toEqual([
			{ student: s2, reasons: ["missed-check-in"] },
		]);
	});

	test("empty or malformed lesson.date falls back to legacy weekday check instead of comparing empty string", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "empty-future-day",
				sid: "s1",
				day: 5,
				date: "",
				status: "upcoming",
			}),
			lesson({
				id: "empty-past-day",
				sid: "s2",
				day: 1,
				date: "",
				status: "upcoming",
			}),
		];
		expect(atRiskRows(students, lessons, wednesday)).toEqual([
			{ student: s2, reasons: ["missed-check-in"] },
		]);
	});

	test("flags unsubmitted overdue classAssignments (both date-only and dueAt) and ignores upcoming, submitted-late, or flip-first attemptId targets", () => {
		const classAssignments: ClassAssignment[] = [
			classAssignment({
				id: "ca-overdue-date",
				due: "2026-08-18",
				dueAt: null,
				targets: [
					{ studentId: "s1", submittedAt: null, attemptId: null },
					// Submitted late must NOT stick permanently in attention table.
					{
						studentId: "s2",
						submittedAt: "2026-08-19T03:00:00.000Z",
						attemptId: "att-late",
					},
					// Submitted attempt with lagging submittedAt (flip-first) must NOT false-flag.
					{ studentId: "s3", submittedAt: null, attemptId: "att-flip" },
				],
			}),
			classAssignment({
				id: "ca-dueat-passed",
				due: "2026-08-19",
				// 11:00+07:00 < wednesday 12:00+07:00
				dueAt: "2026-08-19T11:00:00+07:00",
				targets: [{ studentId: "s2", submittedAt: null, attemptId: null }],
			}),
			classAssignment({
				id: "ca-dueat-future",
				due: "2026-08-19",
				// 18:00+07:00 > wednesday 12:00+07:00
				dueAt: "2026-08-19T18:00:00+07:00",
				targets: [{ studentId: "s3", submittedAt: null, attemptId: null }],
			}),
		];
		expect(
			atRiskRows(students, [], wednesday, undefined, classAssignments),
		).toEqual([
			{ student: s1, reasons: ["overdue-assignment"] },
			{ student: s2, reasons: ["overdue-assignment"] },
		]);
	});

	test("merges missed-check-in and overdue-assignment in deterministic order without duplicate students", () => {
		const lessons = [
			lesson({
				id: "m",
				sid: "s2",
				day: 2,
				date: "2026-08-18",
				status: "upcoming",
			}),
		];
		const classAssignments = [
			classAssignment({
				id: "ca-1",
				due: "2026-08-18",
				targets: [{ studentId: "s2", submittedAt: null }],
			}),
		];
		expect(
			atRiskRows(students, lessons, wednesday, undefined, classAssignments),
		).toEqual([
			{ student: s2, reasons: ["missed-check-in", "overdue-assignment"] },
		]);
	});

	test("flags legacy assignments with status late only", () => {
		const legacy: Assignment[] = [
			legacyAssignment({ id: "a1", sid: "s1", status: "late" }),
			legacyAssignment({ id: "a2", sid: "s2", status: "not-submitted" }),
			legacyAssignment({ id: "a3", sid: "s3", status: "graded" }),
		];
		expect(atRiskRows(students, [], wednesday, undefined, [], legacy)).toEqual([
			{ student: s1, reasons: ["overdue-assignment"] },
		]);
	});
});

describe("formatDashboardLead", () => {
	test("uses Vietnam date and teacher-facing wording, including zero", () => {
		const lead = formatDashboardLead(monday, 0);
		expect(lead).toContain("17/08");
		expect(lead).toContain("Hôm nay có 0 buổi dạy");
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

	test("TOS-11: drops holiday lessons như cancelled", () => {
		const lessons: Lesson[] = [
			lesson({
				id: "thu-holiday",
				sid: "s1",
				day: 4,
				time: "08:00",
				date: null,
				status: "holiday",
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

describe("formatClassSessionMeta (issue #373)", () => {
	const session = {
		classId: "cl-1",
		time: "19:00",
		dur: 90,
		type: "1:1" as const,
		lessons: [],
	};

	test("joins duration, type and topic when all present", () => {
		expect(formatClassSessionMeta({ ...session, topic: "Line chart" })).toBe(
			"90' · 1:1 · Line chart",
		);
	});

	test("drops missing or whitespace-only topic — no trailing separator", () => {
		expect(formatClassSessionMeta({ ...session, topic: "" })).toBe("90' · 1:1");
		expect(formatClassSessionMeta({ ...session, topic: "   " })).toBe(
			"90' · 1:1",
		);
	});
});

describe("paused classes filter (#694)", () => {
	test("excludes paused class lessons and overdue assignments from dashboard selectors", () => {
		const wed = new Date("2026-10-07T10:00:00+07:00"); // day = 3
		const classes: (Pick<ClassGroup, "id" | "status"> & {
			studentIds?: string[];
		})[] = [
			{ id: "cl-active", status: "active", studentIds: ["s-act"] },
			{ id: "cl-paused", status: "paused", studentIds: ["s-pau"] },
		];
		const students = [
			student("s-act", { name: "Active Stu" }),
			student("s-pau", { name: "Paused Stu" }),
		];
		const lessons: Lesson[] = [
			lesson({
				id: "l-today-act",
				classId: "cl-active",
				sid: "s-act",
				day: 3,
				status: "upcoming",
			}),
			lesson({
				id: "l-today-pau",
				classId: "cl-paused",
				sid: "s-pau",
				day: 3,
				status: "upcoming",
			}),
			lesson({
				id: "l-up-act",
				classId: "cl-active",
				sid: "s-act",
				day: 5,
				status: "upcoming",
			}),
			lesson({
				id: "l-up-pau",
				classId: "cl-paused",
				sid: "s-pau",
				day: 5,
				status: "upcoming",
			}),
			lesson({
				id: "l-risk-act",
				classId: "cl-active",
				sid: "s-act",
				day: 1,
				date: "2026-10-05",
				status: "upcoming",
			}),
			lesson({
				id: "l-risk-pau",
				classId: "cl-paused",
				sid: "s-pau",
				day: 1,
				date: "2026-10-05",
				status: "upcoming",
			}),
		];
		const classAssignments: ClassAssignment[] = [
			classAssignment({
				id: "ca-paused-overdue",
				classId: "cl-paused",
				due: "2026-10-05",
				targets: [{ studentId: "s-pau", submittedAt: null }],
			}),
		];
		const legacy: Assignment[] = [
			legacyAssignment({ id: "leg-pau", sid: "s-pau", status: "late" }),
			legacyAssignment({ id: "leg-both", sid: "s-both", status: "late" }),
		];
		const studentsWithBoth = [
			...students,
			student("s-both", { name: "Both Active & Paused Stu" }),
		];
		const classesWithBoth = [
			{
				id: "cl-active",
				status: "active" as const,
				studentIds: ["s-act", "s-both"],
			},
			{
				id: "cl-paused",
				status: "paused" as const,
				studentIds: ["s-pau", "s-both"],
			},
		];
		expect(lessonsToday(lessons, wed, classes).map((l) => l.id)).toEqual([
			"l-today-act",
		]);
		expect(
			upcomingLessonsThisWeek(lessons, wed, classes).map((l) => l.id),
		).toEqual(["l-up-act"]);
		expect(
			atRiskRows(
				studentsWithBoth,
				lessons,
				wed,
				classesWithBoth,
				classAssignments,
				legacy,
			).map((r) => r.student.id),
		).toEqual(["s-act", "s-both"]);
	});
});

describe("Vietnam time & duration helpers", () => {
	test("vietnamNowMinutes converts UTC timestamps into Asia/Ho_Chi_Minh minutes", () => {
		// 01:30 UTC = 08:30 ICT
		expect(vietnamNowMinutes(new Date("2026-08-19T01:30:00Z"))).toBe(
			8 * 60 + 30,
		);
		// 17:05 UTC = 00:05 ICT next day
		expect(vietnamNowMinutes(new Date("2026-08-19T17:05:00Z"))).toBe(5);
	});

	test("parseTimeToMinutes validates HH:mm strictly", () => {
		expect(parseTimeToMinutes("08:30")).toBe(510);
		expect(parseTimeToMinutes("00:00")).toBe(0);
		expect(parseTimeToMinutes("23:59")).toBe(1439);
		expect(parseTimeToMinutes("24:00")).toBeNull();
		expect(parseTimeToMinutes("08:60")).toBeNull();
		expect(parseTimeToMinutes("bad")).toBeNull();
		expect(parseTimeToMinutes("")).toBeNull();
	});

	test("formatEndTime wraps past midnight and returns empty string on invalid time/dur", () => {
		expect(formatEndTime("08:00", 90)).toBe("09:30");
		expect(formatEndTime("23:30", 60)).toBe("00:30");
		expect(formatEndTime("08:00", 0)).toBe("08:00");
		expect(formatEndTime("invalid", 90)).toBe("");
		expect(formatEndTime("08:00", Number.NaN)).toBe("");
	});

	test("formatDurationVi formats minutes cleanly in Vietnamese", () => {
		expect(formatDurationVi(45)).toBe("45 phút");
		expect(formatDurationVi(60)).toBe("1 giờ");
		expect(formatDurationVi(90)).toBe("1 giờ 30 phút");
		expect(formatDurationVi(0)).toBe("1 phút");
		expect(formatDurationVi(Number.NaN)).toBe("1 phút");
	});

	test("formatWeekdayLong maps 1..7 to Vietnamese weekdays", () => {
		expect(formatWeekdayLong(1)).toBe("Thứ Hai");
		expect(formatWeekdayLong(4)).toBe("Thứ Năm");
		expect(formatWeekdayLong(7)).toBe("Chủ Nhật");
	});
});

describe("sessionTimelineState & hasPendingTodayAttendance", () => {
	test("classifies next, live, past across boundaries and invalid inputs", () => {
		const slot = { time: "08:00", dur: 90 };
		expect(sessionTimelineState(slot, 479)).toBe("next");
		expect(sessionTimelineState(slot, 480)).toBe("live");
		expect(sessionTimelineState(slot, 569)).toBe("live");
		expect(sessionTimelineState(slot, 570)).toBe("past");
		expect(sessionTimelineState({ time: "08:00", dur: 0 }, 480)).toBe("past");
		expect(sessionTimelineState({ time: "bad", dur: 90 }, 500)).toBe("next");
	});

	test("hasPendingTodayAttendance returns true if any lesson in the slot is still upcoming", () => {
		const todayLessons: Lesson[] = [
			lesson({
				id: "l1",
				classId: "cl-1",
				sid: "s1",
				day: 3,
				time: "08:00",
				status: "completed",
			}),
			lesson({
				id: "l2",
				classId: "cl-1",
				sid: "s2",
				day: 3,
				time: "08:00",
				status: "absent",
			}),
			lesson({
				id: "l3",
				classId: "cl-2",
				sid: "s1",
				day: 3,
				time: "10:00",
				status: "completed",
			}),
			lesson({
				id: "l4",
				classId: "cl-2",
				sid: "s2",
				day: 3,
				time: "10:00",
				status: "upcoming",
			}),
		];
		expect(hasPendingTodayAttendance(todayLessons, "cl-1", "08:00")).toBe(
			false,
		);
		expect(hasPendingTodayAttendance(todayLessons, "cl-2", "10:00")).toBe(true);
	});
});

describe("groupUpcomingByDay", () => {
	test("groups by day, keeps valid dateIso only for dated classes, preserves null for legacy", () => {
		const input: Lesson[] = [
			lesson({
				id: "thu-1",
				classId: "cl-1",
				sid: "s1",
				day: 4,
				date: "2026-08-20",
				time: "08:00",
			}),
			lesson({
				id: "thu-2",
				classId: "cl-1",
				sid: "s2",
				day: 4,
				date: "2026-08-20",
				time: "08:00",
			}),
			lesson({
				id: "fri-legacy",
				classId: "cl-2",
				sid: "s1",
				day: 5,
				date: null,
				time: "19:00",
			}),
		];
		const groups = groupUpcomingByDay(input);
		expect(groups).toHaveLength(2);
		expect(groups[0].day).toBe(4);
		expect(groups[0].dateIso).toBe("2026-08-20");
		expect(groups[0].sessions).toHaveLength(1);
		expect(groups[0].sessions[0].lessons).toHaveLength(2);
		expect(groups[1].day).toBe(5);
		expect(groups[1].dateIso).toBeNull();
	});
});

describe("resolveDashboardFocus", () => {
	const s1 = groupLessonsByClassSession([
		lesson({
			id: "a",
			classId: "cl-1",
			sid: "s1",
			day: 3,
			time: "08:00",
			dur: 90,
		}),
	])[0];
	const s2 = groupLessonsByClassSession([
		lesson({
			id: "b",
			classId: "cl-2",
			sid: "s1",
			day: 3,
			time: "14:00",
			dur: 60,
		}),
	])[0];
	const badSession = groupLessonsByClassSession([
		lesson({
			id: "bad",
			classId: "cl-bad",
			sid: "s1",
			day: 3,
			time: "bad",
			dur: 60,
		}),
	])[0];
	const tomorrowGroups = groupUpcomingByDay([
		lesson({
			id: "tm",
			classId: "cl-3",
			sid: "s1",
			day: 4,
			date: "2026-08-20",
			time: "09:00",
		}),
	]);
	const fridayGroups = groupUpcomingByDay([
		lesson({
			id: "fr",
			classId: "cl-4",
			sid: "s1",
			day: 5,
			date: "2026-08-21",
			time: "09:00",
		}),
	]);

	test("returns live state with progress and minutesLeft during active session", () => {
		const res = resolveDashboardFocus({
			todaySessions: [s1, s2],
			upcomingGroups: tomorrowGroups,
			now: new Date("2026-08-19T08:45:00+07:00"),
		});
		expect(res.kind).toBe("live");
		if (res.kind === "live") {
			expect(res.session.classId).toBe("cl-1");
			expect(res.progress).toBeCloseTo(0.5, 5);
			expect(res.minutesLeft).toBe(45);
		}
	});

	test("returns next state with minutesUntil before next session today and skips malformed times", () => {
		const res = resolveDashboardFocus({
			todaySessions: [badSession, s1, s2],
			upcomingGroups: tomorrowGroups,
			now: new Date("2026-08-19T12:30:00+07:00"),
		});
		expect(res.kind).toBe("next");
		if (res.kind === "next") {
			expect(res.session.classId).toBe("cl-2");
			expect(res.minutesUntil).toBe(90);
		}
	});

	test("returns done-today-with-upcoming distinguishing tomorrow vs later weekday", () => {
		const evening = new Date("2026-08-19T20:00:00+07:00");
		const withTomorrow = resolveDashboardFocus({
			todaySessions: [s1],
			upcomingGroups: tomorrowGroups,
			now: evening,
		});
		expect(withTomorrow).toMatchObject({
			kind: "done-today-with-upcoming",
			day: 4,
			dateIso: "2026-08-20",
			isTomorrow: true,
		});

		const withFriday = resolveDashboardFocus({
			todaySessions: [s1],
			upcomingGroups: fridayGroups,
			now: evening,
		});
		expect(withFriday).toMatchObject({
			kind: "done-today-with-upcoming",
			day: 5,
			dateIso: "2026-08-21",
			isTomorrow: false,
		});
	});

	test("returns no-today-with-upcoming when today has no sessions but week still has sessions", () => {
		const res = resolveDashboardFocus({
			todaySessions: [],
			upcomingGroups: tomorrowGroups,
			now: wednesday,
		});
		expect(res).toMatchObject({
			kind: "no-today-with-upcoming",
			day: 4,
			dateIso: "2026-08-20",
			isTomorrow: true,
		});
	});

	test("returns done-today-no-upcoming and empty honestly", () => {
		expect(
			resolveDashboardFocus({
				todaySessions: [s1],
				upcomingGroups: [],
				now: new Date("2026-08-19T20:00:00+07:00"),
			}),
		).toEqual({ kind: "done-today-no-upcoming" });

		expect(
			resolveDashboardFocus({
				todaySessions: [],
				upcomingGroups: [],
				now: wednesday,
			}),
		).toEqual({ kind: "empty" });
	});
});

describe("studentRiskDetails", () => {
	test("collects deduped real missed check-ins and overdue assignments using dueDateISO, respecting paused classes and attemptId", () => {
		const classes = [
			{
				id: "cl-1",
				name: "IELTS Writing K12",
				status: "active" as const,
				studentIds: ["s1"],
			},
			{
				id: "cl-paused",
				name: "Lớp Tạm Dừng",
				status: "paused" as const,
				studentIds: ["s1"],
			},
		];
		const lessons: Lesson[] = [
			lesson({
				id: "m1",
				classId: "cl-1",
				sid: "s1",
				day: 2,
				date: "2026-08-18",
				time: "18:00",
				status: "upcoming",
			}),
			lesson({
				id: "m1-dup",
				classId: "cl-1",
				sid: "s1",
				day: 2,
				date: "2026-08-18",
				time: "18:00",
				status: "upcoming",
			}),
			lesson({
				id: "m-leg",
				classId: "cl-1",
				sid: "s1",
				day: 1,
				date: null,
				time: "19:00",
				status: "upcoming",
			}),
			lesson({
				id: "m-paused",
				classId: "cl-paused",
				sid: "s1",
				day: 2,
				date: "2026-08-18",
				time: "10:00",
				status: "upcoming",
			}),
		];
		const classAssignments: ClassAssignment[] = [
			classAssignment({
				id: "ca-dueat",
				classId: "cl-1",
				title: "Writing Task 2",
				due: "2026-08-17",
				// 2026-08-18T18:00:00Z = 2026-08-19 01:00+07:00 (already passed wednesday 12:00+07:00)
				dueAt: "2026-08-18T18:00:00Z",
				targets: [{ studentId: "s1", submittedAt: null, attemptId: null }],
			}),
			classAssignment({
				id: "ca-flip",
				classId: "cl-1",
				title: "Đã nộp flip-first",
				due: "2026-08-17",
				dueAt: null,
				targets: [{ studentId: "s1", submittedAt: null, attemptId: "att-1" }],
			}),
			classAssignment({
				id: "ca-paused",
				classId: "cl-paused",
				title: "Bài lớp tạm dừng",
				due: "2026-08-17",
				dueAt: null,
				targets: [{ studentId: "s1", submittedAt: null, attemptId: null }],
			}),
		];
		const legacy: Assignment[] = [
			legacyAssignment({
				id: "leg-1",
				sid: "s1",
				title: "Legacy Empty Due",
				due: "",
				status: "late",
			}),
			legacyAssignment({
				id: "leg-2",
				sid: "s1",
				title: "Legacy Slash Due",
				due: "18/08",
				status: "late",
			}),
		];

		const details = studentRiskDetails(
			"s1",
			lessons,
			wednesday,
			classes,
			classAssignments,
			legacy,
		);

		expect(details).toEqual([
			{
				kind: "missed-check-in",
				classId: "cl-1",
				className: "IELTS Writing K12",
				dateIso: "2026-08-18",
				day: 2,
				time: "18:00",
			},
			{
				kind: "missed-check-in",
				classId: "cl-1",
				className: "IELTS Writing K12",
				dateIso: null,
				day: 1,
				time: "19:00",
			},
			{
				kind: "overdue-assignment",
				title: "Writing Task 2",
				due: "2026-08-19",
				className: "IELTS Writing K12",
			},
			{
				kind: "overdue-assignment",
				title: "Legacy Empty Due",
				due: "",
				className: null,
			},
			{
				kind: "overdue-assignment",
				title: "Legacy Slash Due",
				due: "18/08",
				className: null,
			},
		]);
	});
});
