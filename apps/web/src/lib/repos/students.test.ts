/*
 * Students read repo (Wave 1) — pure mapping units.
 * The kernel snapshot is the only input; the provider wires transport.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapStudents } from "./students";

const snapshot: KernelSnapshot = {
	assignmentPrompts: [],
	classAssignments: [],
	students: [
		{
			id: "st-1",
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			email: "minhanh@test.local",
			zalo: "0912345678",
			parentName: "Nguyễn Văn Hùng",
			parentPhone: "0987 654 321",
		},
		{
			id: "st-2",
			name: "Vũ Thảo Vy",
			phone: "",
			email: "",
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
	lessons: [],
	assignments: [],
	invoices: [],
	reports: [],
	notifs: [],
	commentBank: [],
};

describe("mapStudents", () => {
	const students = mapStudents(snapshot);

	test("keeps display fields and avatar initials", () => {
		expect(students.find((s) => s.id === "st-1")).toMatchObject({
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			email: "minhanh@test.local",
			hasPackage: true,
			zalo: "0912345678",
			parent: { name: "Nguyễn Văn Hùng", phone: "0987 654 321" },
			avatar: "MA",
		});
		expect(students.find((s) => s.id === "st-2")).toMatchObject({
			name: "Vũ Thảo Vy",
			phone: "",
			email: "",
			hasPackage: false,
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
			assignmentPrompts: [],
			classAssignments: [],
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
		expect(mapStudents(empty)).toEqual([]);
	});
});

describe("mapStudents pkg derive (Wave 4)", () => {
	// st-1 holds two entitlements: an old inactive one (en-old) and the
	// displayed newest active one (en-new). st-2 shares a 1:2 class session
	// via en-peer.
	const snapshot: KernelSnapshot = {
		assignmentPrompts: [],
		classAssignments: [],
		students: [
			{
				id: "st-1",
				name: "A",
				phone: "",
				email: "a@test.local",
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
				id: "en-old",
				classId: "cl-old",
				studentId: "st-1",
				status: "active",
				createdAt: "2026-07-01T00:00:00.000Z",
			},
			{
				id: "en-new",
				classId: "cl-new",
				studentId: "st-1",
				status: "active",
				createdAt: "2026-08-01T00:00:00.000Z",
			},
			{
				id: "en-peer",
				classId: "cl-12",
				studentId: "st-2",
				status: "active",
				createdAt: "2026-08-02T00:00:00.000Z",
			},
		],
		packages: [
			{
				id: "pk-old",
				enrollmentId: "en-old",
				classId: "cl-old",
				studentId: "st-1",
				total: 6,
				price: 0,
				mode: "Online",
				start: "",
				expiry: "",
				status: "inactive",
				createdAt: "2026-07-01T00:00:00.000Z",
			},
			{
				id: "pk-new",
				enrollmentId: "en-new",
				classId: "cl-new",
				studentId: "st-1",
				total: 10,
				price: 0,
				mode: "Online",
				start: "",
				expiry: "",
				status: "active",
				createdAt: "2026-08-01T00:00:00.000Z",
			},
		],
		lessons: [
			lessonRow("l1", "en-new", "completed"),
			lessonRow("l2", "en-new", "completed"),
			lessonRow("l3", "en-new", "upcoming"),
			// Completed on the OLD enrollment: never touches the displayed pkg.
			lessonRow("l4", "en-old", "completed"),
			// 1:2 peer completed a shared session: only en-peer's entitlement moves.
			lessonRow("l5", "en-peer", "completed"),
		],
		assignments: [],
		invoices: [],
		reports: [],
		notifs: [],
		commentBank: [],
	};

	test("done/remaining derive from completed lessons of the displayed enrollment only", () => {
		expect(
			mapStudents(snapshot).find((s) => s.id === "st-1")?.pkg,
		).toMatchObject({
			total: 10,
			done: 2,
			remaining: 8,
		});
	});

	test("1:2 check-in on the peer enrollment never moves the other side's pkg", () => {
		const students = mapStudents(snapshot);
		// st-2 has no active package row in this fixture: zero package.
		expect(students.find((s) => s.id === "st-2")?.pkg).toMatchObject({
			total: 0,
			done: 0,
			remaining: 0,
		});
		// And st-1's displayed numbers are untouched by the peer completion.
		expect(students.find((s) => s.id === "st-1")?.pkg).toMatchObject({
			done: 2,
			remaining: 8,
		});
	});
});

function lessonRow(
	id: string,
	enrollmentId: string,
	status: string,
): KernelSnapshot["lessons"][number] {
	return {
		id,
		classId: "cl-x",
		enrollmentId,
		day: 2,
		time: "19:00",
		dur: 60,
		date: null,
		type: "1:1",
		status,
		topic: "",
		zoom: "",
	};
}

describe("mapStudents parked package (issue #104)", () => {
	// st-1 owns a parked package: created from /students with no class, so
	// enrollmentId is null and nothing can ever be checked in against it.
	const snapshot: KernelSnapshot = {
		assignmentPrompts: [],
		classAssignments: [],
		students: [
			{
				id: "st-1",
				name: "QC-104",
				phone: "",
				email: "",
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
				id: "pk-parked",
				enrollmentId: null,
				classId: null,
				studentId: "st-1",
				total: 10,
				price: 400000,
				mode: "Online",
				start: "28/08",
				expiry: "",
				status: "active",
				createdAt: "2026-08-28T00:00:00.000Z",
			},
		],
		lessons: [lessonRow("ls-orphan", "en-ghost", "completed")],
		assignments: [],
		invoices: [],
		reports: [],
		notifs: [],
		commentBank: [],
	};

	test("parked package displays total/price and never counts done", () => {
		expect(mapStudents(snapshot).find((s) => s.id === "st-1")?.pkg).toEqual({
			total: 10,
			done: 0,
			remaining: 10,
			price: 400000,
			mode: "Online",
			start: "28/08",
			expiry: "",
		});
	});
});
