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
			skill: "Writing",
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
			skill: "Speaking",
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
			name: "IELTS Reading 6.0 — Trưa",
			level: "Band 6.0",
			skill: "Reading",
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
	assignments: [],
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

	test("keeps display fields incl. notes and stored session counts", () => {
		expect(classes.find((c) => c.id === "cl-1")).toMatchObject({
			name: "IELTS Writing 7.0 — Nhóm tối",
			level: "Band 7.0",
			skill: "Writing",
			mode: "Online",
			schedule: "T3 & T5 · 19:00–20:30",
			sessionsDone: 4,
			sessionsTotal: 12,
			status: "active",
			startDate: "19/08",
			notes: "Nhóm học nhanh",
		});
	});

	test("empty org maps to an empty list, never seed", () => {
		const empty: KernelSnapshot = {
			students: [],
			classes: [],
			syllabi: [],
			enrollments: [],
			packages: [],
			assignments: [],
		};
		expect(mapClasses(empty)).toEqual([]);
	});
});
