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
