import {
	extractPaymentCode,
	PAYMENT_CODE_RE,
} from "@teacher-os/api/lib/payment-code";
import { normalizeBankAccountNumber } from "@teacher-os/api/lib/vietnam-banks";
import { matchesTkpVa } from "@teacher-os/api/lib/vietqr";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../../app";
import type { SepayTransaction } from "../sepay/sepay-client";
import { recomputeInvoiceStatement } from "./recompute-invoice";

/** Typed wrapper over the untyped raw-result surface of the D1 driver. */
async function runRows<T>(db: Db, query: SQL): Promise<T[]> {
	return (await db.all(query)) as T[];
}

export interface IngestInput {
	provider?: "sepay" | "sepay_bankhub";
	transactionId: string;
	transferType: string;
	amount: number;
	accountNumber: string;
	subAccount?: string;
	/** Truyền sẵn khi gọi từ đường reconcile (đã scope theo org); đường webhook tự resolve theo STK. */
	orgId?: string;
	content: string;
	paymentCode: string | null;
	referenceCode: string;
	transactionDate: string;
	/** Original payload JSON — stored only while the row stays unmatched. */
	rawJson: string;
}

export type IngestResult = "matched" | "unmatched" | "skipped";

export interface IngestOptions {
	/**
	 * Webhook path: false (skip no-code traffic so non-tuition transfers do not
	 * clutter the queue). Reconciliation path: true — no-code credits land in
	 * the unmatched queue as `no_code` so the teacher can assign them.
	 */
	saveNoCode: boolean;
}

function parsePastAccounts(raw: string | null | undefined): string[] {
	try {
		const parsed: unknown = JSON.parse(raw || "[]");
		return Array.isArray(parsed)
			? parsed
					.filter((x): x is string => typeof x === "string")
					.map((x) => normalizeBankAccountNumber(x).toLowerCase())
					.filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

async function resolveOrgIdByAccount(
	db: Db,
	input: {
		accountNumber: string;
		subAccount: string;
		content: string;
	},
): Promise<string | undefined> {
	const accLower = input.accountNumber.toLowerCase();
	const subLower = input.subAccount.toLowerCase();
	const candidates = Array.from(new Set([subLower, accLower].filter(Boolean)));
	if (candidates.length === 0) return undefined;

	const linkedRows = await runRows<{
		org_id: string;
		account_number: string;
		va_code: string;
	}>(
		db,
		sql`SELECT org_id, account_number, va_code FROM org_bank_link WHERE status = 'linked' AND account_number != ''`,
	);

	// Ưu tiên org có cấu hình mã VA theo nội dung (TKP, VD: MMY): phải khớp cả STK gốc lẫn VA/TKPMMY
	for (const row of linkedRows) {
		const vaCode = row.va_code.trim();
		if (!vaCode) continue;
		const normalized = normalizeBankAccountNumber(
			row.account_number,
		).toLowerCase();
		if (
			normalized &&
			normalized === accLower &&
			matchesTkpVa({
				vaCode,
				subAccount: input.subAccount,
				content: input.content,
			})
		) {
			return row.org_id;
		}
	}

	// Org không dùng TKP VA: khớp trực tiếp theo STK gốc hoặc VA số truyền thống (subAccount)
	for (const row of linkedRows) {
		if (row.va_code.trim() !== "") continue;
		const normalized = normalizeBankAccountNumber(
			row.account_number,
		).toLowerCase();
		if (normalized && candidates.includes(normalized)) {
			return row.org_id;
		}
	}

	const pastRows = await runRows<{
		org_id: string;
		past_bank_account_xids: string;
	}>(
		db,
		sql`SELECT org_id, past_bank_account_xids FROM org_bank_link WHERE past_bank_account_xids != '[]'`,
	);
	for (const row of pastRows) {
		const past = parsePastAccounts(row.past_bank_account_xids);
		if (past.some((acc) => candidates.includes(acc))) {
			return row.org_id;
		}
	}

	return undefined;
}

/**
 * Single write path for every inbound transaction (SePay Webhook and API v2
 * reconciliation). One D1 batch: the ledger insert decides match status with
 * scalar subqueries evaluated in the same statement (no read/write race
 * window under SQLite's single-writer model), then the invoice is recomputed
 * from the ledger.
 */
export async function ingestTransaction(
	db: Db,
	input: IngestInput,
	opts: IngestOptions,
): Promise<IngestResult> {
	const transferType = input.transferType.trim().toLowerCase();
	if (transferType !== "in" && transferType !== "credit") return "skipped";
	if (!Number.isInteger(input.amount) || input.amount <= 0) return "skipped";

	const provider = input.provider ?? "sepay";
	const normalizedAcc = normalizeBankAccountNumber(input.accountNumber);
	const normalizedSub = normalizeBankAccountNumber(input.subAccount ?? "");
	// Webhook và API v2 trả subAccount/va theo định dạng có thể khác nhau (VD: MMY vs TKPMMY),
	// nên giữ STK gốc ổn định cho fallback dedup khi referenceCode rỗng.
	const storedAccount = normalizedAcc || normalizedSub;

	const normalizedCodeField = input.paymentCode?.trim() ?? "";
	const scannedCode =
		(normalizedCodeField && PAYMENT_CODE_RE.test(normalizedCodeField)
			? extractPaymentCode(normalizedCodeField)
			: null) ?? extractPaymentCode(input.content);
	if (!scannedCode && !opts.saveNoCode) return "skipped";

	const orgId =
		input.orgId ??
		(await resolveOrgIdByAccount(db, {
			accountNumber: normalizedAcc,
			subAccount: normalizedSub,
			content: input.content,
		}));
	if (!orgId) return "skipped";

	// Tầng 1: idempotency theo (provider, provider_txn_id)
	const existingByTxnId = await runRows<{ id: string }>(
		db,
		sql`SELECT id FROM payment_transaction WHERE provider = ${provider} AND provider_txn_id = ${input.transactionId} LIMIT 1`,
	);
	if (existingByTxnId.length > 0) return "skipped";

	// Tầng 2: cross-channel fingerprint dedup (Webhook trả id số nguyên, API v2 trả UUID)
	const referenceCode = input.referenceCode.trim();
	const transactionDate = input.transactionDate.trim();
	if (referenceCode !== "" && transactionDate !== "") {
		const existingByRef = await runRows<{ id: string }>(
			db,
			sql`SELECT id FROM payment_transaction
				WHERE org_id = ${orgId}
				  AND provider = ${provider}
				  AND reference_code = ${referenceCode}
				  AND amount = ${input.amount}
				  AND transaction_date = ${transactionDate}
				LIMIT 1`,
		);
		if (existingByRef.length > 0) return "skipped";
	} else if (transactionDate !== "") {
		const existingByFallback = await runRows<{ id: string }>(
			db,
			sql`SELECT id FROM payment_transaction
				WHERE org_id = ${orgId}
				  AND provider = ${provider}
				  AND bank_account_xid = ${storedAccount}
				  AND amount = ${input.amount}
				  AND transaction_date = ${transactionDate}
				  AND content = ${input.content}
				LIMIT 1`,
		);
		if (existingByFallback.length > 0) return "skipped";
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
				provider,
				providerTxnId: input.transactionId,
				bankAccountXid: storedAccount,
				amount: input.amount,
				content: input.content,
				referenceCode,
				transactionDate,
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

/** Map một giao dịch từ SePay API v2 sang IngestInput dùng chung logic với Webhook. */
export function clientTransactionToIngest(t: SepayTransaction): IngestInput {
	return {
		provider: "sepay",
		transactionId: t.id,
		transferType: t.transferType,
		amount: t.amountIn,
		accountNumber: t.accountNumber,
		subAccount: t.va,
		content: t.transactionContent,
		paymentCode: t.code,
		referenceCode: t.referenceNumber,
		transactionDate: t.transactionDate,
		rawJson: JSON.stringify(t),
	};
}
