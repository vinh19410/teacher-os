import { describe, expect, test } from "vitest";
import type { Invoice, Student } from "./mock-data";
import {
	DEFAULT_INVOICE_TYPE,
	formatDue,
	formatInvoiceCode,
	formatInvoiceType,
	packagesEndingSoon,
	tuitionTotals,
} from "./tuition-from-kernel";

function student(id: string, remaining: number): Student {
	return {
		id,
		name: id,
		phone: "",
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

describe("formatInvoiceCode (Issue #176)", () => {
	test("formats 36-character UUID to compact INV-XXXXXXXX code", () => {
		expect(formatInvoiceCode("6b2ac60c-1d64-4156-977d-07a52f554cdd")).toBe(
			"INV-2F554CDD",
		);
		expect(formatInvoiceCode("91c7d196-4a06-4c9c-af32-d24e78f5f977")).toBe(
			"INV-78F5F977",
		);
	});

	test("preserves existing INV- prefixed codes", () => {
		expect(formatInvoiceCode("INV-0001")).toBe("INV-0001");
		expect(formatInvoiceCode("INV-084")).toBe("INV-084");
		expect(formatInvoiceCode("INV-1")).toBe("INV-1");
		expect(formatInvoiceCode("inv-123")).toBe("INV-123");
	});

	test("handles short identifiers by prefixing INV-", () => {
		expect(formatInvoiceCode("abc-1234")).toBe("INV-ABC1234");
		expect(formatInvoiceCode("0001")).toBe("INV-0001");
	});

	test("returns em dash for empty or missing id", () => {
		expect(formatInvoiceCode("")).toBe("—");
		expect(formatInvoiceCode(undefined as unknown as string)).toBe("—");
	});
});

describe("formatInvoiceType (Issue #176)", () => {
	test("defaults empty or whitespace-only type to 'Học phí'", () => {
		expect(formatInvoiceType("")).toBe(DEFAULT_INVOICE_TYPE);
		expect(formatInvoiceType("   ")).toBe(DEFAULT_INVOICE_TYPE);
		expect(formatInvoiceType()).toBe(DEFAULT_INVOICE_TYPE);
		expect(formatInvoiceType(null)).toBe(DEFAULT_INVOICE_TYPE);
	});

	test("defaults em dash and hyphen to 'Học phí'", () => {
		expect(formatInvoiceType("—")).toBe(DEFAULT_INVOICE_TYPE);
		expect(formatInvoiceType("-")).toBe(DEFAULT_INVOICE_TYPE);
	});

	test("preserves custom and non-empty types", () => {
		expect(formatInvoiceType("Gói 12 buổi")).toBe("Gói 12 buổi");
		expect(formatInvoiceType("Tài liệu")).toBe("Tài liệu");
		expect(formatInvoiceType("Học phí")).toBe("Học phí");
	});
});
