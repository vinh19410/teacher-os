/**
 * Classes read repo (Wave 3) — pure mapping units.
 * The kernel snapshot is the only input; the provider wires transport.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapClasses } from "./classes";

const snapshot: KernelSnapshot = {
	students: [
		{
			id: "st-1",
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			zalo: "0912345678",
			parentName: "Nguyễn Văn Hùng",
			parentPhone: "0987 654 321",
		},
		{
			id: "st-2",
			name: "Vũ Thảo Vy",
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		},
	],
	classes: [
		{
			id: "cl-1",
			name: "IELTS Writing 7.0 — Nhóm tối",
			level: "Band 7.0",
			type: "ielts",
			skills: ["Writing", "Speaking"],
			mode: "Online",
			syllabusId: "sy-1",
			schedule: "T3 & T5 · 19:00–20:30",
			sessionsTotal: 12,
			sessionsDone: 4,
			status: "active",
			startDate: "19/08",
			notes: "Nhóm học nhanh",
		},
		{
			id: "cl-2",
			name: "IELTS Speaking 6.5 — Sáng",
			level: "Band 6.5",
			type: "ielts",
			skills: ["Speaking"],
			mode: "Offline",
			syllabusId: null,
			schedule: "T7 · 09:00–10:30",
			sessionsTotal: 10,
			sessionsDone: 0,
			status: "active",
			startDate: "26/08",
			notes: "",
		},
		{
			id: "cl-3",
			name: "Giao tiếp tự tin — Trưa",
			level: "",
			type: "communication",
			skills: [],
			mode: "Online",
			syllabusId: null,
			schedule: "CN · 13:00–14:30",
			sessionsTotal: 8,
			sessionsDone: 0,
			status: "paused",
			startDate: "01/09",
			notes: "",
		},
	],
	syllabi: [
		{
			id: "sy-1",
			name: "Writing 7.0 chuẩn khai",
			level: "Band 7.0",
			skill: "Writing",
			description: "",
			totalLessons: 12,
			modules: [],
		},
	],
	enrollments: [
		{
			id: "en-1",
			classId: "cl-1",
			studentId: "st-2",
			createdAt: "2026-08-01T00:00:00.000Z",
		},
		{
			id: "en-2",
			classId: "cl-1",
			studentId: "st-1",
			createdAt: "2026-08-02T00:00:00.000Z",
		},
		// dangling: student missing from students[] — passes through like the
		// pre-peel adapter; the roster UI filters it at render time.
		{
			id: "en-3",
			classId: "cl-2",
			studentId: "st-9",
			createdAt: "2026-08-03T00:00:00.000Z",
		},
	],
	packages: [],
	lessons: [],
	assignments: [],
	invoices: [],
	reports: [],
	notifs: [],
	commentBank: [],
};

describe("mapClasses", () => {
	const classes = mapClasses(snapshot);

	test("roster derives from enrollments, never a stored id list", () => {
		// fixture order ≠ id order: locks that the output follows snapshot
		// order (server: asc createdAt), not an accidental id sort.
		expect(classes.find((c) => c.id === "cl-1")?.studentIds).toEqual([
			"st-2",
			"st-1",
		]);
	});

	test("dangling enrollment passes through to the roster", () => {
		// student filtered at render ($classId roster tab), not by the mapper —
		// characterization for waves 4/5 that may revisit enrollment material.
		expect(classes.find((c) => c.id === "cl-2")?.studentIds).toEqual(["st-9"]);
	});

	test("class without enrollments maps to an empty roster", () => {
		expect(classes.find((c) => c.id === "cl-3")?.studentIds).toEqual([]);
	});

	test("unassigned syllabus (null) maps to empty string", () => {
		expect(classes.find((c) => c.id === "cl-2")?.syllabusId).toBe("");
		expect(classes.find((c) => c.id === "cl-1")?.syllabusId).toBe("sy-1");
	});

	test("keeps display fields; sessionsDone derives (stored 4, 0 completed lessons → 0)", () => {
		expect(classes.find((c) => c.id === "cl-1")).toMatchObject({
			name: "IELTS Writing 7.0 — Nhóm tối",
			level: "Band 7.0",
			type: "ielts",
			skills: ["Writing", "Speaking"],
			mode: "Online",
			schedule: "T3 & T5 · 19:00–20:30",
			sessionsDone: 0,
			sessionsTotal: 12,
			status: "active",
			startDate: "19/08",
			notes: "Nhóm học nhanh",
		});
	});

	test("communication class maps type and an empty skills array", () => {
		expect(classes.find((c) => c.id === "cl-3")).toMatchObject({
			type: "communication",
			skills: [],
		});
	});

	test("empty org maps to an empty list, never seed", () => {
		const empty: KernelSnapshot = {
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
		};
		expect(mapClasses(empty)).toEqual([]);
	});
});

describe("mapClasses sessionsDone derive (Wave 4)", () => {
	const snapshot: KernelSnapshot = {
		students: [],
		classes: [
			{
				id: "cl-1",
				name: "1:2 tối",
				level: "",
				type: "ielts",
				skills: [],
				mode: "Online",
				syllabusId: null,
				schedule: "",
				sessionsTotal: 12,
				sessionsDone: 99, // stored value must be ignored entirely
				status: "active",
				startDate: "",
				notes: "",
			},
			{
				id: "cl-2",
				name: "Chưa học buổi nào",
				level: "",
				type: "communication",
				skills: [],
				mode: "Online",
				syllabusId: null,
				schedule: "",
				sessionsTotal: 10,
				sessionsDone: 0,
				status: "active",
				startDate: "",
				notes: "",
			},
		],
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
			// 1:2 session: both enrollments completed the same (day,time) slot.
			lessonRow("les-a", "cl-1", "en-1", 2, "19:00", "completed"),
			lessonRow("les-b", "cl-1", "en-2", 2, "19:00", "completed"),
			// A distinct delivered session.
			lessonRow("les-c", "cl-1", "en-1", 4, "09:00", "completed"),
			// Upcoming and cancelled rows never count.
			lessonRow("les-d", "cl-1", "en-1", 5, "19:00", "upcoming"),
			lessonRow("les-e", "cl-1", "en-2", 6, "20:00", "cancelled"),
			// A half-checked 1:2 still counts as one delivered session.
			lessonRow("les-f", "cl-1", "en-1", 7, "21:00", "completed"),
			lessonRow("les-g", "cl-1", "en-2", 7, "21:00", "upcoming"),
		],
		assignments: [],
		invoices: [],
		reports: [],
		notifs: [],
		commentBank: [],
	};

	test("counts distinct (day,time) pairs of completed lessons, not rows", () => {
		const classes = mapClasses(snapshot);
		expect(classes.find((c) => c.id === "cl-1")?.sessionsDone).toBe(3);
	});

	test("class without completed lessons derives 0 regardless of the stored column", () => {
		const classes = mapClasses(snapshot);
		expect(classes.find((c) => c.id === "cl-2")?.sessionsDone).toBe(0);
	});
});

function lessonRow(
	id: string,
	classId: string,
	enrollmentId: string,
	day: number,
	time: string,
	status: string,
): KernelSnapshot["lessons"][number] {
	return {
		id,
		classId,
		enrollmentId,
		day,
		time,
		dur: 60,
		type: "1:2",
		status,
		topic: "",
		zoom: "",
	};
}
