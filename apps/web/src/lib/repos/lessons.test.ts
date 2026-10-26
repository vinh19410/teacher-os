/**
 * Lessons read repo (Wave 4) — pure mapping units.
 * The kernel row carries classId+enrollmentId; `sid` must resolve through
 * the enrollment because 5 screens still read `l.sid`.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapLessons } from "./lessons";

const snapshot: KernelSnapshot = {
	assignmentPrompts: [],
	classAssignments: [],
	assignmentTests: [],
	vocabDecks: [],
	students: [
		{
			id: "st-1",
			name: "A",
			phone: "",
			email: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		},
		{
			id: "st-2",
			name: "B",
			phone: "",
			email: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		},
	],
	classes: [],
	syllabi: [],
	enrollments: [
		{
			id: "en-1",
			classId: "cl-1",
			studentId: "st-1",
			status: "active",
			createdAt: "2026-08-01T00:00:00.000Z",
		},
		{
			id: "en-2",
			classId: "cl-1",
			studentId: "st-2",
			status: "active",
			createdAt: "2026-08-01T00:00:00.000Z",
		},
	],
	packages: [],
	lessons: [
		{
			id: "les-1",
			classId: "cl-1",
			enrollmentId: "en-1",
			day: 2,
			time: "19:00",
			dur: 60,
			date: null,
			type: "1:1",
			status: "completed",
			attendance: "late",
			attendanceNote: "Đi muộn 5p",
			topic: "Task 2",
			zoom: "zoom.us/1",
		},
		{
			id: "les-2",
			classId: "cl-1",
			enrollmentId: "en-2",
			day: 2,
			time: "19:00",
			dur: 90,
			date: null,
			type: "1:2",
			status: "upcoming",
			attendance: null,
			attendanceNote: null,
			topic: "Speaking",
			zoom: "",
		},
		{
			id: "les-3",
			classId: "cl-1",
			enrollmentId: "en-missing",
			day: 3,
			time: "20:00",
			dur: 60,
			date: null,
			type: "trial",
			status: "upcoming",
			attendance: null,
			attendanceNote: null,
			topic: "orphan",
			zoom: "",
		},
		{
			id: "les-4",
			classId: "cl-1",
			enrollmentId: "en-1",
			day: 4,
			time: "09:00",
			dur: 60,
			date: null,
			type: "weird-type",
			status: "weird-status",
			attendance: "weird-attendance" as never,
			attendanceNote: null,
			topic: "",
			zoom: "",
		},
	],
	assignments: [],
	invoices: [],
	reports: [],
	notifs: [],
	commentBank: [],
};

describe("mapLessons", () => {
	const lessons = mapLessons(snapshot);

	test("sid resolves from the enrollment, never stored on the row", () => {
		expect(lessons.find((l) => l.id === "les-1")?.sid).toBe("st-1");
		expect(lessons.find((l) => l.id === "les-2")?.sid).toBe("st-2");
	});

	test("1:2 session maps to two display rows, one per enrollment", () => {
		const pair = lessons.filter((l) => l.time === "19:00" && l.day === 2);
		expect(pair.map((l) => l.sid).sort()).toEqual(["st-1", "st-2"]);
	});

	test("row with a missing enrollment is dropped, not rendered nameless", () => {
		expect(lessons.find((l) => l.id === "les-3")).toBeUndefined();
	});

	test("unknown type/status/attendance coerce to display-safe defaults, valid attendance and note preserved", () => {
		const row = lessons.find((l) => l.id === "les-4");
		expect(row?.type).toBe("1:1");
		expect(row?.status).toBe("upcoming");
		expect(row?.attendance).toBeNull();
		expect(row?.attendanceNote).toBeNull();

		const first = lessons.find((l) => l.id === "les-1");
		expect(first?.attendance).toBe("late");
		expect(first?.attendanceNote).toBe("Đi muộn 5p");
	});

	test("empty snapshot maps to an empty schedule", () => {
		expect(
			mapLessons({
				assignmentPrompts: [],
				classAssignments: [],
				assignmentTests: [],
				vocabDecks: [],
				students: [],
				classes: [],
				syllabi: [],
				enrollments: [],
				packages: [],
				lessons: [],
				assignments: [],
				invoices: [],
				reports: [],
				notifs: [],
				commentBank: [],
			}),
		).toEqual([]);
	});
});
