import { describe, expect, test } from "vitest";
import {
	buildClassSessions,
	type ClassSession,
	type ClassSessionLesson,
	formatSessionDate,
	parseStartDate,
	sessionStatus,
	sessionStudents,
	sessionTimeRange,
	sessionTopic,
} from "./class-sessions";
import type { Lesson, LessonStatus } from "./mock-data";

const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';

function row(overrides: Partial<ClassSessionLesson> = {}): ClassSessionLesson {
	return {
		sid: "s1",
		day: 2,
		time: "19:00",
		dur: 90,
		topic: "",
		status: "upcoming" as LessonStatus,
		...overrides,
	};
}

/** 26 rows for one enrollment: 13 × Tue (day 2) alternating with 13 × Fri (day 5). */
function standardRows(sid = "s1", total = 26): ClassSessionLesson[] {
	return Array.from({ length: total }, (_, i) =>
		row({ sid, day: i % 2 === 0 ? 2 : 5 }),
	);
}

describe("parseStartDate", () => {
	test("accepts a valid ISO date", () => {
		expect(parseStartDate("2026-08-25")).toBe("2026-08-25");
	});

	test("rejects empty, free text, slash/dash variants, and out-of-range years", () => {
		expect(parseStartDate("")).toBeNull();
		expect(parseStartDate("asap")).toBeNull();
		expect(parseStartDate("26-08")).toBeNull();
		expect(parseStartDate("26/08")).toBeNull();
		expect(parseStartDate("25/08/2026")).toBeNull();
		expect(parseStartDate("1999-12-31")).toBeNull();
		expect(parseStartDate("2101-01-01")).toBeNull();
	});

	test("rejects rolled-over dates via roundtrip guard", () => {
		expect(parseStartDate("2026-02-30")).toBeNull();
		expect(parseStartDate("2026-13-01")).toBeNull();
	});
});

describe("buildClassSessions", () => {
	test("standard class: Tue & Fri from 2026-08-25 → 26 chronological sessions", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: standardRows(),
		});
		expect(sessions).not.toBeNull();
		const list = sessions as ClassSession[];
		expect(list).toHaveLength(26);
		expect(list[0]?.dateISO).toBe("2026-08-25");
		expect(list[0]?.day).toBe(2);
		expect(list[1]?.dateISO).toBe("2026-08-28");
		expect(list[1]?.day).toBe(5);
		expect(list[2]?.dateISO).toBe("2026-09-01");
		for (let i = 1; i < 26; i++) {
			expect(list[i]?.dateISO > list[i - 1]?.dateISO).toBe(true);
		}
		for (const s of list) {
			// rows = every lesson row of the slot (prefix heuristics read them);
			// 13 Tue rows attach to each Tue occurrence, 13 Fri rows to each Fri.
			expect(s.rows).toHaveLength(13);
			expect(s.rows.every((r) => r.day === s.day)).toBe(true);
			expect(s.time).toBe("19:00");
			expect(s.dur).toBe(90);
		}
	});

	test("slotIndex counts per slot, not globally", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: standardRows(),
		});
		const tueSlotIndexes = (sessions as ClassSession[])
			.filter((s) => s.day === 2)
			.map((s) => s.slotIndex);
		expect(tueSlotIndexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
	});

	test("misaligned start (Wed) → first occurrence is Friday 2026-08-28", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-26",
			lessons: standardRows(),
		});
		expect(sessions?.[0]?.dateISO).toBe("2026-08-28");
		expect(sessions?.[0]?.day).toBe(5);
	});

	test("odd total allocates the extra occurrence per weekday row counts, not start date (review critical #1)", () => {
		// Generator cycles the days ARRAY: 25 rows = 13 Tue + 12 Fri, while a
		// Friday start would chronologically prefer 13 Fri. The walk must
		// follow the rows: 13 Tue + 12 Fri, and the last (13th) Tuesday must
		// still carry the student — no phantom student-less Friday 13th.
		const rows = standardRows("s1", 25);
		expect(rows.filter((r) => r.day === 2)).toHaveLength(13);
		expect(rows.filter((r) => r.day === 5)).toHaveLength(12);
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-28", // Friday — first class day after start
			lessons: rows,
		}) as ClassSession[];
		expect(sessions).toHaveLength(25);
		const tue = sessions.filter((s) => s.day === 2);
		const fri = sessions.filter((s) => s.day === 5);
		expect(tue).toHaveLength(13);
		expect(fri).toHaveLength(12);
		expect(sessions[0]?.dateISO).toBe("2026-08-28");
		expect(sessionStudents(tue[12] as ClassSession)).toEqual(["s1"]);
		// All rows completed → every occurrence must read "Đã học" (no phantom
		// "Sắp tới" on a slot that ran out of rows).
		const done = rows.map((r) =>
			row({ sid: r.sid, day: r.day, status: "completed" }),
		);
		const doneSessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-28",
			lessons: done,
		}) as ClassSession[];
		expect(doneSessions.every((s) => sessionStatus(s) === "completed")).toBe(
			true,
		);
	});

	test("duplicate days entries still match generator cycling", () => {
		// days [1,1,4] cycles Tue,Tue,Fri per 3 rows → 12 rows = 8 Tue + 4 Fri.
		const rows = Array.from({ length: 12 }, (_, i) =>
			row({ day: [2, 2, 5][i % 3] }),
		);
		const sessions = buildClassSessions({
			schedule: '{"days":[1,1,4],"start":"19:00","end":"20:30"}',
			startDate: "2026-08-25",
			lessons: rows,
		}) as ClassSession[];
		expect(sessions).toHaveLength(12);
		expect(sessions.filter((s) => s.day === 2)).toHaveLength(8);
		expect(sessions.filter((s) => s.day === 5)).toHaveLength(4);
	});

	test("multi-student: 2 enrollments → 26 sessions, slot rows carry both sids", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: [...standardRows("s1"), ...standardRows("s2", 26)],
		});
		const list = sessions as ClassSession[];
		expect(list).toHaveLength(26);
		for (const s of list) {
			expect(s.rows).toHaveLength(26);
			expect(new Set(s.rows.map((r) => r.sid)).size).toBe(2);
		}
	});

	test("divergent enrollment counts: total = Σ per-weekday max rows-per-sid", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: [...standardRows("s1", 26), ...standardRows("s2", 20)],
		});
		const list = sessions as ClassSession[];
		expect(list).toHaveLength(26);
		expect(list[19]?.rows).toHaveLength(23);
		// s2 (20 rows = 10 Tue + 10 Fri) stops attending after slot occurrence 10.
		expect(sessionStudents(list[19] as ClassSession)).toEqual(["s1", "s2"]);
		expect(sessionStudents(list[25] as ClassSession)).toEqual(["s1"]);
	});

	test("divergence guard: row moved to a weekday outside schedule.days → null", () => {
		const lessons = standardRows();
		lessons[0] = row({ day: 4 });
		expect(
			buildClassSessions({
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				lessons,
			}),
		).toBeNull();
	});

	test("divergence guard: row time edited away from schedule start → null", () => {
		const lessons = standardRows();
		lessons[0] = row({ time: "20:00" });
		expect(
			buildClassSessions({
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				lessons,
			}),
		).toBeNull();
	});

	test("null contract: legacy schedule, missing startDate, no rows", () => {
		expect(
			buildClassSessions({
				schedule: "T3 & T6 · 19:00–20:30",
				startDate: "2026-08-25",
				lessons: standardRows(),
			}),
		).toBeNull();
		expect(
			buildClassSessions({
				schedule: SCHEDULE,
				startDate: "",
				lessons: standardRows(),
			}),
		).toBeNull();
		expect(
			buildClassSessions({
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				lessons: [],
			}),
		).toBeNull();
	});

	test("accepts full Lesson objects (superset of the picked fields)", () => {
		const lesson: Lesson = {
			id: "l1",
			classId: "c1",
			sid: "s1",
			day: 2,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "upcoming",
			topic: "",
			zoom: "",
		};
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: [lesson],
		});
		expect(sessions).toHaveLength(1);
	});
});

describe("sessionStatus", () => {
	function sessionsWithTueStatuses(statuses: LessonStatus[]): ClassSession[] {
		const lessons = statuses.map((status) => row({ status }));
		// Fill the remaining Fri occurrences so the class is complete (26 rows).
		const total = 26 - statuses.length;
		for (let i = 0; i < total; i++) {
			lessons.push(row({ day: 5 }));
		}
		return buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
	}

	test("in-order prefix: statuses mark the Tue occurrences in order", () => {
		const sessions = sessionsWithTueStatuses([
			"completed",
			"completed",
			"completed",
			"cancelled",
		]);
		// 4 Tue rows exist → exactly 4 Tue occurrences (per-weekday counts).
		const tue = sessions.filter((s) => s.day === 2);
		expect(tue.map((s) => sessionStatus(s))).toEqual([
			"completed",
			"completed",
			"completed",
			"cancelled",
		]);
	});

	test("aggregate: a second student with no check-ins keeps occurrences upcoming", () => {
		const done: LessonStatus[] = ["completed", "completed"];
		const lessons = [
			...done.map((status) => row({ status })),
			...Array.from({ length: 11 }, () => row({ day: 5 })),
			...standardRows("s2"),
		];
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
		const tue = sessions.filter((s) => s.day === 2);
		expect(sessionStatus(tue[0] as ClassSession)).toBe("upcoming");
		expect(sessionStatus(tue[1] as ClassSession)).toBe("upcoming");
	});

	test("absent counts as not-completed (parity with the legacy table)", () => {
		const sessions = sessionsWithTueStatuses(["absent"]);
		const tue = sessions.filter((s) => s.day === 2);
		expect(sessionStatus(tue[0] as ClassSession)).toBe("upcoming");
	});
});

describe("sessionTopic", () => {
	function buildWithTueTopics(topics: string[]): ClassSession[] {
		const lessons = topics.map((topic) => row({ topic }));
		for (let i = 0; i < 26 - topics.length; i++) {
			lessons.push(row({ day: 5 }));
		}
		return buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
	}

	test("edited topic lands on the first occurrence of its slot, in order", () => {
		const sessions = buildWithTueTopics(["IELTS Speaking mock"]);
		// 1 Tue row → exactly 1 Tue occurrence; it carries the edited topic.
		const tue = sessions.filter((s) => s.day === 2);
		expect(tue).toHaveLength(1);
		expect(sessionTopic(tue[0] as ClassSession, [])).toBe(
			"IELTS Speaking mock",
		);
		// The Fri occurrences have no edits — syllabus mapping or null.
		const fri = sessions.filter((s) => s.day === 5);
		expect(sessionTopic(fri[0] as ClassSession, [])).toBeNull();
	});

	test("syllabus mapping fills by chronological index otherwise", () => {
		const sessions = buildWithTueTopics([]);
		const syLessons = [
			{ title: "L1 Diagnostic" },
			{ title: "L2 Present Simple" },
			{ title: "L3 Past Simple" },
		];
		expect(sessionTopic(sessions[0] as ClassSession, syLessons)).toBe(
			"L1 Diagnostic",
		);
		expect(sessionTopic(sessions[1] as ClassSession, syLessons)).toBe(
			"L2 Present Simple",
		);
		expect(sessionTopic(sessions[2] as ClassSession, syLessons)).toBe(
			"L3 Past Simple",
		);
		expect(sessionTopic(sessions[3] as ClassSession, syLessons)).toBeNull();
	});

	test("second edited topic lands on the second occurrence of the slot", () => {
		const sessions = buildWithTueTopics(["Topic A", "Topic B"]);
		const tue = sessions.filter((s) => s.day === 2);
		expect(tue).toHaveLength(2);
		expect(sessionTopic(tue[0] as ClassSession, [])).toBe("Topic A");
		expect(sessionTopic(tue[1] as ClassSession, [])).toBe("Topic B");
	});

	test("pin: the same topic string on two rows counts once (dedupe by string)", () => {
		const sessions = buildWithTueTopics(["Review", "Review"]);
		const tue = sessions.filter((s) => s.day === 2);
		expect(tue).toHaveLength(2);
		// tue[1] is the 3rd chronological session (Tue, Fri, Tue) — index 3.
		const syLessons = [
			{ title: "Syllabus lesson 1" },
			{ title: "Syllabus lesson 2" },
			{ title: "Syllabus lesson 3" },
		];
		expect(sessionTopic(tue[0] as ClassSession, syLessons)).toBe("Review");
		// The duplicate does not consume a second occurrence slot.
		expect(sessionTopic(tue[1] as ClassSession, syLessons)).toBe(
			"Syllabus lesson 3",
		);
	});
});

describe("formatSessionDate", () => {
	test("renders capitalized Vietnamese weekday + dd/MM", () => {
		expect(formatSessionDate("2026-08-25")).toBe("Thứ Ba, 25/08");
		expect(formatSessionDate("2026-08-28")).toBe("Thứ Sáu, 28/08");
		expect(formatSessionDate("2026-08-30")).toBe("Chủ Nhật, 30/08");
	});
});

describe("sessionTimeRange", () => {
	test("end time derives from schedule duration, wrapping midnight", () => {
		const session: ClassSession = {
			index: 1,
			slotIndex: 1,
			dateISO: "2026-08-25",
			day: 2,
			time: "23:00",
			dur: 90,
			rows: [],
		};
		expect(sessionTimeRange(session)).toBe("23:00–00:30");
	});
});
