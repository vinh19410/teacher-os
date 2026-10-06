import { queryOptions } from "@tanstack/react-query";
import type {
	BankLinkStatus,
	BankLinkTokenRequest,
	BankLinkTokenResponse,
} from "@teacher-os/api/contracts";
import { bankLinkStatusSchema } from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

export const bankLinkQueryKey = ["bank-link"] as const;

/** Server answer for 503 BANKHUB_DISABLED: feature exists but unconfigured. */
export const BANK_LINK_DISABLED: BankLinkStatus = {
	enabled: false,
	status: "none",
	brandName: "",
	accountNumberMasked: "",
	holderName: "",
	linkedAt: null,
};

export async function fetchBankLink(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<BankLinkStatus> {
	const res = await fetch(`${baseUrl}/api/bank-link`, {
		credentials: "include",
		signal,
	});
	// Unconfigured Bank Hub is a normal state ("Chưa bật"), not an error.
	if (res.status === 503) return BANK_LINK_DISABLED;
	if (!res.ok) {
		throw new Error(`Failed to fetch bank link: ${res.status}`);
	}
	return bankLinkStatusSchema.parse(await res.json());
}

export function bankLinkQueryOptions(baseUrl: string = getApiBaseUrl()) {
	return queryOptions({
		queryKey: bankLinkQueryKey,
		queryFn: ({ signal }) => fetchBankLink(baseUrl, signal),
	});
}

export class BankLinkRequestError extends Error {
	readonly code: string;
	constructor(code: string) {
		super(code);
		this.name = "BankLinkRequestError";
		this.code = code;
	}
}

async function parseError(res: Response): Promise<never> {
	let code = `HTTP_${res.status}`;
	try {
		const body = (await res.json()) as { code?: unknown };
		if (typeof body.code === "string" && body.code) code = body.code;
	} catch {
		// keep the status-based code
	}
	throw new BankLinkRequestError(code);
}

export async function createBankLinkToken(
	purpose: BankLinkTokenRequest["purpose"],
	baseUrl: string = getApiBaseUrl(),
): Promise<BankLinkTokenResponse> {
	const res = await fetch(`${baseUrl}/api/bank-link/link-token`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ purpose }),
	});
	if (!res.ok) await parseError(res);
	return (await res.json()) as BankLinkTokenResponse;
}

export async function syncBankLink(
	baseUrl: string = getApiBaseUrl(),
): Promise<BankLinkStatus> {
	const res = await fetch(`${baseUrl}/api/bank-link/sync`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
	});
	if (!res.ok) await parseError(res);
	return bankLinkStatusSchema.parse(await res.json());
}
