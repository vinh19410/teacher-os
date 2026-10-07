/** Tuition KPIs and due-date formatting from kernel-mapped store data
 * (issues #62/#135) — pure helpers, same pattern as dashboard-from-kernel. */
import type { Invoice, InvoiceStatus, Student } from "./mock-data";
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

export function tuitionTotals(invoices: Invoice[]): TuitionTotals {
	let collected = 0;
	let outstanding = 0;
	for (const invoice of invoices) {
		if (invoice.status === "paid") {
			// A paid invoice counts in full: mark-paid manual rows keep
			// paidAmount 0 (teacher collected by another channel), so the
			// status — not the ledger — drives the KPI for paid invoices.
			collected += invoice.amount;
		} else {
			// unpaid and overdue split by the ledger's partial progress (#320);
			// anything else (coerced legacy statuses) errs on outstanding.
			const received = Math.min(invoice.paidAmount, invoice.amount);
			collected += received;
			outstanding += invoice.amount - received;
		}
	}
	return { collected, outstanding };
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

/** `dd/mm` from the wire's ISO due date. String slicing only — the repo has
 * a past UTC-drift bug from Date-parsing date-only strings (see week-grid).
 * Empty/legacy dues and non-ISO junk render an em dash. */
export function formatDue(iso: string): string {
	if (!isValidDue(iso)) return "—";
	return formatDayMonth(iso);
}
