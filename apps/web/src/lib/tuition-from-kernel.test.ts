import { describe, expect, it, test } from "vitest";
import type { Invoice, Student } from "./mock-data";
import {
	addDaysISO,
	debtLedger,
	debtStatusOf,
	effectiveInvoiceStatus,
	formatDue,
	invoiceReceived,
	invoiceRemaining,
	packagesEndingSoon,
	revenueByPeriod,
	rosterDebtByStudent,
	studentTuitionSummary,
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

describe("invoiceReceived (#347)", () => {
	test("mark-paid thủ công (paidAmount 0) tính đủ amount", () => {
		expect(
			invoiceReceived({ status: "paid", amount: 2000000, paidAmount: 0 }),
		).toBe(2000000);
	});

	test("unpaid thu một phần → min(paidAmount, amount)", () => {
		expect(
			invoiceReceived({
				status: "unpaid",
				amount: 3000000,
				paidAmount: 1000000,
			}),
		).toBe(1000000);
	});

	test("paidAmount vượt amount trên hóa đơn chưa paid → clamp về amount", () => {
		expect(
			invoiceReceived({
				status: "unpaid",
				amount: 1000000,
				paidAmount: 1500000,
			}),
		).toBe(1000000);
	});
});

describe("studentTuitionSummary (#347)", () => {
	/** Lớp theo đúng thứ tự data.classes. */
	const CLASSES = [
		{ id: "C1", name: "[TEST] Foundation 2", tuitionFee: 10000000 },
		{ id: "C2", name: "IELTS 6.5", tuitionFee: 6000000 },
	];
	const ENROLLMENTS = [
		{ id: "E1", classId: "C1", studentId: "s1", status: "active" },
		{ id: "E2", classId: "C2", studentId: "s1", status: "active" },
	];
	/** Hóa đơn của s1 trỏ enrollment E1/E2, có createdAt cho đủ Invoice. */
	function stuInvoice(
		partial: Partial<Invoice> & Pick<Invoice, "status">,
	): Invoice {
		return invoice({ sid: "s1", ...partial });
	}

	test("một lớp 10tr đã thu 2tr (mark-paid) → Tổng 10tr / Đã đóng 2tr / Còn lại 8tr", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[{ id: "E1", classId: "C1", studentId: "s1", status: "active" }],
			[
				stuInvoice({
					eid: "E1",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.totalFee).toBe(10000000);
		expect(summary.totalPaid).toBe(2000000);
		expect(summary.totalRemaining).toBe(8000000);
		expect(summary.countedClasses).toBe(1);
		expect(summary.classes[0]).toMatchObject({
			classId: "C1",
			className: "[TEST] Foundation 2",
			fee: 10000000,
			paid: 2000000,
			remaining: 8000000,
			overpaid: 0,
			counted: true,
		});
	});

	test("hai lớp active → Tổng cộng dồn 16tr, paid/remaining đúng từng lớp", () => {
		const summary = studentTuitionSummary("s1", CLASSES, ENROLLMENTS, [
			stuInvoice({
				eid: "E1",
				amount: 2000000,
				status: "paid",
				paidAmount: 0,
			}),
			stuInvoice({
				eid: "E2",
				amount: 1000000,
				paidAmount: 1000000,
				status: "paid",
			}),
		]);
		expect(summary.totalFee).toBe(16000000);
		expect(summary.totalPaid).toBe(3000000);
		expect(summary.totalRemaining).toBe(13000000);
		expect(summary.countedClasses).toBe(2);
		expect(summary.classes[0]).toMatchObject({ classId: "C1", paid: 2000000 });
		expect(summary.classes[1]).toMatchObject({ classId: "C2", paid: 1000000 });
	});

	test("thu một phần qua ledger: unpaid 3tr / paidAmount 1tr → paid 1tr", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "E1",
					amount: 3000000,
					paidAmount: 1000000,
					status: "unpaid",
				}),
			],
		);
		expect(summary.totalPaid).toBe(1000000);
		expect(summary.totalRemaining).toBe(9000000);
	});

	test("mark-paid thủ công giữ paidAmount 0 vẫn tính đủ amount", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "E1",
					amount: 4000000,
					paidAmount: 0,
					status: "paid",
				}),
			],
		);
		expect(summary.totalPaid).toBe(4000000);
	});

	test("paidAmount vượt amount trên hóa đơn chưa paid → clamp về amount", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "E1",
					amount: 1000000,
					paidAmount: 1500000,
					status: "unpaid",
				}),
			],
		);
		expect(summary.totalPaid).toBe(1000000);
	});

	test("lớp invited có học phí → counted false, không vào tổng", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[{ id: "E1", classId: "C1", studentId: "s1", status: "invited" }],
			[
				stuInvoice({
					eid: "E1",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.classes[0]).toMatchObject({
			counted: false,
			enrollmentStatus: "invited",
			paid: 2000000,
		});
		expect(summary.totalFee).toBe(0);
		expect(summary.totalPaid).toBe(0);
		expect(summary.countedClasses).toBe(0);
	});

	test("status lạ (pending) → counted false, không vào tổng (red-team #8)", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[{ id: "E1", classId: "C1", studentId: "s1", status: "pending" }],
			[],
		);
		expect(summary.classes[0]).toMatchObject({
			counted: false,
			enrollmentStatus: "pending",
		});
		expect(summary.totalFee).toBe(0);
		expect(summary.countedClasses).toBe(0);
	});

	test("lớp chưa thiết lập học phí → counted false, remaining 0, paid vẫn tính thật", () => {
		const summary = studentTuitionSummary(
			"s1",
			[{ id: "C1", name: "IELTS 6.5", tuitionFee: null }],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "E1",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.classes[0]).toMatchObject({
			fee: null,
			counted: false,
			paid: 2000000,
			remaining: 0,
			overpaid: 0,
		});
		expect(summary.totalFee).toBe(0);
		expect(summary.totalPaid).toBe(0);
		expect(summary.countedClasses).toBe(0);
	});

	test("đóng dư: fee 5tr đã thu 6tr → remaining 0, overpaid 1tr", () => {
		const summary = studentTuitionSummary(
			"s1",
			[{ id: "C1", name: "C1", tuitionFee: 5000000 }],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "E1",
					amount: 4000000,
					status: "paid",
					paidAmount: 0,
				}),
				stuInvoice({
					eid: "E1",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.classes[0]).toMatchObject({
			paid: 6000000,
			remaining: 0,
			overpaid: 1000000,
		});
		expect(summary.totalRemaining).toBe(0);
	});

	test("hóa đơn eid rỗng và trỏ enrollment lạ → unlinkedPaid, không đổi 3 tổng", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[ENROLLMENTS[0]],
			[
				stuInvoice({
					eid: "",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
				stuInvoice({
					eid: "E-DELETED",
					amount: 500000,
					paidAmount: 500000,
					status: "unpaid",
				}),
				stuInvoice({
					eid: "E1",
					amount: 2000000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.unlinkedPaid).toBe(2500000);
		expect(summary.totalFee).toBe(10000000);
		expect(summary.totalPaid).toBe(2000000);
		expect(summary.totalRemaining).toBe(8000000);
	});

	test("hóa đơn và enrollment của học viên khác bị bỏ qua", () => {
		const summary = studentTuitionSummary(
			"s1",
			CLASSES,
			[
				...ENROLLMENTS,
				{ id: "E3", classId: "C1", studentId: "s2", status: "active" },
			],
			[
				stuInvoice({
					sid: "s2",
					eid: "E3",
					amount: 9000000,
					status: "paid",
					paidAmount: 0,
				}),
				stuInvoice({
					sid: "s2",
					eid: "E1",
					amount: 500000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.totalPaid).toBe(0);
		expect(summary.unlinkedPaid).toBe(0);
	});

	test("enrollment trỏ lớp không có trong classes → bỏ qua row, hóa đơn vào unlinkedPaid", () => {
		const summary = studentTuitionSummary(
			"s1",
			[CLASSES[0]],
			[
				ENROLLMENTS[0],
				{ id: "E9", classId: "C-GONE", studentId: "s1", status: "active" },
			],
			[
				stuInvoice({
					eid: "E9",
					amount: 700000,
					status: "paid",
					paidAmount: 0,
				}),
			],
		);
		expect(summary.classes).toHaveLength(1);
		expect(summary.classes[0]?.classId).toBe("C1");
		expect(summary.unlinkedPaid).toBe(700000);
	});

	test("học viên không có lớp → classes rỗng, mọi tổng 0", () => {
		const summary = studentTuitionSummary("s1", CLASSES, [], []);
		expect(summary.classes).toEqual([]);
		expect(summary.totalFee).toBe(0);
		expect(summary.totalPaid).toBe(0);
		expect(summary.totalRemaining).toBe(0);
		expect(summary.countedClasses).toBe(0);
		expect(summary.unlinkedPaid).toBe(0);
	});
});

describe("debtLedger & debtStatusOf (TOS-15 #449)", () => {
	const TODAY = "2026-10-26";

	const CLASSES = [
		{ id: "C1", name: "IELTS 6.5A" },
		{ id: "C2", name: "IELTS 5.0B" },
	];

	const STUDENTS: Student[] = [
		{
			...student("s1", 5),
			name: "Nguyễn Minh Anh",
			phone: "0901112222",
			email: "minhanh@example.com",
		},
		{
			...student("s2", 5),
			name: "Trần Hoàng Nam",
			phone: "0903334444",
			email: "hoangnam@example.com",
		},
		{
			...student("s3", 5),
			name: "Lê Thu Hà",
			phone: "0905556666",
			email: "thuha@example.com",
		},
		{
			...student("s4", 5),
			name: "Đặng Quốc Bảo",
			phone: "0907778888",
			email: "quocbao@example.com",
		},
	];

	const ENROLLMENTS = [
		{ id: "E1", classId: "C1", studentId: "s1", status: "active" },
		{ id: "E2", classId: "C2", studentId: "s2", status: "active" },
		{ id: "E3", classId: "C1", studentId: "s3", status: "active" },
		{ id: "E4", classId: "C2", studentId: "s4", status: "active" },
	];

	test("addDaysISO cộng/trừ ngày theo UTC anchor, giữ nguyên chuỗi nếu không phải ISO hợp lệ", () => {
		expect(addDaysISO("2026-10-26", 7)).toBe("2026-11-02");
		expect(addDaysISO("2026-10-26", -1)).toBe("2026-10-25");
		expect(addDaysISO("2026-02-30", 7)).toBe("2026-02-30");
		expect(addDaysISO("", 7)).toBe("");
	});

	test("học viên có 2 hóa đơn (1 thu một phần qua ledger, 1 mark-paid thủ công paidAmount=0) → tính đúng D3", () => {
		const res = debtLedger({
			todayISO: TODAY,
			students: [STUDENTS[0]],
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices: [
				invoice({
					id: "inv-partial",
					sid: "s1",
					eid: "E1",
					amount: 4_500_000,
					paidAmount: 2_000_000,
					status: "unpaid",
					due: "2026-10-20",
				}),
				invoice({
					id: "inv-manual-paid",
					sid: "s1",
					eid: "E1",
					amount: 1_500_000,
					paidAmount: 0,
					status: "paid",
					due: "2026-10-10",
				}),
			],
		});

		expect(res.rows).toHaveLength(1);
		expect(res.rows[0]).toEqual({
			studentId: "s1",
			name: "Nguyễn Minh Anh",
			classNames: ["IELTS 6.5A"],
			totalDue: 6_000_000,
			totalPaid: 3_500_000,
			remaining: 2_500_000,
			nextDue: "2026-10-20",
			status: "overdue",
			openInvoiceIds: ["inv-partial"],
		});
	});

	test("hóa đơn unpaid có paidAmount >= amount (overpay clamp #340) → invoiceRemaining = 0, trạng thái clear, không vào openInvoiceIds", () => {
		const overpaid = invoice({
			id: "inv-clamp",
			sid: "s1",
			eid: "E1",
			amount: 2_000_000,
			paidAmount: 2_500_000,
			status: "unpaid",
			due: "2026-10-01",
		});
		expect(invoiceRemaining(overpaid)).toBe(0);

		const res = debtLedger({
			todayISO: TODAY,
			students: [STUDENTS[0]],
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices: [overpaid],
		});
		expect(res.rows[0]?.remaining).toBe(0);
		expect(res.rows[0]?.status).toBe("clear");
		expect(res.rows[0]?.openInvoiceIds).toEqual([]);
		expect(res.rows[0]?.nextDue).toBeNull();
		expect(res.kpis.overdue).toEqual({ amount: 0, students: 0 });
		expect(res.kpis.collected).toEqual({ amount: 2_000_000, students: 1 });
	});

	test("trạng thái nợ D4: hôm qua → overdue; hôm nay / +7 → due_soon; +8 → due; due rỗng/sai nhưng còn nợ → due; còn nợ 0 → clear", () => {
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: "2026-10-25",
					}),
				],
				TODAY,
			),
		).toBe("overdue");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: TODAY,
					}),
				],
				TODAY,
			),
		).toBe("due_soon");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: "2026-11-02",
					}),
				],
				TODAY,
			),
		).toBe("due_soon");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: "2026-11-03",
					}),
				],
				TODAY,
			),
		).toBe("due");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: "",
					}),
				],
				TODAY,
			),
		).toBe("due");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "unpaid",
						amount: 1_000_000,
						paidAmount: 0,
						due: "2026-02-30",
					}),
				],
				TODAY,
			),
		).toBe("due");
		expect(
			debtStatusOf(
				[
					invoice({
						status: "paid",
						amount: 1_000_000,
						paidAmount: 1_000_000,
						due: "2026-10-01",
					}),
				],
				TODAY,
			),
		).toBe("clear");
	});

	test("nextDue và openInvoiceIds bỏ qua due rỗng khi chọn hạn sớm nhất (hóa đơn không hạn xếp sau)", () => {
		const res = debtLedger({
			todayISO: TODAY,
			students: [STUDENTS[0]],
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices: [
				invoice({
					id: "inv-no-due",
					sid: "s1",
					eid: "E1",
					amount: 500_000,
					paidAmount: 0,
					status: "unpaid",
					due: "",
					createdAt: 100,
				}),
				invoice({
					id: "inv-later",
					sid: "s1",
					eid: "E1",
					amount: 1_000_000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-11-10",
					createdAt: 200,
				}),
				invoice({
					id: "inv-sooner",
					sid: "s1",
					eid: "E1",
					amount: 1_000_000,
					paidAmount: 0,
					status: "unpaid",
					due: "2026-11-01",
					createdAt: 300,
				}),
			],
		});
		expect(res.rows[0]?.nextDue).toBe("2026-11-01");
		expect(res.rows[0]?.openInvoiceIds).toEqual([
			"inv-sooner",
			"inv-later",
			"inv-no-due",
		]);
	});

	test("chip due trả cả due_soon + due; KPI và counts giữ nguyên khi đổi status nhưng đổi khi lọc classId hoặc q (D5)", () => {
		const invoices = [
			invoice({
				id: "inv-1",
				sid: "s1",
				eid: "E1",
				amount: 4_500_000,
				paidAmount: 2_000_000,
				status: "unpaid",
				due: "2026-10-20", // overdue, remaining 2.5M
			}),
			invoice({
				id: "inv-2",
				sid: "s2",
				eid: "E2",
				amount: 3_800_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-10-29", // due_soon (+3d), remaining 3.8M
			}),
			invoice({
				id: "inv-3",
				sid: "s3",
				eid: "E3",
				amount: 4_500_000,
				paidAmount: 4_500_000,
				status: "paid",
				due: "2026-10-15", // clear
			}),
			invoice({
				id: "inv-4",
				sid: "s4",
				eid: "E4",
				amount: 2_200_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-11-15", // due (> +7d), remaining 2.2M
			}),
		];

		const allRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
		});
		expect(allRes.rows.map((r) => r.studentId)).toEqual([
			"s1",
			"s2",
			"s3",
			"s4",
		]);
		expect(allRes.counts).toEqual({
			all: 4,
			overdue: 1,
			due: 2,
			clear: 1,
		});
		expect(allRes.kpis).toEqual({
			receivable: { amount: 15_000_000, students: 4 },
			collected: { amount: 6_500_000, students: 1 },
			overdue: { amount: 2_500_000, students: 1 },
		});

		// Lọc status="due" trả cả s2 (due_soon) và s4 (due), nhưng KPI và counts không đổi!
		const dueRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			status: "due",
		});
		expect(dueRes.rows.map((r) => r.studentId)).toEqual(["s2", "s4"]);
		expect(dueRes.kpis).toEqual(allRes.kpis);
		expect(dueRes.counts).toEqual(allRes.counts);

		// Lọc status="clear" chỉ còn s3, nhưng KPI quá hạn vẫn giữ 2.500.000đ (D5).
		const clearRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			status: "clear",
		});
		expect(clearRes.rows.map((r) => r.studentId)).toEqual(["s3"]);
		expect(clearRes.kpis).toEqual(allRes.kpis);

		// Lọc theo q ("nguyen minh" không dấu, hoặc email/SĐT) → KPI cập nhật theo tập tìm kiếm.
		const qRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			q: "nguyen minh",
		});
		expect(qRes.rows.map((r) => r.studentId)).toEqual(["s1"]);
		expect(qRes.kpis).toEqual({
			receivable: { amount: 4_500_000, students: 1 },
			collected: { amount: 2_000_000, students: 0 },
			overdue: { amount: 2_500_000, students: 1 },
		});

		const phoneRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			q: "090333",
		});
		expect(phoneRes.rows.map((r) => r.studentId)).toEqual(["s2"]);

		const emailRes = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			q: "THUHA@EXAMPLE",
		});
		expect(emailRes.rows.map((r) => r.studentId)).toEqual(["s3"]);
	});

	test("lọc classId loại hóa đơn eid='' và dangling eid; tổng không lọc khớp tuitionTotals", () => {
		const invoices = [
			invoice({
				id: "inv-c1",
				sid: "s1",
				eid: "E1",
				amount: 4_500_000,
				paidAmount: 2_000_000,
				status: "unpaid",
				due: "2026-10-20",
			}),
			invoice({
				id: "inv-legacy",
				sid: "s1",
				eid: "",
				amount: 1_000_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-10-28",
			}),
			invoice({
				id: "inv-dangling",
				sid: "s2",
				eid: "E-MISSING",
				amount: 2_000_000,
				paidAmount: 500_000,
				status: "unpaid",
				due: "2026-10-29",
			}),
			invoice({
				id: "inv-c2",
				sid: "s3",
				eid: "E3",
				amount: 3_000_000,
				paidAmount: 0,
				status: "paid",
				due: "2026-10-10",
			}),
		];

		const unFiltered = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
		});
		const totals = tuitionTotals(invoices);
		const sumPaid = unFiltered.rows.reduce((s, r) => s + r.totalPaid, 0);
		const sumRem = unFiltered.rows.reduce((s, r) => s + r.remaining, 0);
		expect(sumPaid).toBe(totals.collected);
		expect(sumRem).toBe(totals.outstanding);

		const classFiltered = debtLedger({
			todayISO: TODAY,
			students: STUDENTS,
			classes: CLASSES,
			enrollments: ENROLLMENTS,
			invoices,
			classId: "C1",
		});
		// Chỉ còn hóa đơn gắn E1 (s1) và E3 (s3); inv-legacy của s1 và inv-dangling của s2 bị loại.
		expect(classFiltered.rows.map((r) => r.studentId)).toEqual(["s1", "s3"]);
		expect(classFiltered.rows[0]?.totalDue).toBe(4_500_000);
		expect(classFiltered.kpis.receivable).toEqual({
			amount: 7_500_000,
			students: 2,
		});
	});
});
