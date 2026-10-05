import { queryOptions } from "@tanstack/react-query";
import type {
	PaymentInstructions,
	PaymentTransactionItem,
	ReconcileResult,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "@/lib/repos/settings";

export const POLL_INTERVAL_MS = 5000;
/** Widely-shared links must not poll D1 forever (#320). */
export const POLL_CAP_MS = 15 * 60 * 1000;

/**
 * Poll only while the panel is open, the invoice is unsettled, the tab is
 * visible and the 15-minute cap has not elapsed. The public /pay page shares
 * this rule.
 */
export function shouldPollPayment(input: {
	panelOpen: boolean;
	payable: boolean;
	openedAt: number;
	now: number;
}): boolean {
	if (!input.panelOpen || !input.payable) return false;
	if (typeof document !== "undefined" && document.hidden) return false;
	return input.now - input.openedAt < POLL_CAP_MS;
}

export const invoicePaymentQueryKey = (invoiceId: string) =>
	["invoice-payment", invoiceId] as const;

export async function fetchInvoicePayment(
	invoiceId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<PaymentInstructions & { payToken: string }> {
	const res = await fetch(`${baseUrl}/api/invoices/${invoiceId}/payment`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) throw new Error(`Failed to fetch payment: ${res.status}`);
	return (await res.json()) as PaymentInstructions & { payToken: string };
}

export function invoicePaymentQueryOptions(
	invoiceId: string,
	baseUrl: string = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: invoicePaymentQueryKey(invoiceId),
		queryFn: ({ signal }) => fetchInvoicePayment(invoiceId, baseUrl, signal),
	});
}

export const unmatchedTransactionsQueryKey = [
	"payment-transactions",
	"unmatched",
] as const;

export async function fetchUnmatchedTransactions(
	baseUrl: string = getApiBaseUrl(),
): Promise<PaymentTransactionItem[]> {
	const res = await fetch(
		`${baseUrl}/api/payment-transactions?status=unmatched`,
		{
			credentials: "include",
		},
	);
	if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
	return (await res.json()) as PaymentTransactionItem[];
}

export function unmatchedTransactionsQueryOptions(
	baseUrl: string = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: unmatchedTransactionsQueryKey,
		queryFn: () => fetchUnmatchedTransactions(baseUrl),
	});
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
	if (!res.ok) {
		let code = `HTTP_${res.status}`;
		try {
			const parsed = (await res.json()) as { code?: unknown };
			if (typeof parsed.code === "string") code = parsed.code;
		} catch {
			// keep status code
		}
		throw new Error(code);
	}
	return (await res.json()) as T;
}

export function assignTransaction(
	transactionId: string,
	invoiceId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ ok: boolean }> {
	return postJson(
		`${baseUrl}/api/payment-transactions/${transactionId}/assign`,
		{ invoiceId },
	);
}

export function ignoreTransaction(
	transactionId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ ok: boolean }> {
	return postJson(
		`${baseUrl}/api/payment-transactions/${transactionId}/ignore`,
	);
}

export function reconcileBankLink(
	baseUrl: string = getApiBaseUrl(),
): Promise<ReconcileResult> {
	return postJson(`${baseUrl}/api/bank-link/reconcile`);
}

export function rotatePayToken(
	invoiceId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ payToken: string }> {
	return postJson(`${baseUrl}/api/invoices/${invoiceId}/rotate-pay-token`);
}
