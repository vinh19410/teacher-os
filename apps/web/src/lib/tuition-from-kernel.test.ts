import { describe, expect, test } from "vitest";
import type { Invoice, Student } from "./mock-data";
import {
	effectiveInvoiceStatus,
	formatDue,
	packagesEndingSoon,
	rosterDebtByStudent,
	tuitionTotals,
} from "./tuition-from-kernel";

function student(id: string, remaining: number, hasPackage = true): Student {
	return {
		id,
		name: id,
		phone: "",
		email: "",
		hasPackage,
		zalo: "",
		parent: { name: "", phone: "" },
		targetBand: "—",
		skills: [],
		examDate: "",
		pkg: {
			total: 10,
			done: 10 - remaining,
			remaining,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		},
		tags: [],
		notes: "",
		avatar: "X",
		atRisk: false,
	};
}

function invoice(partial: Partial<Invoice> & Pick<Invoice, "status">): Invoice {
	return {
		id: "INV-1",
		sid: "s1",
		eid: "",
		amount: 1000000,
		date: "",
		type: "",
		method: "—",
		due: "",
		note: "",
		...partial,
	};
}

describe("tuitionTotals", () => {
	test("empty ledger totals zero — QC re-test #62", () => {
		expect(tuitionTotals([])).toEqual({ collected: 0, outstanding: 0 });
	});

	test("paid sums collected; unpaid and overdue sum outstanding", () => {
		const invoices = [
			invoice({ status: "paid", amount: 5400000 }),
			invoice({ status: "unpaid", amount: 900000 }),
			invoice({ status: "overdue", amount: 1000000 }),
		];
		expect(tuitionTotals(invoices)).toEqual({
			collected: 5400000,
			outstanding: 1900000,
		});
	});

	test("coerced or unknown statuses count as outstanding, never collected", () => {
		const invoices = [
			invoice({ status: "paid", amount: 500000 }),
			invoice({ status: "unpaid", amount: 250000 }),
			invoice({ status: "overdue", amount: 250000 }),
		];
		const totals = tuitionTotals(invoices);
		expect(totals.collected + totals.outstanding).toBe(1000000);
	});
});

describe("packagesEndingSoon", () => {
	test("empty roster counts zero", () => {
		expect(packagesEndingSoon([])).toBe(0);
	});

	// ≤4 matches every row the packages table badges "Sắp hết" (danger ≤2,
	// warn ≤4 share the label) — KPI must not contradict the table below it.
	test("counts remaining 4 and below, not 5", () => {
		const students = [student("s-2", 2), student("s-4", 4), student("s-5", 5)];
		expect(packagesEndingSoon(students)).toBe(2);
	});
	test("students without package (hasPackage: false) are not counted even if remaining is 0", () => {
		const students = [student("s-no-pkg", 0, false), student("s-2", 2)];
		expect(packagesEndingSoon(students)).toBe(1);
	});
});

describe("formatDue", () => {
	test("formats a valid ISO due date as dd/mm", () => {
		expect(formatDue("2026-09-15")).toBe("15/09");
	});

	test("empty legacy due renders an em dash", () => {
		expect(formatDue("")).toBe("—");
	});

	test("non-ISO strings render an em dash instead of NaN", () => {
		expect(formatDue("15/09/2026")).toBe("—");
		expect(formatDue("not-a-date")).toBe("—");
	});

	test("calendar-invalid dates roll no fake day — em dash", () => {
		expect(formatDue("2026-02-30")).toBe("—");
	});
});

describe("effectiveInvoiceStatus (#322)", () => {
	const TODAY = "2026-10-05";

	test("paid stays paid regardless of due", () => {
		expect(
			effectiveInvoiceStatus({ status: "paid", due: "2026-01-01" }, TODAY),
		).toBe("paid");
	});

	test("unpaid past due derives overdue", () => {
		expect(
			effectiveInvoiceStatus({ status: "unpaid", due: "2026-10-04" }, TODAY),
		).toBe("overdue");
	});

	// Hạn đúng hôm nay chưa quá hạn — so chuỗi ISO, không parse Date.
	test("unpaid due today or tomorrow stays unpaid", () => {
		expect(
			effectiveInvoiceStatus({ status: "unpaid", due: TODAY }, TODAY),
		).toBe("unpaid");
		expect(
			effectiveInvoiceStatus({ status: "unpaid", due: "2026-10-06" }, TODAY),
		).toBe("unpaid");
	});

	test("empty or calendar-invalid due stays unpaid", () => {
		expect(effectiveInvoiceStatus({ status: "unpaid", due: "" }, TODAY)).toBe(
			"unpaid",
		);
		expect(
			effectiveInvoiceStatus({ status: "unpaid", due: "2026-02-30" }, TODAY),
		).toBe("unpaid");
	});

	test("stored overdue stays overdue even with a future due", () => {
		expect(
			effectiveInvoiceStatus({ status: "overdue", due: "2030-01-01" }, TODAY),
		).toBe("overdue");
	});
});

describe("rosterDebtByStudent (#216)", () => {
	const enrollments = [
		{ id: "E1", classId: "C1", studentId: "S1" },
		{ id: "E2", classId: "C2", studentId: "S1" },
		{ id: "E3", classId: "C1", studentId: "S2" },
	];
	const TODAY = "2026-10-05";

	test("paid invoices count toward invoiceCount but not outstanding", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[{ eid: "E1", amount: 400000, status: "paid", due: "" }],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 0,
			invoiceCount: 1,
			status: "paid",
		});
	});

	test("unpaid and overdue both add to outstanding", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{ eid: "E1", amount: 400000, status: "unpaid", due: "" },
				{ eid: "E1", amount: 100000, status: "overdue", due: "" },
				{ eid: "E1", amount: 50000, status: "unpaid", due: "" },
			],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 550000,
			invoiceCount: 3,
			status: "overdue",
		});
	});

	test("invoices of other classes and legacy empty-eid rows are excluded", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{ eid: "E2", amount: 999000, status: "unpaid", due: "" }, // class C2
				{ eid: "", amount: 500000, status: "unpaid", due: "" }, // legacy
				{ eid: "E-DELETED", amount: 250000, status: "unpaid", due: "" }, // unknown
			],
			TODAY,
		);
		expect(debts.size).toBe(0);
	});

	test("multiple invoices of one student accumulate", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{ eid: "E1", amount: 400000, status: "unpaid", due: "" },
				{ eid: "E1", amount: 300000, status: "unpaid", due: "" },
				{ eid: "E3", amount: 250000, status: "unpaid", due: "" },
			],
			TODAY,
		);
		expect(debts.get("S1")?.outstanding).toBe(700000);
		expect(debts.get("S1")?.status).toBe("unpaid");
		expect(debts.get("S2")?.outstanding).toBe(250000);
	});

	test("students without invoices are absent from the map", () => {
		const debts = rosterDebtByStudent("C1", enrollments, [], TODAY);
		expect(debts.has("S1")).toBe(false);
		expect(debts.has("S2")).toBe(false);
	});

	test("one past-due unpaid invoice marks the whole class debt overdue (#322)", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{ eid: "E1", amount: 400000, status: "unpaid", due: "2026-11-04" },
				{ eid: "E1", amount: 400000, status: "unpaid", due: "2026-10-04" },
			],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 800000,
			invoiceCount: 2,
			status: "overdue",
		});
	});

	test("a past-due invoice of another class does not taint this class status", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{ eid: "E1", amount: 400000, status: "unpaid", due: "2026-11-04" },
				{ eid: "E2", amount: 900000, status: "unpaid", due: "2026-01-01" },
			],
			TODAY,
		);
		expect(debts.get("S1")?.status).toBe("unpaid");
		expect(debts.get("S1")?.outstanding).toBe(400000);
	});
});
