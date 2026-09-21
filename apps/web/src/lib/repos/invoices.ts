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
		status: coerceStatus(row.status),
		date: row.date,
		type: row.type,
		method: row.method,
		due: row.due,
		note: row.note,
	}));
}
