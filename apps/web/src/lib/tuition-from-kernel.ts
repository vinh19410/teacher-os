/** Tuition KPIs and due-date formatting from kernel-mapped store data
 * (issues #62/#135) — pure helpers, same pattern as dashboard-from-kernel. */
import type { Invoice, Student } from "./mock-data";
import { formatDayMonth, isValidISODate } from "./week-grid";

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
			collected += invoice.amount;
		} else {
			// unpaid and overdue are both money not yet received; anything else
			// (coerced legacy statuses) errs on the outstanding side.
			outstanding += invoice.amount;
		}
	}
	return { collected, outstanding };
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
	/** Sum of unpaid + overdue invoice amounts (VND) for this class. */
	outstanding: number;
	/** All invoices of the class's enrollments, any status — để phân biệt
	 * "Đã đủ" (có hóa đơn, đã thu đủ) với "—" (chưa có hóa đơn nào). */
	invoiceCount: number;
}

/**
 * Roster-tab debt (#216): tiền chưa thu của từng học viên CHỈ theo
 * enrollment của lớp đã cho. Invoices của lớp khác và legacy rows
 * (`eid: ""`) không tính; status ≠ "paid" đều là chưa thu, cùng convention
 * với tuitionTotals. Edge đã biết: học viên rời lớp rồi enroll lại thì hóa
 * đơn cũ trỏ enrollmentId đã xóa (invoice.enrollmentId là text, không FK)
 * và không được đếm — chấp nhận vì hóa đơn đó thuộc enrollment cũ.
 */
export function rosterDebtByStudent(
	classId: string,
	enrollments: RosterEnrollmentRef[],
	invoices: Pick<Invoice, "eid" | "amount" | "status">[],
): Map<string, RosterDebt> {
	const eidToSid = new Map<string, string>();
	for (const e of enrollments) {
		if (e.classId === classId) eidToSid.set(e.id, e.studentId);
	}
	const acc = new Map<string, RosterDebt>();
	for (const inv of invoices) {
		const sid = eidToSid.get(inv.eid);
		if (!sid) continue;
		const cur = acc.get(sid) ?? { outstanding: 0, invoiceCount: 0 };
		cur.invoiceCount += 1;
		if (inv.status !== "paid") cur.outstanding += inv.amount;
		acc.set(sid, cur);
	}
	return acc;
}

/**
 * Students whose remaining sessions put them in a "Sắp hết" badge row of the
 * packages table: the table badges danger at ≤2 and warn at ≤4 with the same
 * label, so the KPI counts ≤4 to never contradict the table below it.
 */
export function packagesEndingSoon(students: Student[]): number {
	return students.filter((s) => s.pkg.remaining <= 4).length;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `dd/mm` from the wire's ISO due date. String slicing only — the repo has
 * a past UTC-drift bug from Date-parsing date-only strings (see week-grid).
 * Empty/legacy dues and non-ISO junk render an em dash. */
export function formatDue(iso: string): string {
	if (!ISO_DATE_RE.test(iso) || !isValidISODate(iso)) return "—";
	return formatDayMonth(iso);
}
