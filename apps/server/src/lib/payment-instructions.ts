import type { PaymentInstructions } from "@teacher-os/api/contracts";
import {
	formatInvoiceCode,
	type InvoiceEmailPaymentInfo,
} from "@teacher-os/api/invoice-email";
import {
	generatePaymentCode,
	generatePayToken,
} from "@teacher-os/api/lib/payment-code";
import { buildTransferMemo, buildVietQrUrl } from "@teacher-os/api/lib/vietqr";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../app";

export type InvoiceRow = typeof invoice.$inferSelect;

/**
 * Lazy backfill for invoices created before #320: assign payment_code and
 * pay_token on first need. The conditional UPDATE (... IS NULL) plus a
 * re-select is race-safe — the loser's UPDATE matches zero rows and the
 * re-select picks up the winner's codes. A unique-code collision (≈1e-12)
 * retries with a fresh code.
 */
export async function ensurePaymentRefs(
	db: Db,
	invoiceId: string,
	orgId: string,
): Promise<InvoiceRow | undefined> {
	const read = () =>
		db.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
	let [row] = await read();
	if (!row || row.orgId !== orgId) return undefined;

	for (
		let attempt = 0;
		attempt < 3 && row && (!row.paymentCode || !row.payToken);
		attempt += 1
	) {
		try {
			await db
				.update(invoice)
				.set({
					paymentCode: row.paymentCode ?? generatePaymentCode(),
					payToken: row.payToken ?? generatePayToken(),
				})
				.where(
					and(
						eq(invoice.id, invoiceId),
						or(isNull(invoice.paymentCode), isNull(invoice.payToken)),
					),
				);
		} catch {
			// unique payment_code collision — regenerate on the next pass
		}
		[row] = await read();
	}
	return row;
}

export interface EmailBankLinkInput {
	status: string;
	brandName: string;
	bankBin: string;
	bankCode: string;
	accountNumber: string;
	vaCode: string;
	accountHolderName: string;
}

/**
 * Dựng thông tin chuyển khoản và QR dùng cho email thông báo hóa đơn từ bản ghi
 * `org_bank_link` hiện tại. Trả `null` khi hóa đơn đã thu đủ, org chưa liên kết
 * ngân hàng, hoặc hóa đơn legacy chưa có `paymentCode` (tránh tạo memo rỗng).
 */
export function buildEmailPaymentInfo(
	inv: {
		amount: number;
		paidAmount: number;
		status: string;
		paymentCode: string | null;
	},
	link: EmailBankLinkInput | undefined,
): InvoiceEmailPaymentInfo | null {
	const amountDue = Math.max(
		inv.amount - Math.min(inv.paidAmount, inv.amount),
		0,
	);
	if (amountDue <= 0 || inv.status === "paid") {
		return null;
	}
	if (link?.status !== "linked" || !link.accountNumber.trim()) {
		return null;
	}
	const bin = link.bankBin.trim() || link.bankCode.trim();
	if (!bin) {
		return null;
	}
	const code = inv.paymentCode?.trim() ?? "";
	if (!code) {
		return null;
	}
	const accountNumber = link.accountNumber.trim();
	const memo = buildTransferMemo({
		code,
		bankBin: link.bankBin,
		vaCode: link.vaCode,
	});
	return {
		bankBrandName: link.brandName || link.bankCode || bin,
		accountNumber,
		holderName: link.accountHolderName,
		memo,
		qrUrl: buildVietQrUrl({
			bin,
			accountNumber,
			amount: amountDue,
			memo,
		}),
	};
}

/**
 * Everything the QR panel needs. QR is always built from the org's CURRENT
 * linked account and the CURRENT remaining debt — nothing about it is
 * stored.
 */
export async function loadPaymentInstructions(input: {
	db: Db;
	invoice: InvoiceRow;
}): Promise<PaymentInstructions> {
	const { db, invoice: inv } = input;
	const amountDue = Math.max(inv.amount - inv.paidAmount, 0);
	const base: PaymentInstructions = {
		invoiceCode: formatInvoiceCode(inv.id),
		amount: inv.amount,
		paidAmount: inv.paidAmount,
		amountDue,
		status: inv.status,
		due: inv.due,
		note: inv.note,
		payable: amountDue > 0,
	};
	// Settled covers both ledger-paid (paidAmount >= amount) and manually
	// mark-paid rows (status=paid, paidAmount may stay 0 — the teacher
	// collected cash; no more transfer needed).
	if (amountDue <= 0 || inv.status === "paid") {
		return { ...base, payable: false, reason: "PAID" };
	}
	const [link] = await db
		.select()
		.from(orgBankLink)
		.where(eq(orgBankLink.orgId, inv.orgId))
		.limit(1);
	if (link?.status !== "linked" || !link.accountNumber) {
		return { ...base, payable: false, reason: "NO_BANK_LINK" };
	}
	const bin = link.bankBin || link.bankCode;
	if (!bin) {
		return { ...base, payable: false, reason: "NO_BANK_LINK" };
	}
	const memo = buildTransferMemo({
		code: inv.paymentCode ?? "",
		bankBin: link.bankBin,
		vaCode: link.vaCode,
	});
	return {
		...base,
		payable: true,
		bank: {
			brandName: link.brandName,
			accountNumber: link.accountNumber,
			holderName: link.accountHolderName,
		},
		memo,
		qrUrl: buildVietQrUrl({
			bin,
			accountNumber: link.accountNumber,
			amount: amountDue,
			memo,
		}),
	};
}
