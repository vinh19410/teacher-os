import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapInvoices } from "./invoices";

const base: KernelSnapshot = {
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

describe("mapInvoices", () => {
	test("maps the student relation to the display sid", () => {
		expect(
			mapInvoices({
				...base,
				invoices: [
					{
						id: "INV-1",
						studentId: "student-1",
						due: "2026-08-19",
						note: "",
						enrollmentId: "enr-1",
						amount: 500000,
						status: "paid",
						date: "19/08",
						type: "Gói buổi",
						method: "CK",
					},
				],
			}),
		).toEqual([
			{
				id: "INV-1",
				sid: "student-1",
				amount: 500000,
				status: "paid",
				date: "19/08",
				type: "Gói buổi",
				method: "CK",
				due: "2026-08-19",
				note: "",
			},
		]);
	});

	// Issue #135 — the wire carries the ISO due date and the operator note;
	// the web Invoice type must keep both verbatim (dd/mm is a render concern).
	test("maps the ISO due date and note through unchanged", () => {
		expect(
			mapInvoices({
				...base,
				invoices: [
					{
						id: "INV-2",
						studentId: "student-2",
						due: "2026-09-15",
						note: "Học phí tháng 9",
						enrollmentId: "enr-2",
						amount: 400000,
						status: "unpaid",
						date: "01/09",
						type: "Theo tháng",
						method: "—",
					},
				],
			}),
		).toEqual([
			{
				id: "INV-2",
				sid: "student-2",
				amount: 400000,
				status: "unpaid",
				date: "01/09",
				type: "Theo tháng",
				method: "—",
				due: "2026-09-15",
				note: "Học phí tháng 9",
			},
		]);
	});

	test("keeps empty legacy due/note as empty strings", () => {
		const [mapped] = mapInvoices({
			...base,
			invoices: [
				{
					id: "INV-legacy",
					studentId: "student-3",
					due: "",
					note: "",
					enrollmentId: "",
					amount: 900000,
					status: "unpaid",
					date: "",
					type: "",
					method: "—",
				},
			],
		});
		expect(mapped?.due).toBe("");
		expect(mapped?.note).toBe("");
	});

	test("coerces an invalid persisted status to unpaid", () => {
		const [mapped] = mapInvoices({
			...base,
			invoices: [
				{
					id: "INV-bad",
					studentId: "student-1",
					due: "",
					note: "",
					enrollmentId: "",
					amount: 1,
					status: "unknown",
					date: "",
					type: "",
					method: "—",
				},
			],
		});
		expect(mapped?.status).toBe("unpaid");
	});
});
