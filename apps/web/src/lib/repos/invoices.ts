/** Invoice snapshot mapping shared by Tuition, Dashboard, and student detail. */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { Invoice, InvoiceStatus } from "@/lib/mock-data";

const INVOICE_STATUSES: readonly InvoiceStatus[] = [
	"paid",
	"overdue",
	"unpaid",
];

function coerceStatus(value: string): InvoiceStatus {
	return (INVOICE_STATUSES as readonly string[]).includes(value)
		? (value as InvoiceStatus)
		: "unpaid";
}

export function mapInvoices(snapshot: KernelSnapshot): Invoice[] {
	return snapshot.invoices.map((row) => ({
		id: row.id,
		sid: row.studentId,
		eid: row.enrollmentId,
		amount: row.amount,
		paidAmount: row.paidAmount,
		status: coerceStatus(row.status),
		date: row.date,
		type: row.type,
		method: row.method,
		due: row.due,
		note: row.note,
		// #343 — ISO wire → ms; unparseable/missing (deploy skew) falls back
		// to 0 so revenueByPeriod can count the row as dropped instead of
		// crashing on NaN math.
		createdAt: Date.parse(row.createdAt) || 0,
	}));
}
