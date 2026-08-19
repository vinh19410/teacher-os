import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapInvoices } from "./invoices";

const base: KernelSnapshot = {
	students: [],
	classes: [],
	syllabi: [],
	enrollments: [],
	packages: [],
	lessons: [],
	invoices: [],
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
			},
		]);
	});

	test("coerces an invalid persisted status to unpaid", () => {
		const [mapped] = mapInvoices({
			...base,
			invoices: [
				{
					id: "INV-bad",
					studentId: "student-1",
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
