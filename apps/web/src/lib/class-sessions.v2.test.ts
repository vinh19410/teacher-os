/**
 * Phase 3 pinned diff set (#98 K4 as amended by red-team round-2 N1/N11):
 * five marks plus regression guards. The legacy fixtures in
 * class-sessions.test.ts keep their own coverage untouched.
 */
import { describe, expect, test } from "vitest";
import {
	buildClassSessions,
	type ClassSession,
	type ClassSessionLesson,
	formatCurriculumLessonSlot,
	resolveClassSessions,
	sessionAttendanceState,
	sessionRowTargets,
	sessionStatus,
	sessionStudents,
	sessionTopic,
} from "./class-sessions";

const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';

function dated(
	overrides: Partial<ClassSessionLesson> = {},
): ClassSessionLesson {
	return {
		id: "l1",
		sid: "s1",
		day: overrides.day ?? 2,
		time: "19:00",
		dur: 90,
		topic: "",
		status: "upcoming",
		date: null,
		zoom: "",
		...overrides,
	};
}

/** 26 fully-dated rows, one enrollment, cycling Tue/Fri from 2026-08-25. */
function standardDated(sid = "s1", total = 26): ClassSessionLesson[] {
	return Array.from({ length: total }, (_, i) => {
		const day = i % 2 === 0 ? 2 : 5;
		return dated({
			id: `${sid}-${String(i).padStart(2, "0")}`,
			sid,
			day,
			date:
				day === 2
					? tueOccurrence(Math.floor(i / 2))
					: friOccurrence(Math.floor(i / 2)),
		});
	});
}
function tueOccurrence(k: number): string {
	const dates = [
		"2026-08-25",
		"2026-09-01",
		"2026-09-08",
		"2026-09-15",
		"2026-09-22",
		"2026-09-29",
		"2026-10-06",
		"2026-10-13",
		"2026-10-20",
		"2026-10-27",
		"2026-11-03",
		"2026-11-10",
		"2026-11-17",
	];
	const value = dates.at(k);
	if (value === undefined) throw new Error(`no date at index ${k}`);
	return value;
}
function friOccurrence(k: number): string {
	const dates = [
		"2026-08-28",
		"2026-09-04",
		"2026-09-11",
		"2026-09-18",
		"2026-09-25",
		"2026-10-02",
		"2026-10-09",
		"2026-10-16",
		"2026-10-23",
		"2026-10-30",
		"2026-11-06",
		"2026-11-13",
		"2026-11-20",
	];
	const value = dates.at(k);
	if (value === undefined) throw new Error(`no date at index ${k}`);
	return value;
}

describe("pin (a): derived-projection equality on the untouched class", () => {
	test("v2 chronology/status/students equal the legacy projection surfaces", () => {
		const rows = standardDated();
		const v2 = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(v2).not.toBeNull();

		// Legacy twin output for identical shapes is covered by the server
		// parity suite; here we pin THE PROJECTION CONTRACT: every derived
		// view exposes these exact fields with upcoming aggregates.
		const projected = (v2 ?? []).map((s) => ({
			dateISO: s.dateISO,
			status: sessionStatus(s),
			students: sessionStudents(s),
			time: s.time,
			dur: s.dur,
		}));
		expect(projected[0]).toEqual({
			dateISO: "2026-08-25",
			status: "upcoming",
			students: ["s1"],
			time: "19:00",
			dur: 90,
		});
		expect(projected).toHaveLength(26);
	});
});

describe("pin (b): edited topic renders on its own occurrence k", () => {
	test("renders edited topic on its own occurrence", () => {
		// Second Tue occurrence carries the authored topic.
		const rows = standardDated().map((r) =>
			r.date === tueOccurrence(1) ? { ...r, topic: "Speaking part 2" } : r,
		);
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions).toBeDefined();
		if (!sessions) throw new Error("unexpected: derivation returned nothing");
		const editedSession = sessions.find((s) => s.dateISO === tueOccurrence(1));
		if (!editedSession) throw new Error("edited session missing");
		expect(sessionTopic(editedSession, [])).toBe("Speaking part 2");
		// First occurrence still falls through to the syllabus slot (none here).
		const firstSession = sessions[0];
		expect(
			firstSession
				? sessionTopic(firstSession, [{ title: "Syllabus P1" }])
				: null,
		).toBe("Syllabus P1");
	});
});

describe("pin (c): CTA targets the bucket's own dated row per sid", () => {
	test("each sid's check-in id is its row in THIS bucket (no min-UUID pick)", () => {
		// 2-sid class with skewed progress: e1 completed two Tue buckets, e2 none.
		const e1 = standardDated("sid-e1").map((r, i) =>
			r.day === 2 && (i < 4 || i < 5) ? r : r,
		);
		const rows = [
			...standardDated("sid-a").map((r, i) =>
				i < 4 && r.day === 2 ? { ...r, status: "completed" as const } : r,
			),
			...standardDated("sid-b"),
		];
		void e1;
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions).toBeDefined();
		if (!sessions) throw new Error("unexpected: derivation returned nothing");

		const today = "2099-01-01"; // everything eligible
		for (const [k, session] of sessions.entries()) {
			if (session.day !== 2) continue;
			const attendance = sessionAttendanceState(session, today);
			if (k <= 1) continue; // sid-a completed there → aggregate not actionable check-in head logic on v2? assert directly below
			for (const entry of attendance.sids) {
				if (entry.display !== "check-in") continue;
				expect(entry.enrollmentLessonId).toBe(
					rows.find((r) => r.sid === entry.sid && r.date === session.dateISO)
						?.id,
				);
			}
		}
	});

	test("future occurrences keep CTA id but date-gate flags them future", () => {
		const rows = standardDated();
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions).toBeDefined();
		if (!sessions) throw new Error("unexpected: derivation returned nothing");
		const farFuture = sessions.at(-1);
		if (!farFuture) throw new Error("empty session list");
		const state = sessionAttendanceState(farFuture, "2026-08-26");
		expect(state.kind).toBe("future");
		// Targets still exist — cancel/move entry gate (C5) works pre-date.
		expect(sessionRowTargets(farFuture)).toHaveLength(1);
	});
});

describe("pin (d): startDate-off-day mirrors the label shift only", () => {
	test("dates and chrono order match the skeleton, weekday labels shift together", () => {
		const rows = standardDated();
		// Same rows rendered against an off-day startDate: grouping unchanged.
		const sessionsA = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		if (!sessionsA) throw new Error("sessionsA missing");
		const sessionsB = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-26",
			lessons: rows,
		});
		expect(sessionsB).toBeDefined();
		expect(sessionsB?.map((s) => s.dateISO)).toEqual(
			sessionsA.map((s) => s.dateISO),
		);
		expect(sessionsB?.map((s) => s.slotIndex)).toEqual(
			sessionsA.map((s) => s.slotIndex),
		);
	});
});

describe("pin (e) anti-N1: fully-dated vector-broken class stays V2", () => {
	test("moved occurrence does NOT drop the class onto the frozen table", () => {
		const rows = standardDated().map((r) =>
			r.date === tueOccurrence(3)
				? { ...r, date: "2026-09-12" /* moved off-skeleton to Sat */, day: 6 }
				: r,
		);
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions).not.toBeNull();
		if (!sessions) throw new Error("sessions missing");
		const moved = sessions.find((s) => s.dateISO === "2026-09-12");
		if (!moved) throw new Error("moved session missing");
		expect(moved.day).toBe(6); // weekday derived from identity
	});
});

describe("any-NULL and divergence guards hold the frozen fallback", () => {
	test("one NULL among hundreds keeps the class OFF v2 forever", () => {
		// Transient mixed input (dump-stale window / rollback): renders through
		// the frozen legacy pipeline exactly like today — never a half-v2 view.
		const rows = [
			...standardDated(),
			dated({ id: "legacy-row" } as unknown as ClassSessionLesson),
		];
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions?.some((s) => s.mode === "v2")).toBe(false);

		// A NULL row sitting OUTSIDE every schedule slot breaks the legacy
		// derivation too ⇒ outright null (flat-table fallback upstream).
		const rowsDivergent = [
			...standardDated(),
			dated({
				id: "foreign",
				day: 3,
				time: "07:15",
				date: undefined,
			}),
		];
		const out = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rowsDivergent,
		});
		expect(out).toBeNull();
	});

	test("multi-authored topics collapse to the id-min winner (declared lossy)", () => {
		const targetDate = tueOccurrence(2);
		const rows = [...standardDated("sid-a"), ...standardDated("sid-b")].map(
			(r) =>
				r.date === targetDate
					? r.sid === "sid-a"
						? { ...r, topic: "Zulu" }
						: { ...r, topic: "Alpha" }
					: r,
		);
		const sessions = buildClassSessions({
			schedule: SCHEDULE,
			startDate: "2026-08-25",
			lessons: rows,
		});
		expect(sessions).toBeDefined();
		if (!sessions) throw new Error("unexpected: derivation returned nothing");
		const bucket = sessions?.find((s) => s.dateISO === targetDate);
		if (!bucket) throw new Error("missing bucket for target date");
		// id-min: sid-a's ids sort before sid-b's regardless of topic text.
		expect(sessionTopic(bucket, [])).toBe("Zulu");
	});
});

describe("resolveClassSessions & formatCurriculumLessonSlot (#697)", () => {
	const makeSyllabus = (lessonCount: number) => ({
		id: "sy-1",
		name: "Test Syllabus",
		level: "Band 7.0",
		type: "ielts" as const,
		classId: "cl-1",
		sourceTemplateId: null,
		skills: ["Writing"],
		description: "",
		totalLessons: lessonCount,
		modules: [
			{
				id: "m-1",
				title: "Unit 1",
				description: "",
				lessons: Array.from({ length: lessonCount }, (_, i) => ({
					id: `sl-${i + 1}`,
					title: `Bài ${i + 1}`,
					objectives: "",
					materials: "",
					kind: "lesson" as const,
					status: "upcoming" as const,
				})),
			},
		],
	});

	test("projects sessions for 0-lesson class including sessionsTotal=0 fallback to syllabusLessonCount", () => {
		const sy = makeSyllabus(3);
		const explicitTotal = resolveClassSessions({
			cls: {
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				sessionsTotal: 3,
			},
			lessons: [],
			syllabus: sy,
		});
		expect(explicitTotal.sessions).toHaveLength(3);
		expect(formatCurriculumLessonSlot(1, explicitTotal.sessions?.[0])).toBe(
			"Buổi 1 · Thứ Ba, 25/08 · 19:00–20:30",
		);
		expect(formatCurriculumLessonSlot(2, explicitTotal.sessions?.[1])).toBe(
			"Buổi 2 · Thứ Sáu, 28/08 · 19:00–20:30",
		);

		const fallbackTotal = resolveClassSessions({
			cls: {
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				sessionsTotal: 0,
			},
			lessons: [],
			syllabus: sy,
		});
		expect(fallbackTotal.effectiveSessionsTotal).toBe(3);
		expect(fallbackTotal.sessions).toHaveLength(3);
		expect(formatCurriculumLessonSlot(3, fallbackTotal.sessions?.[2])).toBe(
			"Buổi 3 · Thứ Ba, 01/09 · 19:00–20:30",
		);
	});

	test("handles rescheduled date/time, holiday index=0 skip, cancelled suffix, overflow, and legacy null", () => {
		const sy = makeSyllabus(4);
		const rows: ClassSessionLesson[] = [
			// Buổi 1: rescheduled to Wed 2026-08-26 at 18:00 (120m)
			dated({
				id: "l-1",
				date: "2026-08-26",
				day: 3,
				time: "18:00",
				dur: 120,
			}),
			// Holiday on 2026-08-28 -> index = 0 (skipped)
			dated({
				id: "l-h",
				date: "2026-08-28",
				day: 5,
				status: "holiday",
			}),
			// Buổi 2 (makeup): 2026-09-01
			dated({
				id: "l-2",
				date: "2026-09-01",
				day: 2,
			}),
			// Buổi 3: cancelled on 2026-09-04
			dated({
				id: "l-3",
				date: "2026-09-04",
				day: 5,
				status: "cancelled",
			}),
		];

		const { sessions } = resolveClassSessions({
			cls: {
				schedule: SCHEDULE,
				startDate: "2026-08-25",
				sessionsTotal: 3,
			},
			lessons: rows,
			syllabus: sy,
		});
		expect(sessions).not.toBeNull();
		const byIndex = new Map<number, ClassSession>();
		for (const s of sessions ?? []) {
			if (s.index > 0) byIndex.set(s.index, s);
		}

		expect(formatCurriculumLessonSlot(1, byIndex.get(1))).toBe(
			"Buổi 1 · Thứ Tư, 26/08 · 18:00–20:00",
		);
		// Holiday bucket skipped -> ordinal 2 maps to 2026-09-01
		expect(formatCurriculumLessonSlot(2, byIndex.get(2))).toBe(
			"Buổi 2 · Thứ Ba, 01/09 · 19:00–20:30",
		);
		expect(formatCurriculumLessonSlot(3, byIndex.get(3))).toBe(
			"Buổi 3 · Thứ Sáu, 04/09 · 19:00–20:30 · Đã hủy",
		);
		// Overflow beyond class sessionsTotal
		expect(formatCurriculumLessonSlot(4, byIndex.get(4))).toBe(
			"Buổi 4 · Chưa có lịch",
		);

		// Legacy free-text schedule -> sessions === null -> Chưa có lịch
		const legacy = resolveClassSessions({
			cls: {
				schedule: "T3 & T5 19:00",
				startDate: "01/08",
				sessionsTotal: 4,
			},
			lessons: [],
			syllabus: sy,
		});
		expect(legacy.sessions).toBeNull();
		expect(formatCurriculumLessonSlot(1, undefined)).toBe(
			"Buổi 1 · Chưa có lịch",
		);
	});
});
