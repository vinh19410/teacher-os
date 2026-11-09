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
	return students.filter(
		(s) => s.hasPackage && s.pkg.total > 0 && s.pkg.remaining <= 4,
	).length;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cộng/trừ `days` ngày trên mốc UTC midnight của chuỗi ISO `yyyy-mm-dd`.
 * Giữ nguyên chuỗi đầu vào nếu không phải ngày lịch hợp lệ (`isValidDue`). */
export function addDaysISO(iso: string, days: number): string {
	if (!isValidDue(iso)) return iso;
	return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS)
		.toISOString()
		.slice(0, 10);
}

/** Số tiền còn nợ thực tế của một hóa đơn: `max(0, amount - invoiceReceived)`.
 * Hóa đơn `paid` hoặc `paidAmount >= amount` (overpay clamp #340) đều trả 0. */
export function invoiceRemaining(
	invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
): number {
	return Math.max(0, invoice.amount - invoiceReceived(invoice));
}

export type DebtStatus = "overdue" | "due_soon" | "due" | "clear";
export type DebtFilterStatus = "overdue" | "due" | "clear";

export interface DebtsSearch {
	status?: DebtFilterStatus;
	q?: string;
	lop?: string;
}

export interface DebtLedgerRow {
	studentId: string;
	name: string;
	classNames: string[];
	totalDue: number;
	totalPaid: number;
	remaining: number;
	/** due hợp lệ (isValidDue) sớm nhất của hóa đơn còn nợ; null nếu không có. */
	nextDue: string | null;
	status: DebtStatus;
	/** Các hóa đơn còn nợ (invoiceRemaining > 0), sort theo due hợp lệ tăng dần. */
	openInvoiceIds: string[];
}

export interface DebtLedgerKpis {
	receivable: { amount: number; students: number };
	collected: { amount: number; students: number };
	overdue: { amount: number; students: number };
}

export interface DebtLedgerResult {
	rows: DebtLedgerRow[];
	kpis: DebtLedgerKpis;
	counts: Record<"all" | "overdue" | "due" | "clear", number>;
}

function normalizeViText(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d")
		.replace(/Đ/g, "D")
		.toLowerCase();
}

/**
 * Trạng thái nợ của học viên (TOS-15 D4, ưu tiên từ trên xuống trên các hóa đơn
 * có `invoiceRemaining > 0`):
 * - `overdue` nếu có ≥ 1 hóa đơn còn nợ thỏa `effectiveInvoiceStatus === "overdue"`
 * - `due_soon` nếu có ≥ 1 hóa đơn còn nợ với `todayISO <= due <= todayISO + 7`
 * - `due` nếu còn nợ khác (`due > todayISO + 7` hoặc `due` rỗng/không hợp lệ)
 * - `clear` nếu không còn hóa đơn nào có `invoiceRemaining > 0`
 */
export function debtStatusOf(
	invoices: Pick<Invoice, "amount" | "paidAmount" | "status" | "due">[],
	todayISO: string,
): DebtStatus {
	const open = invoices.filter((inv) => invoiceRemaining(inv) > 0);
	if (open.length === 0) return "clear";
	const dueSoonUpper = addDaysISO(todayISO, 7);
	let hasDueSoon = false;
	for (const inv of open) {
		if (effectiveInvoiceStatus(inv, todayISO) === "overdue") {
			return "overdue";
		}
		if (isValidDue(inv.due) && inv.due >= todayISO && inv.due <= dueSoonUpper) {
			hasDueSoon = true;
		}
	}
	return hasDueSoon ? "due_soon" : "due";
}

export interface DebtLedgerInput {
	invoices: Array<
		Pick<
			Invoice,
			"id" | "sid" | "eid" | "amount" | "paidAmount" | "status" | "due"
		> & { createdAt?: number }
	>;
	students: Array<
		Pick<Student, "id" | "name"> & { phone?: string; email?: string }
	>;
	enrollments: Array<RosterEnrollmentRef & { status?: string }>;
	classes: Array<Pick<ClassGroup, "id" | "name">>;
	todayISO: string;
	classId?: string;
	q?: string;
	status?: DebtFilterStatus;
}

/**
 * View-model Sổ công nợ học viên (TOS-15 #449):
 * 1. Lọc hóa đơn theo `classId` (qua `inv.eid -> enrollment.classId` tồn tại trong `classes`).
 * 2. Gom theo học viên có ≥ 1 hóa đơn và lọc theo từ khóa `q` (họ tên, email, SĐT — bỏ dấu).
 * 3. Tính `kpis` và `counts` trên tập dòng sau khi lọc lớp + tìm kiếm, TRƯỚC chip `status` (D5).
 * 4. Lọc `rows` theo chip `status` (`status = "due"` gộp cả `due_soon` và `due`).
 */
export function debtLedger(input: DebtLedgerInput): DebtLedgerResult {
	const classById = new Map(input.classes.map((c) => [c.id, c]));
	const classOrder = new Map(input.classes.map((c, idx) => [c.id, idx]));

	const enrollmentById = new Map<
		string,
		RosterEnrollmentRef & { status?: string }
	>();
	const activeClassesByStudent = new Map<string, Set<string>>();
	for (const e of input.enrollments) {
		if (!classById.has(e.classId)) continue;
		enrollmentById.set(e.id, e);
		if (e.status === undefined || e.status === "active") {
			const set = activeClassesByStudent.get(e.studentId) ?? new Set<string>();
			set.add(e.classId);
			activeClassesByStudent.set(e.studentId, set);
		}
	}

	const classFilter = input.classId?.trim() ?? "";
	const scopedInvoices = classFilter
		? input.invoices.filter(
				(inv) => enrollmentById.get(inv.eid)?.classId === classFilter,
			)
		: input.invoices;

	const invoicesByStudent = new Map<string, DebtLedgerInput["invoices"]>();
	for (const inv of scopedInvoices) {
		const list = invoicesByStudent.get(inv.sid);
		if (list) {
			list.push(inv);
		} else {
			invoicesByStudent.set(inv.sid, [inv]);
		}
	}

	const queryTokens = normalizeViText(input.q?.trim() ?? "")
		.split(/\s+/)
		.filter(Boolean);

	const preStatusRows: DebtLedgerRow[] = [];
	let receivableAmount = 0;
	let collectedAmount = 0;
	let overdueAmount = 0;
	const counts: Record<"all" | "overdue" | "due" | "clear", number> = {
		all: 0,
		overdue: 0,
		due: 0,
		clear: 0,
	};

	for (const student of input.students) {
		const stuInvoices = invoicesByStudent.get(student.id);
		if (!stuInvoices || stuInvoices.length === 0) continue;

		if (queryTokens.length > 0) {
			const haystack = normalizeViText(
				[student.name, student.email, student.phone].filter(Boolean).join(" "),
			);
			if (!queryTokens.every((token) => haystack.includes(token))) {
				continue;
			}
		}

		let totalDue = 0;
		let totalPaid = 0;
		let studentOverdueAmount = 0;
		const classIdSet = new Set<string>();
		const openInvoices: DebtLedgerInput["invoices"] = [];

		for (const inv of stuInvoices) {
			const received = invoiceReceived(inv);
			const rem = Math.max(0, inv.amount - received);
			totalDue += inv.amount;
			totalPaid += received;
			const enrollment = enrollmentById.get(inv.eid);
			if (enrollment) {
				classIdSet.add(enrollment.classId);
			}
			if (rem > 0) {
				openInvoices.push(inv);
				if (effectiveInvoiceStatus(inv, input.todayISO) === "overdue") {
					studentOverdueAmount += rem;
				}
			}
		}

		if (classIdSet.size === 0 && !classFilter) {
			for (const cid of activeClassesByStudent.get(student.id) ?? []) {
				classIdSet.add(cid);
			}
		}

		const classNames = Array.from(classIdSet)
			.sort((a, b) => (classOrder.get(a) ?? 0) - (classOrder.get(b) ?? 0))
			.map((cid) => classById.get(cid)?.name ?? "")
			.filter(Boolean);

		openInvoices.sort((a, b) => {
			const validA = isValidDue(a.due);
			const validB = isValidDue(b.due);
			if (validA !== validB) return validA ? -1 : 1;
			if (validA && validB && a.due !== b.due) {
				return a.due < b.due ? -1 : 1;
			}
			const ca = a.createdAt ?? 0;
			const cb = b.createdAt ?? 0;
			if (ca !== cb) return ca - cb;
			return a.id.localeCompare(b.id);
		});

		const firstOpen = openInvoices[0];
		const nextDue =
			firstOpen && isValidDue(firstOpen.due) ? firstOpen.due : null;
		const remaining = Math.max(0, totalDue - totalPaid);
		const status = debtStatusOf(stuInvoices, input.todayISO);

		const row: DebtLedgerRow = {
			studentId: student.id,
			name: student.name,
			classNames,
			totalDue,
			totalPaid,
			remaining,
			nextDue,
			status,
			openInvoiceIds: openInvoices.map((inv) => inv.id),
		};

		preStatusRows.push(row);
		receivableAmount += totalDue;
		collectedAmount += totalPaid;
		overdueAmount += studentOverdueAmount;
		counts.all += 1;
		if (status === "overdue") {
			counts.overdue += 1;
		} else if (status === "due_soon" || status === "due") {
			counts.due += 1;
		} else {
			counts.clear += 1;
		}
	}

	const rows =
		input.status === undefined
			? preStatusRows
			: preStatusRows.filter((r) => {
					if (input.status === "overdue") return r.status === "overdue";
					if (input.status === "due")
						return r.status === "due_soon" || r.status === "due";
					return r.status === "clear";
				});

	return {
		rows,
		kpis: {
			receivable: { amount: receivableAmount, students: counts.all },
			collected: { amount: collectedAmount, students: counts.clear },
			overdue: { amount: overdueAmount, students: counts.overdue },
		},
		counts,
	};
}

/**
 * Parse tham số URL `?status=overdue|due|clear&q=&lop=<classId>` cho `/debts` (D6).
 * Hỗ trợ alias tương thích wireframe (`due_soon -> due`, `paid -> clear`);
 * giá trị lạ rơi về `undefined` (không throw, không redirect).
 */
export function validateDebtsSearch(
	search: Record<string, unknown>,
): DebtsSearch {
	const rawStatus = search.status;
	const status: DebtFilterStatus | undefined =
		rawStatus === "overdue" || rawStatus === "due" || rawStatus === "clear"
			? rawStatus
			: rawStatus === "due_soon"
				? "due"
				: rawStatus === "paid"
					? "clear"
					: undefined;
	const rawQ = typeof search.q === "string" ? search.q : "";
	const q = rawQ.trim().length > 0 ? rawQ : undefined;
	const rawLop = typeof search.lop === "string" ? search.lop.trim() : "";
	const lop = rawLop.length > 0 ? rawLop : undefined;
	return { status, q, lop };
}
