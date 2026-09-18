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

export const DEFAULT_INVOICE_TYPE = "Học phí";

/**
 * Format invoice identifier for human-readable display (Issue #176).
 * Preserves existing formatted codes (e.g. `INV-081`, `INV-0001`).
 * For raw UUIDs or long identifiers, formats as `INV-` plus the last 8
 * characters (uppercased) so table columns stay compact and scannable.
 */
export function formatInvoiceCode(id: string): string {
	if (!id) return "—";
	if (/^inv-/i.test(id)) return id.toUpperCase();
	const clean = id.replace(/-/g, "");
	const suffix = clean.length > 8 ? clean.slice(-8) : clean;
	return `INV-${suffix.toUpperCase()}`;
}

/**
 * Format invoice type label for table display (Issue #176).
 * Empty strings, em dashes, or whitespace-only values receive the default
 * clear label ("Học phí"). Custom values (e.g. "Gói 12 buổi") are preserved.
 */
export function formatInvoiceType(type?: string | null): string {
	const trimmed = type?.trim();
	if (!trimmed || trimmed === "—" || trimmed === "-") {
		return DEFAULT_INVOICE_TYPE;
	}
	return trimmed;
}
