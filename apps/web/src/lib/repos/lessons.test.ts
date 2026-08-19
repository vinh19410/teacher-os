/**
 * Lessons read repo (Wave 4) — pure mapping units.
 * The kernel row carries classId+enrollmentId; `sid` must resolve through
 * the enrollment because 5 screens still read `l.sid`.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapLessons } from "./lessons";

const snapshot: KernelSnapshot = {
	students: [
		{
			id: "st-1",
			name: "A",
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		},
		{
			id: "st-2",
			name: "B",
			phone: "",
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
			createdAt: "2026-08-01T00:00:00.000Z",
		},
		{
			id: "en-2",
			classId: "cl-1",
			studentId: "st-2",
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
			type: "1:1",
			status: "completed",
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
			type: "1:2",
			status: "upcoming",
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
			type: "trial",
			status: "upcoming",
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
			type: "weird-type",
			status: "weird-status",
			topic: "",
			zoom: "",
		},
	],
	invoices: [],
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

	test("unknown type/status coerce to display-safe defaults", () => {
		const row = lessons.find((l) => l.id === "les-4");
		expect(row?.type).toBe("1:1");
		expect(row?.status).toBe("upcoming");
	});

	test("empty snapshot maps to an empty schedule", () => {
		expect(
			mapLessons({
				students: [],
				classes: [],
				syllabi: [],
				enrollments: [],
				packages: [],
				lessons: [],
				invoices: [],
			}),
		).toEqual([]);
	});
});
