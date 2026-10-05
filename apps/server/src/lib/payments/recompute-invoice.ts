import { invoice } from "@teacher-os/db/schema/invoice";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../app";

const LEDGER_SUM = sql`(SELECT COALESCE(SUM(amount), 0) FROM payment_transaction
	WHERE invoice_id = invoice.id AND match_status = 'matched')`;

/**
 * Recompute invoice.paid_amount from the ledger and finish the paid
 * transition. Always recomputed (never +=) so replays, reconciliation and
 * manual assignment are idempotent. Status never leaves `paid` once there —
 * the compatibility lock with manual mark-paid is preserved, and a
 * ledger-paid invoice keeps `method = "Chuyển khoản"` while a mark-paid one
 * keeps the teacher's value. The correlated subquery references
 * `invoice.id` so the fragment is valid inside the UPDATE.
 */
export function recomputeInvoiceStatement(
	db: Db,
	orgId: string,
	invoiceId: string,
) {
	return db
		.update(invoice)
		.set({
			paidAmount: LEDGER_SUM,
			status: sql`CASE
				WHEN ${invoice.status} = 'paid' THEN 'paid'
				WHEN ${LEDGER_SUM} >= ${invoice.amount} THEN 'paid'
				ELSE ${invoice.status} END`,
			method: sql`CASE
				WHEN ${invoice.status} <> 'paid' AND ${LEDGER_SUM} >= ${invoice.amount} THEN 'Chuyển khoản'
				ELSE ${invoice.method} END`,
		})
		.where(and(eq(invoice.id, invoiceId), eq(invoice.orgId, orgId)));
}
