import {
	INVOICE_PAYMENT_METHOD_LABEL,
	type InvoicePaymentMethod,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { invoice } from "@teacher-os/db/schema/invoice";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../app";
import { recomputeInvoiceStatement } from "./recompute-invoice";

/**
 * Same correlated fragment as `recompute-invoice.ts`: only matched rows are
 * money received. Unmatched rows with a set `invoice_id` (e.g. `invoice_paid`
 * rejections from the bank ingest) are not.
 */
const MATCHED_LEDGER_SUM = sql`(SELECT COALESCE(SUM(amount), 0) FROM payment_transaction
	WHERE invoice_id = invoice.id AND match_status = 'matched')`;

export interface ManualPaymentInput {
	orgId: string;
	invoiceId: string;
	userId: string;
	/** Dialog-generated idempotency key — stored as provider_txn_id. */
	clientRequestId: string;
	amount: number;
	method: InvoicePaymentMethod;
	note: string;
}

export type ManualPaymentOutcome =
	| {
			kind: "created" | "replayed";
			id: string;
			paidAmount: number;
			remaining: number;
			status: string;
	  }
	/** The invoice was (or just became) fully paid — no row written. */
	| { kind: "settled" }
	/** The receipt does not fit the remaining matched debt — no row written. */
	| { kind: "exceeds"; remaining: number }
	/**
	 * The clientRequestId already exists for this org but names a different
	 * invoice or amount. The unique index is global (not org-scoped), so the
	 * replay lookup must match invoice + amount before returning any payload.
	 */
	| { kind: "key-conflict" };

async function readInvoice(
	db: Db,
	orgId: string,
	invoiceId: string,
): Promise<{ amount: number; paidAmount: number; status: string } | undefined> {
	const [row] = await db
		.select({
			amount: invoice.amount,
			paidAmount: invoice.paidAmount,
			status: invoice.status,
		})
		.from(invoice)
		.where(and(eq(invoice.id, invoiceId), eq(invoice.orgId, orgId)))
		.limit(1);
	return row;
}

function toResult(
	id: string,
	inv: { amount: number; paidAmount: number; status: string },
): {
	id: string;
	paidAmount: number;
	remaining: number;
	status: string;
} {
	return {
		id,
		paidAmount: inv.paidAmount,
		remaining: Math.max(0, inv.amount - Math.min(inv.paidAmount, inv.amount)),
		status: inv.status,
	};
}

/**
 * Record one manual tuition receipt (issue #450) as a single matched ledger
 * row and recompute the invoice — one source of truth for "Đã đóng".
 *
 * The INSERT…SELECT carries both guards inside the same statement
 * (`status <> 'paid'` and `amount ≤ invoice.amount − matched_ledger_sum`),
 * so two concurrent receipts — or a receipt racing a bare mark-paid write —
 * can never overpay: the loser's INSERT selects zero rows. The recompute runs
 * unconditionally in the same batch; it is idempotent, so the blocked path
 * leaves the invoice untouched. `.returning()` (not a row count) reads the
 * outcome identically on D1 and libsql, and the SELECT's trailing WHERE keeps
 * the INSERT…SELECT…ON CONFLICT grammar unambiguous.
 */
export async function recordManualPayment(
	db: Db,
	input: ManualPaymentInput,
): Promise<ManualPaymentOutcome> {
	const [insertRows] = await db.batch([
		db
			.insert(paymentTransaction)
			.select(
				db
					.select({
						// Drizzle requires insert-select field lists to match the
						// table definition exactly (same fields, same order).
						id: sql<string>`'payman-' || lower(hex(randomblob(12)))`.as("id"),
						orgId: sql`${input.orgId}`.as("org_id"),
						provider: sql`'manual'`.as("provider"),
						providerTxnId: sql`${input.clientRequestId}`.as("provider_txn_id"),
						bankAccountXid: sql`''`.as("bank_account_xid"),
						amount: sql`${input.amount}`.as("amount"),
						content: sql`${input.note}`.as("content"),
						referenceCode: sql`''`.as("reference_code"),
						transactionDate: sql`${`${vietnamTodayISO()} 00:00:00`}`.as(
							"transaction_date",
						),
						paymentCode: sql`null`.as("payment_code"),
						invoiceId: sql`${input.invoiceId}`.as("invoice_id"),
						matchStatus: sql`'matched'`.as("match_status"),
						unmatchedReason: sql`''`.as("unmatched_reason"),
						raw: sql`''`.as("raw"),
						method: sql`${input.method}`.as("method"),
						recordedBy: sql`${input.userId}`.as("recorded_by"),
						createdAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
							"created_at",
						),
					})
					.from(invoice)
					.where(
						and(
							eq(invoice.id, input.invoiceId),
							eq(invoice.orgId, input.orgId),
							sql`${invoice.status} <> 'paid'`,
							sql`${input.amount} <= ${invoice.amount} - ${MATCHED_LEDGER_SUM}`,
						),
					),
			)
			.onConflictDoNothing()
			.returning({ id: paymentTransaction.id }),
		recomputeInvoiceStatement(
			db,
			input.orgId,
			input.invoiceId,
			INVOICE_PAYMENT_METHOD_LABEL[input.method],
		),
	]);

	const firstRow = insertRows[0];
	if (firstRow) {
		const inv = await readInvoice(db, input.orgId, input.invoiceId);
		if (!inv) return { kind: "settled" };
		return {
			kind: "created",
			...toResult(firstRow.id, inv),
		};
	}

	// Zero rows: either the guard blocked the insert or the unique
	// (provider, provider_txn_id) key replayed. Disambiguate by lookup.
	const [prior] = await db
		.select({
			id: paymentTransaction.id,
			invoiceId: paymentTransaction.invoiceId,
			amount: paymentTransaction.amount,
		})
		.from(paymentTransaction)
		.where(
			and(
				eq(paymentTransaction.provider, "manual"),
				eq(paymentTransaction.providerTxnId, input.clientRequestId),
				eq(paymentTransaction.orgId, input.orgId),
			),
		)
		.limit(1);
	if (
		prior &&
		prior.invoiceId === input.invoiceId &&
		prior.amount === input.amount
	) {
		const inv = await readInvoice(db, input.orgId, input.invoiceId);
		if (!inv) return { kind: "key-conflict" };
		return { kind: "replayed", ...toResult(prior.id, inv) };
	}
	if (prior) return { kind: "key-conflict" };

	const inv = await readInvoice(db, input.orgId, input.invoiceId);
	if (!inv) return { kind: "settled" };
	if (inv.status === "paid") return { kind: "settled" };
	return {
		kind: "exceeds",
		remaining: Math.max(0, inv.amount - Math.min(inv.paidAmount, inv.amount)),
	};
}
