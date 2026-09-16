import { describe, expect, test } from "vitest";
import {
	buildClassSessions,
	type ClassSession,
	type ClassSessionLesson,
	firstUpcomingLessonId,
	formatSessionDate,
	parseStartDate,
	sessionAttendanceState,
	sessionIsEligibleDate,
	sessionLessonInfo,
	sessionStatus,
	sessionStudents,
	sessionTimeRange,
	sessionTopic,
} from "./class-sessions";
import type { Lesson, LessonStatus, Syllabus } from "./mock-data";

const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';

function row(overrides: Partial<ClassSessionLesson> = {}): ClassSessionLesson {
	return {
		id: "l1",
		sid: "s1",
		day: 2,
		time: "19:00",
		dur: 90,
		topic: "",
		status: "upcoming",
		date: null, // legacy fixture — undated rows exercise the frozen path
		zoom: "",
		...overrides,
	};
}

/** 26 rows for one enrollment: 13 × Tue (day 2) alternating with 13 × Fri (day 5). */
function standardRows(sid = "s1", total = 26): ClassSessionLesson[] {
	return Array.from({ length: total }, (_, i) =>
		row({ sid, day: i % 2 === 0 ? 2 : 5, id: `${sid}-${i}` }),
	);
}

/** Minimal session for helper tests that do not need buildClassSessions. */
function makeSession(overrides: Partial<ClassSession> = {}): ClassSession {
	return {
		index: 1,
		slotIndex: 1,
		dateISO: "2026-08-25",
		day: 2,
		time: "19:00",
		dur: 90,
		rows: [],
		...overrides,
	};
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
			date: null,
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

describe("sessionIsEligibleDate", () => {
	test("dateISO today or in the past → true; tomorrow → false (string compare)", () => {
		const session = makeSession({ dateISO: "2026-08-25" });
		expect(sessionIsEligibleDate(session, "2026-08-25")).toBe(true);
		expect(sessionIsEligibleDate(session, "2026-08-26")).toBe(true);
		expect(sessionIsEligibleDate(session, "2026-08-24")).toBe(false);
	});
});

describe("firstUpcomingLessonId", () => {
	test("slot bag: returns the smallest upcoming id by localeCompare, not array order", () => {
		const session = makeSession({
			rows: [
				row({ id: "c" }),
				row({ id: "a" }),
				row({ id: "b" }),
				row({ id: "z", status: "completed" }),
			],
		});
		// Bag order [c,a,b(+z completed)] must not pick "c" — sort wins.
		expect(firstUpcomingLessonId(session, "s1")).toBe("a");
	});

	test("no upcoming row for sid → null", () => {
		const session = makeSession({
			rows: [row({ id: "z", status: "completed" })],
		});
		expect(firstUpcomingLessonId(session, "s1")).toBeNull();
		expect(firstUpcomingLessonId(session, "other")).toBeNull();
	});

	test("every occurrence of a slot returns the SAME id — no index binding", () => {
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: standardRows(),
		}) as ClassSession[];
		const tue = sessions.filter((s) => s.day === 2);
		for (const s of tue) {
			// First Tue row is s1-0 → every occurrence must return it, never
			// rowsForSid[slotIndex-1] (occurrence 5 would give s1-8).
			expect(firstUpcomingLessonId(s, "s1")).toBe("s1-0");
		}
	});
});

describe("sessionAttendanceState", () => {
	function buildAllUpcoming(): ClassSession[] {
		return buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: standardRows(),
		}) as ClassSession[];
	}

	test("sequential head: only the earliest unmarked occurrence is actionable", () => {
		const sessions = buildAllUpcoming();
		const third = sessions[2];
		if (!third) throw new Error("expected at least 3 sessions");
		// todayISO at occurrence 3's date → occurrences 1-3 eligible.
		const today = third.dateISO;
		for (const s of sessions) {
			const state = sessionAttendanceState(s, today);
			const checkIns = state.sids.filter((x) => x.display === "check-in");
			if (s.slotIndex === 1) {
				// First occurrence of EACH slot (Tue and Fri) is its own head.
				expect(state.kind).toBe("actionable");
				expect(checkIns).toHaveLength(1);
				if (s.day === 2) {
					expect(checkIns[0]?.enrollmentLessonId).toBe("s1-0");
				}
			} else {
				expect(checkIns).toHaveLength(0);
			}
		}
	});

	test("after one check-in occurrence 1 reads completed, head moves to occurrence 2", () => {
		const rows = standardRows();
		// s1-0 is the first Tue row → mark it completed.
		rows[0] = row({ ...rows[0], status: "completed" });
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		}) as ClassSession[];
		const tue = sessions.filter((s) => s.day === 2);
		// Single-sid class: occurrence 1 is now aggregate-completed → badge row.
		const first = sessionAttendanceState(tue[0] as ClassSession, "2026-12-31");
		expect(first.kind).toBe("completed");
		const second = sessionAttendanceState(tue[1] as ClassSession, "2026-12-31");
		expect(second.sids[0]?.display).toBe("check-in");
		// Next upcoming id of the slot bag by lexicographic id sort → "s1-10"
		// (localeCompare: "s1-10" < "s1-2"; ids are UUID tie-breaks, any of the
		// sid's upcoming rows check in the same earliest occurrence).
		expect(second.sids[0]?.enrollmentLessonId).toBe("s1-10");
	});

	test("equal 1:2: check-in only for the sid still on the head occurrence", () => {
		// s1 completed ×2 Tue rows, s2 all upcoming.
		let tueCompleted = 0;
		const s1 = standardRows("s1").map((r) =>
			r.day === 2 && tueCompleted++ < 2
				? { ...r, status: "completed" as LessonStatus }
				: r,
		);
		const lessons = [...s1, ...standardRows("s2")];
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
		const tue = sessions.filter((s) => s.day === 2);
		const occ1 = sessionAttendanceState(tue[0] as ClassSession, "2026-12-31");
		expect(
			occ1.sids.filter((x) => x.display === "check-in").map((x) => x.sid),
		).toEqual(["s2"]);
		const occ2 = sessionAttendanceState(tue[1] as ClassSession, "2026-12-31");
		// s1 already completed 2 → occurrence 2 completed for s1; s2 not head.
		expect(occ2.sids.filter((x) => x.display === "check-in")).toHaveLength(0);
	});

	test("equal 1:2 with divergent progress: each sid heads its own occurrence", () => {
		// s1 completed ×1 Tue row, s2 all upcoming.
		const s1 = standardRows("s1").map((r, i) =>
			i === 0 ? { ...r, status: "completed" as LessonStatus } : r,
		);
		const lessons = [...s1, ...standardRows("s2")];
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
		const tue = sessions.filter((s) => s.day === 2);
		const occ1 = sessionAttendanceState(tue[0] as ClassSession, "2026-12-31");
		expect(
			occ1.sids.filter((x) => x.display === "check-in").map((x) => x.sid),
		).toEqual(["s2"]);
		const occ2 = sessionAttendanceState(tue[1] as ClassSession, "2026-12-31");
		expect(
			occ2.sids.filter((x) => x.display === "check-in").map((x) => x.sid),
		).toEqual(["s1"]);
	});

	test("divergent counts: sid that stopped attending gets no entry, no check-in", () => {
		// s2 has 20 rows (10 Tue + 10 Fri) — drops out of later occurrences.
		const lessons = [...standardRows("s1"), ...standardRows("s2", 20)];
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons,
		}) as ClassSession[];
		const late = sessions[25] as ClassSession; // last Fri, slotIndex 13.
		expect(late.day).toBe(5);
		expect(sessionStudents(late)).toEqual(["s1"]);
		const state = sessionAttendanceState(late, "2026-12-31");
		expect(state.sids.map((x) => x.sid)).toEqual(["s1"]);
		expect(state.sids.filter((x) => x.display === "check-in")).toHaveLength(0);
	});

	test("future todayISO before the first dateISO → every session is 'future'", () => {
		const sessions = buildAllUpcoming();
		for (const s of sessions) {
			expect(sessionAttendanceState(s, "2026-08-24").kind).toBe("future");
		}
	});

	test("cancelled and completed sessions carry no per-sid state", () => {
		const cancelledRows = standardRows().map((r) => ({
			...r,
			status: "cancelled" as LessonStatus,
		}));
		const cancelled = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: cancelledRows,
		}) as ClassSession[];
		expect(
			sessionAttendanceState(cancelled[0] as ClassSession, "2026-12-31"),
		).toEqual({ kind: "cancelled", sids: [] });

		const completedRows = standardRows().map((r) => ({
			...r,
			status: "completed" as LessonStatus,
		}));
		const completed = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: completedRows,
		}) as ClassSession[];
		expect(
			sessionAttendanceState(completed[0] as ClassSession, "2026-12-31"),
		).toEqual({ kind: "completed", sids: [] });
	});
});

describe("sessionLessonInfo", () => {
	function makeSyllabus(overrides: Partial<Syllabus> = {}): Syllabus {
		return {
			id: "syl-1",
			name: "IELTS Intensive",
			level: "Intermediate",
			type: "ielts",
			classId: "cls-1",
			sourceTemplateId: null,
			skills: ["Speaking", "Writing"],
			totalLessons: 3,
			description: "Test syllabus",
			modules: [
				{
					id: "mod-1",
					title: "Module 1: Foundation",
					lessons: [
						{
							id: "les-1",
							title: "L1: Intro & Diagnostic",
							objectives: "Assess current band score",
							materials: "Diagnostic test PDF",
							kind: "lesson",
							status: "done",
						},
						{
							id: "les-2",
							title: "L2: Pronunciation Core",
							objectives: "Master IPA vowels",
							materials: "Phonetics chart",
							kind: "lesson",
							status: "current",
						},
					],
				},
				{
					id: "mod-2",
					title: "Module 2: Advanced",
					lessons: [
						{
							id: "les-3",
							title: "L3: Complex Sentences",
							objectives: "Use conditional clauses",
							materials: "Grammar worksheet",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			...overrides,
		};
	}

	function buildSessions(topics: string[] = []): ClassSession[] {
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

	test("maps session to chronological syllabus lesson with module info", () => {
		const syllabus = makeSyllabus();
		const sessions = buildSessions();

		const s1 = sessions[0] as ClassSession;
		const info1 = sessionLessonInfo(s1, syllabus);
		expect(info1).toEqual({
			title: "L1: Intro & Diagnostic",
			moduleTitle: "Module 1: Foundation",
			lessonId: "les-1",
			materials: "Diagnostic test PDF",
			objectives: "Assess current band score",
		});

		const s2 = sessions[1] as ClassSession;
		const info2 = sessionLessonInfo(s2, syllabus);
		expect(info2).toEqual({
			title: "L2: Pronunciation Core",
			moduleTitle: "Module 1: Foundation",
			lessonId: "les-2",
			materials: "Phonetics chart",
			objectives: "Master IPA vowels",
		});

		const s3 = sessions[2] as ClassSession;
		const info3 = sessionLessonInfo(s3, syllabus);
		expect(info3).toEqual({
			title: "L3: Complex Sentences",
			moduleTitle: "Module 2: Advanced",
			lessonId: "les-3",
			materials: "Grammar worksheet",
			objectives: "Use conditional clauses",
		});
	});

	test("returns null for syllabus fields when index > total lessons", () => {
		const syllabus = makeSyllabus();
		const sessions = buildSessions();

		const s4 = sessions[3] as ClassSession;
		const info4 = sessionLessonInfo(s4, syllabus);
		expect(info4).toEqual({
			title: null,
			moduleTitle: null,
			lessonId: null,
			materials: null,
			objectives: null,
		});
	});

	test("edited topic overrides title while moduleTitle and lessonId remain mapped", () => {
		const syllabus = makeSyllabus();
		const sessions = buildSessions(["Mock Test Day 1"]);

		const tue = sessions.filter((s) => s.day === 2);
		const s1 = tue[0] as ClassSession;
		const info1 = sessionLessonInfo(s1, syllabus);
		expect(info1).toEqual({
			title: "Mock Test Day 1",
			moduleTitle: "Module 1: Foundation",
			lessonId: "les-1",
			materials: "Diagnostic test PDF",
			objectives: "Assess current band score",
		});
	});

	test("handles null syllabus gracefully", () => {
		const sessions = buildSessions(["Manual Topic"]);
		const s1 = sessions[0] as ClassSession;
		const info1 = sessionLessonInfo(s1, null);
		expect(info1).toEqual({
			title: "Manual Topic",
			moduleTitle: null,
			lessonId: null,
			materials: null,
			objectives: null,
		});

		const s2 = sessions[1] as ClassSession;
		const info2 = sessionLessonInfo(s2, null);
		expect(info2).toEqual({
			title: null,
			moduleTitle: null,
			lessonId: null,
			materials: null,
			objectives: null,
		});
	});

	test("skips empty modules without shifting subsequent lesson indices", () => {
		const syllabus = makeSyllabus({
			modules: [
				{ id: "mod-empty", title: "Empty Module", lessons: [] },
					{
						id: "mod-1",
						title: "Module 1",
						lessons: [
							{
								id: "les-1",
								title: "Lesson 1",
								objectives: "Obj 1",
								materials: "Mat 1",
								kind: "lesson",
								status: "done",
							},
						],
					},
			],
		});
		const sessions = buildSessions();
		const s1 = sessions[0] as ClassSession;
		const info1 = sessionLessonInfo(s1, syllabus);
		expect(info1).toEqual({
			title: "Lesson 1",
			moduleTitle: "Module 1",
			lessonId: "les-1",
			materials: "Mat 1",
			objectives: "Obj 1",
		});
	});

	test("anomaly guard: mismatched classId passed as null produces no syllabus leak", () => {
		const syllabus = makeSyllabus({ classId: "other-class-id" });
		const currentClassId = "cls-1";
		// Caller guard: sy && sy.classId === currentClassId ? sy : null
		const guardedSyllabus =
			syllabus.classId === currentClassId ? syllabus : null;
		const sessions = buildSessions();
		const s1 = sessions[0] as ClassSession;
		const info1 = sessionLessonInfo(s1, guardedSyllabus);
		expect(info1).toEqual({
			title: null,
			moduleTitle: null,
			lessonId: null,
			materials: null,
			objectives: null,
		});
	});
});
