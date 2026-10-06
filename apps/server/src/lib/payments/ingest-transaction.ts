import {
	extractPaymentCode,
	PAYMENT_CODE_RE,
} from "@teacher-os/api/lib/payment-code";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../../app";
import type { BankHubContext } from "../bank-hub/bank-hub-client";
import { recomputeInvoiceStatement } from "./recompute-invoice";

/** Typed wrapper over the untyped raw-result surface of the D1 driver. */
async function runRows<T>(db: Db, query: SQL): Promise<T[]> {
	return (await db.all(query)) as T[];
}

export interface IngestInput {
	transactionId: string;
	transferType: string;
	amount: number;
	bankAccountXid: string;
	content: string;
	paymentCode: string | null;
	referenceCode: string;
	transactionDate: string;
	/** Original payload JSON — stored only while the row stays unmatched. */
	rawJson: string;
}

export type IngestResult = "matched" | "unmatched" | "skipped" | "api-error";

export interface IngestOptions {
	/**
	 * IPN path: false (whitelisted keyword upstream; no-code traffic is not
	 * tuition). Reconciliation path: true — no-code credits land in the
	 * unmatched queue as `no_code` so the teacher can assign them.
	 */
	saveNoCode: boolean;
}

/**
 * Single write path for every inbound transaction (IPN, reconciliation,
 * future pulls). One D1 batch: the ledger insert decides match status with
 * scalar subqueries evaluated in the same statement (no read/write race
 * window under SQLite's single-writer model), then the invoice is recomputed
 * from the ledger.
 *
 * "api-error" means org resolution needed the Bank Hub API and the API
 * failed — the caller acks (IPN: SePay never retries 5xx) and the
 * reconciliation sweep over all account xids recovers the row later.
 */
export async function ingestTransaction(
	db: Db,
	hub: BankHubContext | undefined,
	input: IngestInput,
	opts: IngestOptions,
): Promise<IngestResult> {
	if (input.transferType !== "credit") return "skipped";
	if (!Number.isInteger(input.amount) || input.amount <= 0) return "skipped";

	const scannedCode =
		(input.paymentCode && PAYMENT_CODE_RE.test(input.paymentCode)
			? input.paymentCode.toUpperCase()
			: null) ?? extractPaymentCode(input.content);
	if (!scannedCode && !opts.saveNoCode) return "skipped";

	// Resolve the owning org by the receiving account; a relinked (old)
	// account falls back through the Bank Hub API to the company → org row.
	const linked = await runRows<{ org_id: string }>(
		db,
		sql`SELECT org_id FROM org_bank_link WHERE bank_account_xid = ${input.bankAccountXid} LIMIT 1`,
	);
	let orgId = linked[0]?.org_id;
	if (!orgId) {
		if (!hub) return "skipped";
		try {
			const account = await hub.client.getBankAccount(input.bankAccountXid);
			const viaCompany = await runRows<{ org_id: string }>(
				db,
				sql`SELECT org_id FROM org_bank_link WHERE company_xid = ${account.companyXid} LIMIT 1`,
			);
			orgId = viaCompany[0]?.org_id;
		} catch {
			return "api-error";
		}
		if (!orgId) return "skipped";
	}

	// Match the code within that org only — a valid code of ANOTHER org never
	// touches its invoice; the foreign_code classification happens in SQL.
	let invoiceId: string | null = null;
	if (scannedCode) {
		const own = await runRows<{ id: string }>(
			db,
			sql`SELECT id FROM invoice WHERE payment_code = ${scannedCode} AND org_id = ${orgId} LIMIT 1`,
		);
		invoiceId = own[0]?.id ?? null;
	}

	// Single atomic batch: insert (idempotent on provider+txn id) + recompute.
	// Match status / reason / raw are evaluated by SQL CASE expressions inside
	// the same INSERT — no read-modify-write window.
	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db
			.insert(paymentTransaction)
			.values({
				id: crypto.randomUUID(),
				orgId,
				providerTxnId: input.transactionId,
				bankAccountXid: input.bankAccountXid,
				amount: input.amount,
				content: input.content,
				referenceCode: input.referenceCode,
				transactionDate: input.transactionDate,
				paymentCode: scannedCode,
				invoiceId,
				matchStatus: sql`CASE
					WHEN ${scannedCode} IS NOT NULL AND ${invoiceId} IS NOT NULL
						THEN CASE WHEN (SELECT invoice.status = 'paid' AND invoice.paid_amount >= invoice.amount
						               FROM invoice WHERE invoice.id = ${invoiceId})
							THEN 'unmatched' ELSE 'matched' END
					ELSE 'unmatched' END`,
				unmatchedReason: sql`CASE
					WHEN ${scannedCode} IS NULL THEN 'no_code'
					WHEN ${invoiceId} IS NULL THEN
						CASE WHEN (SELECT 1 FROM invoice WHERE invoice.payment_code = ${scannedCode}) IS NOT NULL
							THEN 'foreign_code' ELSE 'unknown_code' END
					WHEN (SELECT invoice.status = 'paid' AND invoice.paid_amount >= invoice.amount
					      FROM invoice WHERE invoice.id = ${invoiceId}) THEN 'invoice_paid'
					ELSE '' END`,
				raw: sql`CASE WHEN ${invoiceId} IS NULL THEN ${input.rawJson} ELSE '' END`,
			})
			.onConflictDoNothing(),
	];
	if (invoiceId) {
		statements.push(recomputeInvoiceStatement(db, orgId, invoiceId));
	}
	await db.batch(statements);

	return invoiceId ? "matched" : "unmatched";
}

/** Reconciliation pulls reuse the same matching rules as the IPN path. */
export function clientTransactionToIngest(t: {
	transactionId: string;
	transferType: string;
	amount: number;
	bankAccountXid: string;
	content: string;
	paymentCode: string | null;
	referenceCode: string;
	transactionDate: string;
}): IngestInput {
	return {
		transactionId: t.transactionId,
		transferType: t.transferType,
		amount: t.amount,
		bankAccountXid: t.bankAccountXid,
		content: t.content,
		paymentCode: t.paymentCode,
		referenceCode: t.referenceCode,
		transactionDate: t.transactionDate,
		rawJson: JSON.stringify(t),
	};
}
