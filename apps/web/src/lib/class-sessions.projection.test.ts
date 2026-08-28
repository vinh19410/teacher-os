import { describe, expect, test } from "vitest";
import {
	buildClassSessions,
	type ClassSession,
	projectClassSessions,
	sessionAttendanceState,
	sessionRowTargets,
	sessionStudents,
} from "./class-sessions";

// Issue #121 fixture (generator-corrected dates): Mon-only 19:00–20:30,
// start 2026-08-28 (a Friday) — first Monday ON/AFTER the start is 2026-08-31
// (the skeleton walk is startDate-inclusive), 12 weekly Mondays, last 16/11.
const QC_SCHEDULE = '{"days":[0],"start":"19:00","end":"20:30"}';
const QC_START = "2026-08-28";
const QC_TOTAL = 12;

const datesOf = (sessions: ClassSession[]) => sessions.map((s) => s.dateISO);

describe("projectClassSessions (issue #121)", () => {
	test("QC fixture: 12 chronological Mondays from 2026-08-31", () => {
		const sessions = projectClassSessions({
			schedule: QC_SCHEDULE,
			startDate: QC_START,
			sessionsTotal: QC_TOTAL,
		});
		expect(sessions).not.toBeNull();
		expect(sessions).toHaveLength(12);
		expect(datesOf(sessions as ClassSession[])[0]).toBe("2026-08-31");
		expect(datesOf(sessions as ClassSession[])[11]).toBe("2026-11-16");
		// Weekly Mondays, chronological, generator-identity fields.
		(sessions as ClassSession[]).forEach((s, i) => {
			expect(s.day).toBe(1); // lesson convention: Monday = 1
			expect(s.time).toBe("19:00");
			expect(s.dur).toBe(90);
			expect(s.rows).toEqual([]);
			expect(s.mode).toBe("v2");
			expect(s.index).toBe(i + 1);
			expect(s.slotIndex).toBe(i + 1); // single weekday → slot ordinal == position
		});
	});

	test("two-day schedule, odd total: extra occurrence on the array's first day", () => {
		const sessions = projectClassSessions({
			schedule: '{"days":[2,4],"start":"19:00","end":"20:30"}',
			startDate: QC_START,
			sessionsTotal: 5,
		});
		// days 0-6 Mon-first: [2,4] = Wed & Fri. Wed×3 / Fri×2 — Wed is first
		// in the deduped+sorted array, and the first Fri is the startDate.
		expect(datesOf(sessions as ClassSession[])).toEqual([
			"2026-08-28",
			"2026-09-02",
			"2026-09-04",
			"2026-09-09",
			"2026-09-16",
		]);
		expect(
			(sessions as ClassSession[]).filter((s) => s.day === 3),
		).toHaveLength(3);
		expect(
			(sessions as ClassSession[]).filter((s) => s.day === 5),
		).toHaveLength(2);
		// Per-weekday slot ordinals restart at 1.
		expect(
			(sessions as ClassSession[])
				.filter((s) => s.day === 3)
				.map((s) => s.slotIndex),
		).toEqual([1, 2, 3]);
	});

	test("odd-total multi-weekday generator parity (kongming DOD): Wed+Fri total 7", () => {
		const sessions = projectClassSessions({
			schedule: '{"days":[2,4],"start":"19:00","end":"20:30"}',
			startDate: QC_START,
			sessionsTotal: 7,
		});
		// Wed×4 / Fri×3 — literal dates pinned against the server generator.
		// The extra occurrence goes to Wed (first day), so the course tail is
		// the 4th Wednesday (23/09), not the 4th Friday.
		expect(datesOf(sessions as ClassSession[])).toEqual([
			"2026-08-28",
			"2026-09-02",
			"2026-09-04",
			"2026-09-09",
			"2026-09-11",
			"2026-09-16",
			"2026-09-23",
		]);
	});

	test("un-normalized stored days are deduped+sorted before cycling (parity)", () => {
		const base = { startDate: QC_START, sessionsTotal: 5 };
		const normalized = projectClassSessions({
			schedule: '{"days":[2,4],"start":"19:00","end":"20:30"}',
			...base,
		});
		const unsorted = projectClassSessions({
			schedule: '{"days":[4,2],"start":"19:00","end":"20:30"}',
			...base,
		});
		const duplicated = projectClassSessions({
			schedule: '{"days":[4,4,2],"start":"19:00","end":"20:30"}',
			...base,
		});
		expect(datesOf(unsorted as ClassSession[])).toEqual(
			datesOf(normalized as ClassSession[]),
		);
		expect(datesOf(duplicated as ClassSession[])).toEqual(
			datesOf(normalized as ClassSession[]),
		);
	});

	test("fail-closed: legacy free-text schedule", () => {
		expect(
			projectClassSessions({
				schedule: "T2 19:00-20:30",
				startDate: QC_START,
				sessionsTotal: QC_TOTAL,
			}),
		).toBeNull();
	});

	test("fail-closed: start === end (zero-duration guard)", () => {
		expect(
			projectClassSessions({
				schedule: '{"days":[0],"start":"19:00","end":"19:00"}',
				startDate: QC_START,
				sessionsTotal: QC_TOTAL,
			}),
		).toBeNull();
	});

	test("fail-closed: empty, invalid, or impossible startDate", () => {
		const schedule = QC_SCHEDULE;
		expect(
			projectClassSessions({ schedule, startDate: "", sessionsTotal: 12 }),
		).toBeNull();
		expect(
			projectClassSessions({
				schedule,
				startDate: "2026-02-30",
				sessionsTotal: 12,
			}),
		).toBeNull();
		expect(
			projectClassSessions({
				schedule,
				startDate: "not-a-date",
				sessionsTotal: 12,
			}),
		).toBeNull();
	});

	test("fail-closed: unparseable JSON and non-positive totals", () => {
		expect(
			projectClassSessions({
				schedule: "{oops",
				startDate: QC_START,
				sessionsTotal: 12,
			}),
		).toBeNull();
		expect(
			projectClassSessions({
				schedule: QC_SCHEDULE,
				startDate: QC_START,
				sessionsTotal: 0,
			}),
		).toBeNull();
		expect(
			projectClassSessions({
				schedule: QC_SCHEDULE,
				startDate: QC_START,
				sessionsTotal: -3,
			}),
		).toBeNull();
	});

	test("projection is display-only: no write targets, no attendance sids", () => {
		const sessions = projectClassSessions({
			schedule: QC_SCHEDULE,
			startDate: QC_START,
			sessionsTotal: 4,
		}) as ClassSession[];
		for (const session of sessions) {
			expect(sessionRowTargets(session)).toEqual([]);
			expect(sessionStudents(session)).toEqual([]);
			const attendance = sessionAttendanceState(session, "2026-09-10");
			expect(attendance.sids).toEqual([]);
			// No actionable kind — past dates render "upcoming", future "future",
			// never a check-in CTA.
			expect(attendance.kind).not.toBe("actionable");
		}
	});
});

describe("buildClassSessions 0-rows projection gate", () => {
	test("0 lessons + sessionsTotal → projected sessions", () => {
		const viaGate = buildClassSessions({
			schedule: QC_SCHEDULE,
			startDate: QC_START,
			lessons: [],
			sessionsTotal: QC_TOTAL,
		});
		const direct = projectClassSessions({
			schedule: QC_SCHEDULE,
			startDate: QC_START,
			sessionsTotal: QC_TOTAL,
		});
		expect(viaGate).toEqual(direct);
	});

	test("0 lessons without sessionsTotal keeps the legacy null", () => {
		expect(
			buildClassSessions({
				schedule: QC_SCHEDULE,
				startDate: QC_START,
				lessons: [],
			}),
		).toBeNull();
	});

	test("0 lessons + legacy schedule + sessionsTotal stays null (fail-closed)", () => {
		expect(
			buildClassSessions({
				schedule: "free text",
				startDate: QC_START,
				lessons: [],
				sessionsTotal: 12,
			}),
		).toBeNull();
	});
});
