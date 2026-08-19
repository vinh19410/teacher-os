/**
 * Students read repo (Wave 1) — pure mapping units.
 * The kernel snapshot is the only input; the provider wires transport.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapStudents } from "./students";

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
	classes: [],
	syllabi: [],
	enrollments: [],
	packages: [
		{
			id: "pk-old",
			enrollmentId: "en-0",
			classId: "cl-0",
			studentId: "st-1",
			total: 6,
			price: 300000,
			mode: "Offline",
			start: "01/07",
			expiry: "",
			status: "inactive",
			createdAt: "2026-07-01T00:00:00.000Z",
		},
		{
			id: "pk-new",
			enrollmentId: "en-1",
			classId: "cl-1",
			studentId: "st-1",
			total: 12,
			price: 450000,
			mode: "Online",
			start: "01/08",
			expiry: "15/11",
			status: "active",
			createdAt: "2026-08-01T00:00:00.000Z",
		},
	],
};

describe("mapStudents", () => {
	const students = mapStudents(snapshot);

	test("keeps display fields and avatar initials", () => {
		expect(students.find((s) => s.id === "st-1")).toMatchObject({
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			zalo: "0912345678",
			parent: { name: "Nguyễn Văn Hùng", phone: "0987 654 321" },
			avatar: "MA",
		});
	});

	test("pkg comes from the newest ACTIVE package only", () => {
		expect(students.find((s) => s.id === "st-1")?.pkg).toMatchObject({
			total: 12,
			done: 0,
			remaining: 12,
			price: 450000,
			mode: "Online",
			start: "01/08",
			expiry: "15/11",
		});
	});

	test("classless student maps to the zero package", () => {
		expect(students.find((s) => s.id === "st-2")?.pkg).toEqual({
			total: 0,
			done: 0,
			remaining: 0,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		});
	});

	test("empty org maps to an empty list, never seed", () => {
		const empty: KernelSnapshot = {
			students: [],
			classes: [],
			syllabi: [],
			enrollments: [],
			packages: [],
		};
		expect(mapStudents(empty)).toEqual([]);
	});
});
