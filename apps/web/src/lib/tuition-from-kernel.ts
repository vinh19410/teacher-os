/** Tuition KPIs and due-date formatting from kernel-mapped store data
 * (issues #62/#135) — pure helpers, same pattern as dashboard-from-kernel. */
import type { ClassGroup, Invoice, InvoiceStatus, Student } from "./mock-data";
import { formatDayMonth, isValidISODate } from "./week-grid";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `due` dùng được: đúng dạng yyyy-mm-dd VÀ ngày có thật trên lịch
 * (2026-02-30 bị loại) — dùng chung cho effectiveInvoiceStatus và formatDue. */
function isValidDue(iso: string): boolean {
	return ISO_DATE_RE.test(iso) && isValidISODate(iso);
}

export interface TuitionTotals {
	/** Sum of paid invoice amounts (VND). */
	collected: number;
	/** Sum of unpaid + overdue invoice amounts (VND). */
	outstanding: number;
}

/**
 * Tiền đã thu của MỘT hóa đơn (#347) — cùng rule `tuitionTotals` (#320):
 * `status = "paid"` tính đủ `amount` (mark-paid thủ công giữ `paidAmount` 0,
 * status chứ không phải ledger quyết định), còn lại → `min(paidAmount, amount)`
 * với clamp đề phòng ledger vượt số tiền. Single source cho tuitionTotals,
 * revenueByPeriod và trang chi tiết hóa đơn.
 */
export function invoiceReceived(
	invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
): number {
	if (invoice.status === "paid") return invoice.amount;
	return Math.min(invoice.paidAmount, invoice.amount);
}

export function tuitionTotals(invoices: Invoice[]): TuitionTotals {
	let collected = 0;
	let outstanding = 0;
	for (const invoice of invoices) {
		const received = invoiceReceived(invoice);
		collected += received;
		// unpaid and overdue split by the ledger's partial progress (#320);
		// anything else (coerced legacy statuses) errs on outstanding.
		if (invoice.status !== "paid") {
			outstanding += invoice.amount - received;
		}
	}
	return { collected, outstanding };
}

/** #343 — revenue chart period selector. */
export type RevenuePeriod = "month" | "quarter" | "year";

/** One bar of the revenue chart: a single month/quarter/year window. */
export interface RevenueBucket {
	/** Window identity, sortable: "2026-10" | "2026-Q4" | "2026". */
	key: string;
	/** Short X-axis label: "T10" | "Q4" | "2026". */
	label: string;
	/** Σ invoice amounts issued in the period (VND). */
	issued: number;
	/** Σ collected in the period per the tuitionTotals rule (VND). */
	collected: number;
}

export interface RevenueSeries {
	/** Window buckets, oldest first; empty periods stay at 0/0. */
	buckets: RevenueBucket[];
	/** Invoices excluded because `createdAt` was missing/unparseable —
	 * surfaced via aria-label + console.warn by the chart, never silent. */
	dropped: number;
}

const vnStampFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Vietnam-local calendar parts (y/m/d) of a ms timestamp — mirrors
 * `todayISOVietnam` (week-grid): the UTC clock lags Vietnam by 7h, so
 * bucketing must never run on device-local or UTC wall time. Exported for
 * direct unit testing of the timezone boundary. */
export function vietnamStampParts(ts: number): {
	y: number;
	m: number;
	d: number;
} {
	const parts = vnStampFormatter.formatToParts(new Date(ts));
	const num = (type: string) =>
		Number(parts.find((p) => p.type === type)?.value ?? "0");
	return { y: num("year"), m: num("month"), d: num("day") };
}

const MONTHS_IN_WINDOW = 12;
const QUARTERS_IN_WINDOW = 8;
const YEARS_IN_WINDOW = 5;

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const quarterOf = (m: number) => Math.floor((m - 1) / 3) + 1;

/**
 * Doanh thu theo kỳ phát hành hóa đơn (#343): bucket mỗi hóa đơn vào kỳ
 * `createdAt` (Asia/Ho_Chi_Minh) trong cửa sổ cố định — 12 tháng / 8 quý /
 * 5 năm gần nhất tính cả kỳ hiện tại; kỳ rỗng vẫn trả bucket 0/0, sort tăng
 * dần. Tiền đã thu đi đúng rule `tuitionTotals` từng hóa đơn: `status =
 * "paid"` → full `amount` (mark-paid thủ công giữ `paidAmount` = 0), còn
 * lại → `min(paidAmount, amount)`. Hóa đơn `createdAt` 0/NaN (snapshot cũ
 * deploy skew) bị LOẠI và đếm trong `dropped` — không bao giờ im lặng với
 * chỉ số tài chính; hóa đơn thật ngoài cửa sổ (quá cũ) không tính dropped.
 */
export function revenueByPeriod(
	invoices: Invoice[],
	period: RevenuePeriod,
	now: Date,
): RevenueSeries {
	const today = vietnamStampParts(now.getTime());
	// Buckets start zeroed and accumulate in place — the Map below indexes
	// them by key, so no second pass is needed to merge totals back in.
	const buckets: RevenueBucket[] = [];
	if (period === "month") {
		let cy = today.y;
		let cm = today.m;
		for (let i = 0; i < MONTHS_IN_WINDOW; i += 1) {
			// Prepend keeps the window oldest-first without a reverse pass.
			buckets.unshift({
				key: monthKey(cy, cm),
				label: `T${cm}`,
				issued: 0,
				collected: 0,
			});
			cm -= 1;
			if (cm === 0) {
				cm = 12;
				cy -= 1;
			}
		}
	} else if (period === "quarter") {
		let cy = today.y;
		let cq = quarterOf(today.m);
		for (let i = 0; i < QUARTERS_IN_WINDOW; i += 1) {
			buckets.unshift({
				key: `${cy}-Q${cq}`,
				label: `Q${cq}`,
				issued: 0,
				collected: 0,
			});
			cq -= 1;
			if (cq === 0) {
				cq = 4;
				cy -= 1;
			}
		}
	} else {
		for (let i = YEARS_IN_WINDOW - 1; i >= 0; i -= 1) {
			const y = today.y - i;
			buckets.push({ key: `${y}`, label: `${y}`, issued: 0, collected: 0 });
		}
	}
	const byKey = new Map<string, RevenueBucket>(buckets.map((b) => [b.key, b]));

	let dropped = 0;
	for (const inv of invoices) {
		if (!Number.isFinite(inv.createdAt) || inv.createdAt <= 0) {
			dropped += 1;
			continue;
		}
		const { y, m } = vietnamStampParts(inv.createdAt);
		const key =
			period === "month"
				? monthKey(y, m)
				: period === "quarter"
					? `${y}-Q${quarterOf(m)}`
					: `${y}`;
		const bucket = byKey.get(key);
		// Valid invoice outside the window (older than the window start) —
		// excluded from the chart on purpose, not a dropped row.
		if (!bucket) continue;
		bucket.issued += inv.amount;
		bucket.collected += invoiceReceived(inv);
	}

	return { buckets, dropped };
}

/**
 * Trạng thái hiển thị của một hóa đơn (#322): server chỉ ghi unpaid/paid,
 * không có writer nào chuyển sang "overdue", nên "Quá hạn" suy ra từ `due`
 * (ISO yyyy-mm-dd, so chuỗi — không parse Date, xem tiền lệ UTC-drift ở
 * week-grid). Hạn đúng hôm nay chưa quá hạn; hạn rỗng/không hợp lệ giữ
 * "unpaid". Status lạ (coerced legacy) coi là chưa thu, cùng convention với
 * tuitionTotals.
 */
export function effectiveInvoiceStatus(
	invoice: Pick<Invoice, "status" | "due">,
	todayISO: string,
): InvoiceStatus {
	if (invoice.status === "paid") return "paid";
	if (invoice.status === "overdue") return "overdue";
	const validDue = isValidDue(invoice.due);
	return validDue && invoice.due < todayISO ? "overdue" : "unpaid";
}

/** Structural enrollment ref — KernelEnrollmentRow và mọi fixture test đều
 * gán được, module này không cần import contracts. */
export interface RosterEnrollmentRef {
	id: string;
	classId: string;
	studentId: string;
}

/** Per-student tuition debt scoped to ONE class's enrollments. */
export interface RosterDebt {
	/** Sum of remaining (amount − min(paidAmount, amount)) of unpaid +
	 * overdue invoices (VND) for this class; 0 possible on overpay clamp
	 * while the ledger awaits reconciliation (#340). */
	outstanding: number;
	/** All invoices of the class's enrollments, any status — để phân biệt
	 * "Đã thu" (có hóa đơn, đã thu đủ) với "—" (chưa có hóa đơn nào). */
	invoiceCount: number;
	/** Trạng thái tổng hợp (#322): "overdue" nếu ≥1 hóa đơn quá hạn (kể cả
	 * suy ra từ `due`), else "unpaid" nếu còn nợ, else "paid". */
	status: InvoiceStatus;
}

/**
 * Roster-tab debt (#216): tiền CHƯA THU của từng học viên CHỈ theo
 * enrollment của lớp đã cho. Invoices của lớp khác và legacy rows
 * (`eid: ""`) không tính; status ≠ "paid" đều là chưa thu, cùng convention
 * với tuitionTotals: partial trừ ledger `paidAmount` với clamp `Math.min`
 * (#320/#340), mark-paid thủ công (`paidAmount: 0`, status `paid`) do status
 * quyết định nên không đi qua nhánh trừ. Edge đã biết: học viên rời lớp rồi
 * enroll lại thì hóa đơn cũ trỏ enrollmentId đã xóa (invoice.enrollmentId là
 * text, không FK) và không được đếm — chấp nhận vì hóa đơn đó thuộc
 * enrollment cũ. "Chưa lập phiếu" = học viên KHÔNG có entry trong map (#322).
 */
export function rosterDebtByStudent(
	classId: string,
	enrollments: RosterEnrollmentRef[],
	invoices: Pick<Invoice, "eid" | "amount" | "paidAmount" | "status" | "due">[],
	todayISO: string,
): Map<string, RosterDebt> {
	const eidToSid = new Map<string, string>();
	for (const e of enrollments) {
		if (e.classId === classId) eidToSid.set(e.id, e.studentId);
	}
	const acc = new Map<string, RosterDebt>();
	for (const inv of invoices) {
		const sid = eidToSid.get(inv.eid);
		if (!sid) continue;
		const cur = acc.get(sid) ?? {
			outstanding: 0,
			invoiceCount: 0,
			status: "paid" as InvoiceStatus,
		};
		cur.invoiceCount += 1;
		const eff = effectiveInvoiceStatus(inv, todayISO);
		if (eff !== "paid") {
			cur.outstanding += inv.amount - Math.min(inv.paidAmount, inv.amount);
			if (eff === "overdue" || cur.status === "overdue") {
				cur.status = "overdue";
			} else {
				cur.status = "unpaid";
			}
		}
		acc.set(sid, cur);
	}
	return acc;
}

/**
 * Students whose remaining sessions put them in a "Sắp hết" badge row of the
 * packages table: the table badges danger at ≤2 and warn at ≤4 with the same
 * label, so the KPI counts ≤4 to never contradict the table below it.
 * Students without a package (`hasPackage === false`) are never ending soon.
 */
export function packagesEndingSoon(students: Student[]): number {
	return students.filter((s) => s.hasPackage && s.pkg.remaining <= 4).length;
}

/** Một dòng trong bảng học phí theo lớp của hồ sơ học viên (#347). */
export interface StudentClassTuition {
	classId: string;
	className: string;
	/** "active" | "invited" hoặc status lạ (coerced legacy) — hiển thị như invited. */
	enrollmentStatus: string;
	/** Học phí mỗi học viên của lớp; null = chưa thiết lập. */
	fee: number | null;
	/** Σ `invoiceReceived` trên hóa đơn của enrollment này — tính cho mọi
	 * enrollment, kể cả chưa counted (đã thu trên lớp chưa set phí vẫn phải thấy). */
	paid: number;
	/** fee === null ? 0 : max(0, fee − paid). */
	remaining: number;
	/** fee === null ? 0 : max(0, paid − fee). */
	overpaid: number;
	/** enrollmentStatus === "active" && fee !== null — dòng được cộng vào 3 tổng. */
	counted: boolean;
}

/** Tổng hợp học phí của MỘT học viên theo các lớp đang học (#347). */
export interface StudentTuitionSummary {
	/** Các lớp học viên có enrollment, theo thứ tự data.classes. */
	classes: StudentClassTuition[];
	/** Σ fee các lớp counted — học 2 lớp thì cộng cả 2. */
	totalFee: number;
	/** Σ paid các lớp counted. */
	totalPaid: number;
	/** Σ remaining các lớp counted. */
	totalRemaining: number;
	/** 0 → UI hiện "—" và hướng dẫn thiết lập học phí. */
	countedClasses: number;
	/** Σ tiền đã thu trên hóa đơn của học viên có `eid` không trỏ enrollment
	 * lớp hiện tại (legacy `eid: ""` là nguồn thật; dangling eid giữ phòng hộ
	 * như `rosterDebtByStudent` — server chặn xóa enrollment active). */
	unlinkedPaid: number;
}

/**
 * Tổng hợp học phí theo lớp cho tab Học phí của hồ sơ học viên (#347), theo
 * quy tắc đã chốt: chỉ lớp enrollment `active` CÓ thiết lập học phí được cộng
 * vào 3 tổng; "Đã đóng" từng lớp đi đúng rule `tuitionTotals` qua
 * `invoiceReceived` (mark-paid thủ công tính đủ, thu một phần trừ ledger với
 * clamp); còn lại mỗi lớp = max(0, fee − paid), đóng dư không bù sang lớp
 * khác. Hóa đơn không gắn lớp hiện tại không vào 3 tổng — tiền đã thu của nó
 * về `unlinkedPaid` để UI hiện ghi chú riêng. Caller truyền thẳng `data.*`.
 */
export function studentTuitionSummary(
	studentId: string,
	classes: Pick<ClassGroup, "id" | "name" | "tuitionFee">[],
	enrollments: Array<RosterEnrollmentRef & { status: string }>,
	invoices: Pick<Invoice, "sid" | "eid" | "amount" | "paidAmount" | "status">[],
): StudentTuitionSummary {
	const classById = new Map(classes.map((c) => [c.id, c]));
	// Một enrollment duy nhất cho mỗi (classId, studentId) — unique index bên
	// server — nên tra được theo cả eid lẫn classId; enrollment trỏ lớp không
	// còn trong `classes` bị bỏ qua (không có tên lớp để hiện).
	type EnrollRef = RosterEnrollmentRef & { status: string };
	const enrollmentByEid = new Map<string, EnrollRef>();
	const enrollmentByClass = new Map<string, EnrollRef>();
	for (const e of enrollments) {
		if (e.studentId !== studentId || !classById.has(e.classId)) continue;
		enrollmentByEid.set(e.id, e);
		enrollmentByClass.set(e.classId, e);
	}
	const acc = new Map<string, number>();
	let unlinkedPaid = 0;
	for (const inv of invoices) {
		if (inv.sid !== studentId) continue;
		const enrollment = enrollmentByEid.get(inv.eid);
		if (!enrollment) {
			unlinkedPaid += invoiceReceived(inv);
			continue;
		}
		acc.set(
			enrollment.classId,
			(acc.get(enrollment.classId) ?? 0) + invoiceReceived(inv),
		);
	}
	const classRows: StudentClassTuition[] = [];
	let totalFee = 0;
	let totalPaid = 0;
	let totalRemaining = 0;
	let countedClasses = 0;
	for (const cls of classes) {
		const enrollment = enrollmentByClass.get(cls.id);
		if (!enrollment) continue;
		const paid = acc.get(cls.id) ?? 0;
		const fee = cls.tuitionFee;
		const counted = enrollment.status === "active" && fee !== null;
		const remaining = fee === null ? 0 : Math.max(0, fee - paid);
		const overpaid = fee === null ? 0 : Math.max(0, paid - fee);
		classRows.push({
			classId: cls.id,
			className: cls.name,
			enrollmentStatus: enrollment.status,
			fee,
			paid,
			remaining,
			overpaid,
			counted,
		});
		if (enrollment.status === "active" && fee !== null) {
			countedClasses += 1;
			totalFee += fee;
			totalPaid += paid;
			totalRemaining += remaining;
		}
	}
	return {
		classes: classRows,
		totalFee,
		totalPaid,
		totalRemaining,
		countedClasses,
		unlinkedPaid,
	};
}

/** `dd/mm` from the wire's ISO due date. String slicing only — the repo has
 * a past UTC-drift bug from Date-parsing date-only strings (see week-grid).
 * Empty/legacy dues and non-ISO junk render an em dash. */
export function formatDue(iso: string): string {
	if (!isValidDue(iso)) return "—";
	return formatDayMonth(iso);
}
