import { describe, expect, it, test } from "vitest";
import type { Invoice, Student } from "./mock-data";
import {
	effectiveInvoiceStatus,
	formatDue,
	packagesEndingSoon,
	revenueByPeriod,
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
		paidAmount: 0,
		date: "",
		type: "",
		method: "—",
		due: "",
		note: "",
		createdAt: Date.parse("2026-01-10T09:00:00+07:00"),
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
			[{ eid: "E1", amount: 400000, paidAmount: 0, status: "paid", due: "" }],
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
				{ eid: "E1", amount: 400000, paidAmount: 0, status: "unpaid", due: "" },
				{
					eid: "E1",
					amount: 100000,
					paidAmount: 0,
					status: "overdue",
					due: "",
				},
				{ eid: "E1", amount: 50000, paidAmount: 0, status: "unpaid", due: "" },
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
				{ eid: "E2", amount: 999000, paidAmount: 0, status: "unpaid", due: "" }, // class C2
				{ eid: "", amount: 500000, paidAmount: 0, status: "unpaid", due: "" }, // legacy
				{
					eid: "E-DELETED",
					amount: 250000,
					paidAmount: 0,
					status: "unpaid",
					due: "",
				}, // unknown
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
				{ eid: "E1", amount: 400000, paidAmount: 0, status: "unpaid", due: "" },
				{ eid: "E1", amount: 300000, paidAmount: 0, status: "unpaid", due: "" },
				{ eid: "E3", amount: 250000, paidAmount: 0, status: "unpaid", due: "" },
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
				{
					eid: "E1",
					amount: 400000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-11-04",
				},
				{
					eid: "E1",
					amount: 400000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-10-04",
				},
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
				{
					eid: "E1",
					amount: 400000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-11-04",
				},
				{
					eid: "E2",
					amount: 900000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-01-01",
				},
			],
			TODAY,
		);
		expect(debts.get("S1")?.status).toBe("unpaid");
		expect(debts.get("S1")?.outstanding).toBe(400000);
	});

	// #340 — partial ledger payments subtract paidAmount, same clamp
	// convention as tuitionTotals (#320).
	test("partial payment subtracts paidAmount from outstanding", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{
					eid: "E1",
					amount: 10000000,
					paidAmount: 2000000,
					status: "unpaid",
					due: "",
				},
			],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 8000000,
			invoiceCount: 1,
			status: "unpaid",
		});
	});

	test("partial payment with past due is overdue with remaining outstanding", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{
					eid: "E1",
					amount: 10000000,
					paidAmount: 2000000,
					status: "unpaid",
					due: "2026-10-04",
				},
			],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 8000000,
			invoiceCount: 1,
			status: "overdue",
		});
	});

	test("paidAmount above the amount clamps outstanding to zero, status stays unpaid", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{
					eid: "E1",
					amount: 400000,
					paidAmount: 500000,
					status: "unpaid",
					due: "",
				},
			],
			TODAY,
		);
		expect(debts.get("S1")).toEqual({
			outstanding: 0,
			invoiceCount: 1,
			status: "unpaid",
		});
	});

	test("partial and fully-unpaid invoices of one student accumulate remaining", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{
					eid: "E1",
					amount: 10000000,
					paidAmount: 2000000,
					status: "unpaid",
					due: "",
				},
				{
					eid: "E1",
					amount: 1000000,
					paidAmount: 0,
					status: "unpaid",
					due: "",
				},
			],
			TODAY,
		);
		expect(debts.get("S1")?.outstanding).toBe(9000000);
		expect(debts.get("S1")?.status).toBe("unpaid");
	});

	test("clamp applies per invoice, not on the summed total", () => {
		const debts = rosterDebtByStudent(
			"C1",
			enrollments,
			[
				{
					eid: "E1",
					amount: 400000,
					paidAmount: 500000,
					status: "unpaid",
					due: "",
				},
				{
					eid: "E1",
					amount: 1000000,
					paidAmount: 200000,
					status: "unpaid",
					due: "",
				},
			],
			TODAY,
		);
		// 0 (overpay clamp) + 800000 (partial) — a clamp-on-total refactor
		// would wrongly yield 700000 here.
		expect(debts.get("S1")?.outstanding).toBe(800000);
	});
});

describe("tuitionTotals with partial ledger payments (#320)", () => {
	function inv(overrides: Partial<Invoice>): Invoice {
		return {
			id: "INV-P",
			sid: "s1",
			eid: "",
			amount: 500000,
			paidAmount: 0,
			status: "unpaid",
			date: "",
			type: "",
			method: "—",
			due: "",
			note: "",
			createdAt: Date.parse("2026-01-10T09:00:00+07:00"),
			...overrides,
		};
	}

	it("splits unpaid invoices by the ledger's paidAmount", () => {
		const { collected, outstanding } = tuitionTotals([
			inv({ paidAmount: 200000 }),
		]);
		expect(collected).toBe(200000);
		expect(outstanding).toBe(300000);
	});

	it("counts a paid invoice in full even when paidAmount lags (mark-paid)", () => {
		const { collected, outstanding } = tuitionTotals([
			inv({ status: "paid", paidAmount: 0 }),
		]);
		expect(collected).toBe(500000);
		expect(outstanding).toBe(0);
	});

	it("clamps a paidAmount above the amount defensively", () => {
		const { collected, outstanding } = tuitionTotals([
			inv({ paidAmount: 600000 }),
		]);
		expect(collected).toBe(500000);
		expect(outstanding).toBe(0);
	});
});

describe("revenueByPeriod (issue #343)", () => {
	// Mốc "bây giờ" cố định: VN 15/11/2026 — cửa sổ kỳ deterministic.
	const NOW = new Date("2026-11-15T10:00:00+07:00");
	/** ms từ ISO có offset +07:00 tường minh — không phụ thuộc timezone máy test. */
	const vn = (iso: string) => Date.parse(iso);

	test("mark-paid (paidAmount 0) tính full amount — rule tuitionTotals", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "paid",
					paidAmount: 0,
					amount: 5400000,
					createdAt: vn("2026-11-02T09:00:00+07:00"),
				}),
			],
			"month",
			NOW,
		);
		expect(series.dropped).toBe(0);
		expect(series.buckets[series.buckets.length - 1]).toEqual({
			key: "2026-11",
			label: "T11",
			issued: 5400000,
			collected: 5400000,
		});
	});

	test("unpaid thu một phần → collected = min(paidAmount, amount)", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "unpaid",
					amount: 100000,
					paidAmount: 50000,
					createdAt: vn("2026-11-02T09:00:00+07:00"),
				}),
			],
			"month",
			NOW,
		);
		expect(series.buckets[series.buckets.length - 1]).toMatchObject({
			issued: 100000,
			collected: 50000,
		});
	});

	test("unpaid overpaid → collected clamp bằng amount", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "unpaid",
					amount: 100000,
					paidAmount: 150000,
					createdAt: vn("2026-11-02T09:00:00+07:00"),
				}),
			],
			"month",
			NOW,
		);
		expect(series.buckets[series.buckets.length - 1]).toMatchObject({
			issued: 100000,
			collected: 100000,
		});
	});

	test("unpaid 0 đồng → chỉ vào issued", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "unpaid",
					amount: 100000,
					paidAmount: 0,
					createdAt: vn("2026-11-02T09:00:00+07:00"),
				}),
			],
			"month",
			NOW,
		);
		expect(series.buckets[series.buckets.length - 1]).toMatchObject({
			issued: 100000,
			collected: 0,
		});
	});

	test("cửa sổ tháng: 12 bucket liên tục 2025-12 → 2026-11, rỗng vẫn 0/0", () => {
		const series = revenueByPeriod([], "month", NOW);
		expect(series.buckets).toHaveLength(12);
		expect(series.buckets[0]).toMatchObject({ key: "2025-12", label: "T12" });
		expect(series.buckets[11]).toMatchObject({ key: "2026-11", label: "T11" });
		expect(
			series.buckets.every((b) => b.issued === 0 && b.collected === 0),
		).toBe(true);
	});

	test("cửa sổ quý: 8 bucket liên tục 2025-Q1 → 2026-Q4", () => {
		const series = revenueByPeriod([], "quarter", NOW);
		expect(series.buckets.map((b) => b.key)).toEqual([
			"2025-Q1",
			"2025-Q2",
			"2025-Q3",
			"2025-Q4",
			"2026-Q1",
			"2026-Q2",
			"2026-Q3",
			"2026-Q4",
		]);
		expect(series.buckets[7]).toMatchObject({ label: "Q4" });
	});

	test("cửa sổ năm: capped 5 — hóa đơn 2015 ngoài cửa sổ, không tính dropped", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "paid",
					amount: 1000000,
					createdAt: vn("2015-06-10T08:00:00+07:00"),
				}),
			],
			"year",
			NOW,
		);
		expect(series.buckets.map((b) => b.key)).toEqual([
			"2022",
			"2023",
			"2024",
			"2025",
			"2026",
		]);
		expect(series.dropped).toBe(0);
		expect(series.buckets.every((b) => b.issued === 0)).toBe(true);
	});

	test("biên múi giờ: 23:30 VN ngày 31/10 vào bucket T10", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "paid",
					amount: 500000,
					createdAt: vn("2026-10-31T23:30:00+07:00"),
				}),
			],
			"month",
			NOW,
		);
		expect(series.buckets.find((b) => b.key === "2026-10")).toMatchObject({
			label: "T10",
			issued: 500000,
		});
	});

	test("biên múi giờ ngược: 05:00 VN 01/11 (UTC còn 31/10) vào T11, không T10", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "paid",
					amount: 700000,
					createdAt: vn("2026-11-01T05:00:00+07:00"),
				}),
			],
			"month",
			new Date("2026-11-20T10:00:00+07:00"),
		);
		expect(series.buckets.find((b) => b.key === "2026-11")).toMatchObject({
			issued: 700000,
		});
		expect(series.buckets.find((b) => b.key === "2026-10")?.issued).toBe(0);
	});

	test("kỳ quý: hóa đơn tháng 11 vào 2026-Q4 với nhãn Q4", () => {
		const series = revenueByPeriod(
			[
				invoice({
					status: "paid",
					amount: 300000,
					createdAt: vn("2026-11-02T09:00:00+07:00"),
				}),
			],
			"quarter",
			NOW,
		);
		expect(series.buckets[series.buckets.length - 1]).toEqual({
			key: "2026-Q4",
			label: "Q4",
			issued: 300000,
			collected: 300000,
		});
	});

	test("hóa đơn createdAt 0 → loại khỏi bucket + dropped = 1", () => {
		const series = revenueByPeriod(
			[invoice({ status: "paid", amount: 900000, createdAt: 0 })],
			"month",
			NOW,
		);
		expect(series.dropped).toBe(1);
		expect(
			series.buckets.every((b) => b.issued === 0 && b.collected === 0),
		).toBe(true);
	});
});
