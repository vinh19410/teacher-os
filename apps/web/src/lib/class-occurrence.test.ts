import { describe, expect, test } from "vitest";
import {
	findClassOccurrence,
	occurrenceSidStates,
	sessionStatus,
} from "./class-sessions";
import type { ClassGroup, Lesson, LessonStatus } from "./mock-data";
import {
	fallbackSidStates,
	resolveWeekColumnEntries,
	selectWeekColumnSessions,
} from "./schedule-week";

const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';

const CLS = {
	id: "c1",
	schedule: SCHEDULE,
	startDate: "2026-08-25",
	sessionsTotal: 26,
} as ClassGroup;

function lesson(over: Partial<Lesson> & Pick<Lesson, "id" | "sid">): Lesson {
	return {
		classId: "c1",
		day: 2,
		time: "19:00",
		dur: 90,
		date: null,
		type: "1:2",
		status: "upcoming",
		topic: "",
		zoom: "",
		...over,
	};
}

/**
 * Legacy "Lớp Test 1": 2 students × (13 Tue + 13 Fri) undated rows. Each
 * student has exactly one completed Tuesday row. The completed UUID of `sB`
 * sorts BEFORE its upcoming ones and `sA`'s completed UUID sorts AFTER — the
 * ordering that made the old popup pick rows by UUID.
 */
function legacyClassRows(): Lesson[] {
	const rows: Lesson[] = [];
	const ids: Record<string, { done: string; up: (n: number) => string }> = {
		sA: { done: "a-9-done", up: (n) => `a-1-up-${String(n).padStart(2, "0")}` },
		sB: { done: "b-0-done", up: (n) => `b-1-up-${String(n).padStart(2, "0")}` },
	};
	for (const sid of ["sA", "sB"]) {
		const entry = ids[sid];
		rows.push(lesson({ id: entry.done, sid, day: 2, status: "completed" }));
		for (let n = 0; n < 12; n++) {
			rows.push(lesson({ id: entry.up(n), sid, day: 2 }));
		}
		for (let n = 0; n < 13; n++) {
			rows.push(lesson({ id: `${sid}-fri-${n}`, sid, day: 5 }));
		}
	}
	return rows;
}

function undatedRef(columnDateISO: string) {
	return { dateISO: null, columnDateISO, time: "19:00" };
}

function found(lookup: ReturnType<typeof findClassOccurrence>) {
	if (lookup.kind !== "found") throw new Error(`lookup is ${lookup.kind}`);
	return lookup.session;
}

describe("findClassOccurrence — legacy undated class", () => {
	const lessons = legacyClassRows();

	test("maps the column date to the matching slot of the schedule skeleton", () => {
		const session = found(
			findClassOccurrence(CLS, lessons, undatedRef("2026-10-06")),
		);
		expect(session.dateISO).toBe("2026-10-06");
		expect(session.slotIndex).toBe(7);
	});

	test("future occurrence: every student reads 'upcoming' and nothing can be checked in", () => {
		const session = found(
			findClassOccurrence(CLS, lessons, undatedRef("2026-10-06")),
		);
		const states = occurrenceSidStates(session, "2026-10-05");
		expect(states.map((s) => [s.sid, s.status])).toEqual([
			["sA", "upcoming"],
			["sB", "upcoming"],
		]);
		expect(states.every((s) => !s.canCheckIn)).toBe(true);
		// Not the sequential head → no row to write to at all.
		expect(states.every((s) => s.targetLessonId === null)).toBe(true);
		expect(sessionStatus(session)).toBe("upcoming");
	});

	test("first occurrence: both students completed regardless of row UUID order", () => {
		const session = found(
			findClassOccurrence(CLS, lessons, undatedRef("2026-08-25")),
		);
		const states = occurrenceSidStates(session, "2026-10-05");
		expect(states.map((s) => s.status)).toEqual(["completed", "completed"]);
		expect(states.every((s) => s.targetLessonId === null)).toBe(true);
		expect(sessionStatus(session)).toBe("completed");
	});

	test("sequential head targets the id-ascending upcoming row and can check in once the date arrived", () => {
		const session = found(
			findClassOccurrence(CLS, lessons, undatedRef("2026-09-01")),
		);
		const states = occurrenceSidStates(session, "2026-10-05");
		expect(states.map((s) => [s.sid, s.targetLessonId])).toEqual([
			["sA", "a-1-up-00"],
			["sB", "b-1-up-00"],
		]);
		expect(states.every((s) => s.canCancelEdit && s.canCheckIn)).toBe(true);
	});

	test("a head whose date has not arrived keeps Hủy/Sửa but loses Điểm danh", () => {
		const session = found(
			findClassOccurrence(CLS, lessons, undatedRef("2026-09-01")),
		);
		const states = occurrenceSidStates(session, "2026-08-30");
		expect(states.every((s) => s.canCancelEdit)).toBe(true);
		expect(states.every((s) => !s.canCheckIn)).toBe(true);
	});

	test("a column date outside the skeleton is reported, not guessed", () => {
		expect(
			findClassOccurrence(CLS, lessons, undatedRef("2027-06-01")).kind,
		).toBe("outside-schedule");
		expect(
			findClassOccurrence(CLS, lessons, undatedRef("2026-08-18")).kind,
		).toBe("outside-schedule");
	});

	test("divergent rows or a free-text schedule leave the occurrence unresolved", () => {
		const moved = [...lessons];
		moved[1] = { ...moved[1], time: "20:00" };
		expect(findClassOccurrence(CLS, moved, undatedRef("2026-10-06")).kind).toBe(
			"unresolved",
		);
		expect(
			findClassOccurrence(
				{ ...CLS, schedule: "T3, T6 19h" },
				lessons,
				undatedRef("2026-10-06"),
			).kind,
		).toBe("unresolved");
	});
});

describe("findClassOccurrence — dated (v2) rows", () => {
	const today = "2026-10-06";
	const tomorrow = "2026-10-07";

	function dated(date: string, status: LessonStatus, id: string, sid = "sA") {
		return lesson({ id, sid, date, day: 3, status });
	}

	test("future bucket: Hủy/Sửa stay available, Điểm danh does not", () => {
		const session = found(
			findClassOccurrence(CLS, [dated(tomorrow, "upcoming", "r1")], {
				dateISO: tomorrow,
				time: "19:00",
			}),
		);
		const [state] = occurrenceSidStates(session, today);
		expect(state).toMatchObject({
			status: "upcoming",
			targetLessonId: "r1",
			canCancelEdit: true,
			canCheckIn: false,
		});
	});

	test("today's bucket can be checked in", () => {
		const session = found(
			findClassOccurrence(CLS, [dated(today, "upcoming", "r1")], {
				dateISO: today,
				time: "19:00",
			}),
		);
		expect(occurrenceSidStates(session, today)[0]).toMatchObject({
			targetLessonId: "r1",
			canCheckIn: true,
		});
	});

	test("settled rows have no target; absent keeps its own badge and no buttons", () => {
		const rows = [
			dated(today, "completed", "r1", "sA"),
			dated(today, "cancelled", "r2", "sB"),
			dated(today, "absent", "r3", "sC"),
		];
		const session = found(
			findClassOccurrence(CLS, rows, { dateISO: today, time: "19:00" }),
		);
		const states = occurrenceSidStates(session, today);
		expect(states.map((s) => [s.sid, s.status, s.targetLessonId])).toEqual([
			["sA", "completed", null],
			["sB", "cancelled", null],
			["sC", "absent", null],
		]);
		expect(states.every((s) => !s.canCancelEdit && !s.canCheckIn)).toBe(true);
	});

	test("mixed class: a dated bucket is read as-is, undated rows are read on their own", () => {
		const legacy = legacyClassRows();
		const newcomer = lesson({
			id: "n1",
			sid: "sNew",
			date: "2026-10-06",
			status: "completed",
		});
		const all = [...legacy, newcomer];

		const datedSession = found(
			findClassOccurrence(CLS, all, {
				dateISO: "2026-10-06",
				time: "19:00",
			}),
		);
		expect(
			occurrenceSidStates(datedSession, "2026-10-06").map((s) => [
				s.sid,
				s.status,
			]),
		).toEqual([["sNew", "completed"]]);

		const legacySession = found(
			findClassOccurrence(CLS, all, undatedRef("2026-10-06")),
		);
		expect(
			occurrenceSidStates(legacySession, "2026-10-05").map((s) => [
				s.sid,
				s.status,
			]),
		).toEqual([
			["sA", "upcoming"],
			["sB", "upcoming"],
		]);
	});
});

describe("fallbackSidStates — occurrence could not be resolved", () => {
	test("keeps row-based actions but hides Điểm danh for dated future rows", () => {
		const states = fallbackSidStates(
			[
				lesson({ id: "f1", sid: "sA", date: "2026-10-09" }),
				lesson({ id: "u1", sid: "sB", date: null }),
				lesson({ id: "d1", sid: "sC", status: "completed" }),
				lesson({ id: "x1", sid: "sD", status: "absent" }),
			],
			"2026-10-06",
		);
		expect(
			states.map((s) => [s.sid, s.status, s.canCancelEdit, s.canCheckIn]),
		).toEqual([
			["sA", "upcoming", true, false],
			["sB", "upcoming", true, true],
			["sC", "completed", false, false],
			["sD", "absent", false, false],
		]);
	});
});

describe("fallbackSidStates — bundled rows per student", () => {
	test("targets the earliest upcoming row even when a settled row has the smaller id", () => {
		const [state] = fallbackSidStates(
			[
				lesson({ id: "a-done", sid: "sA", status: "completed" }),
				lesson({ id: "b-up-2", sid: "sA" }),
				lesson({ id: "b-up-1", sid: "sA" }),
			],
			"2026-10-06",
		);
		expect(state).toMatchObject({
			status: "upcoming",
			targetLessonId: "b-up-1",
			canCancelEdit: true,
			canCheckIn: true,
		});
	});

	test("nothing left to settle shows the final status and no actions", () => {
		const [state] = fallbackSidStates(
			[
				lesson({ id: "x1", sid: "sA", status: "completed" }),
				lesson({ id: "x2", sid: "sA", status: "cancelled" }),
			],
			"2026-10-06",
		);
		expect(state).toMatchObject({
			status: "completed",
			targetLessonId: null,
			canCancelEdit: false,
		});
	});
});

describe("resolveWeekColumnEntries — legacy card status", () => {
	const lessons = legacyClassRows();
	const entriesFor = (column: string) =>
		resolveWeekColumnEntries(
			selectWeekColumnSessions(lessons, 2, [column]),
			[CLS],
			lessons,
			column,
		);

	test("card reads the occurrence in view, not the whole-course rollup", () => {
		expect(entriesFor("2026-08-25").map((e) => e.status)).toEqual([
			"completed",
		]);
		expect(entriesFor("2026-10-06").map((e) => e.status)).toEqual(["upcoming"]);
	});

	test("a week outside the schedule no longer shows a phantom card", () => {
		expect(entriesFor("2027-06-01")).toEqual([]);
	});

	test("unresolved model keeps the original rollup entry", () => {
		const free = resolveWeekColumnEntries(
			selectWeekColumnSessions(lessons, 2, ["2026-10-06"]),
			[{ ...CLS, schedule: "T3 19h" }],
			lessons,
			"2026-10-06",
		);
		expect(free).toHaveLength(1);
	});
});
