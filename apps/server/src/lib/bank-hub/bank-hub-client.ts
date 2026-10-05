import type { ZodType } from "zod";
import {
	bankHubAccountRawSchema,
	bankHubCompanyRawSchema,
	bankHubEnvelope,
	bankHubLinkTokenRawSchema,
	bankHubTokenResponseSchema,
	bankHubTransactionListSchema,
} from "./bank-hub-types";

export const BANK_HUB_SANDBOX_BASE_URL = "https://bankhub-api-sandbox.sepay.vn";
export const BANK_HUB_PRODUCTION_BASE_URL = "https://bankhub-api.sepay.vn";

/** Normalized API failure: HTTP status plus whatever the body volunteered. */
export class BankHubError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly retryAfter?: number;

	constructor(
		status: number,
		message: string,
		opts: { code?: string; retryAfter?: number } = {},
	) {
		super(message);
		this.name = "BankHubError";
		this.status = status;
		this.code = opts.code;
		this.retryAfter = opts.retryAfter;
	}
}

export type FetchLike = typeof fetch;

export interface BankHubClientConfig {
	baseUrl: string;
	clientId: string;
	clientSecret: string;
}

// Module-scope so every isolate reuses one token per credential; keyed by
// baseUrl+clientId because sandbox and production credentials must not share.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const TOKEN_MAX_TTL_S = 3600;

export interface BankHubCompany {
	xid: string;
	fullName: string;
	status: string;
	transactionAmount: string | number | null;
}

export interface BankHubLinkToken {
	xid: string;
	hostedLinkUrl: string;
	linkToken: string;
	expiresAt: string;
}

export interface BankHubAccount {
	xid: string;
	companyXid: string;
	brandName: string;
	bankBin: string;
	bankCode: string;
	accountHolderName: string;
	accountNumber: string;
	active: boolean;
}

export interface BankHubTransaction {
	transactionId: string;
	transactionDate: string;
	bankAccountXid: string;
	companyXid: string;
	accountNumber: string;
	referenceCode: string;
	transferType: string;
	amount: number;
	content: string;
	paymentCode: string | null;
	webhookSuccess: boolean;
}

export interface BankHubTransactionPage {
	data: BankHubTransaction[];
	meta?: {
		page?: number;
		perPage?: number;
		total?: number;
		totalPages?: number;
	};
}

export type BankHubLinkPurpose =
	| "LINK_BANK_ACCOUNT"
	| "UNLINK_BANK_ACCOUNT"
	| "REACTIVATE_BANK_ACCOUNT";

export interface BankHubClient {
	createCompany(input: {
		fullName: string;
		status?: "Active" | "Pending";
	}): Promise<BankHubCompany>;
	getCompany(xid: string): Promise<BankHubCompany>;
	editCompany(
		xid: string,
		patch: { transactionAmount?: number | "Unlimited" },
	): Promise<BankHubCompany>;
	createLinkToken(input: {
		companyXid: string;
		purpose: BankHubLinkPurpose;
		bankAccountXid?: string;
		completionRedirectUri?: string;
		isMobileApp?: boolean;
		language?: string;
	}): Promise<BankHubLinkToken>;
	getBankAccount(xid: string): Promise<BankHubAccount>;
	listBankAccounts(companyXid: string): Promise<BankHubAccount[]>;
	listTransactions(input: {
		bankAccountXid: string;
		startDate?: string;
		endDate?: string;
		transferType?: "credit" | "debit";
		page?: number;
		perPage?: number;
	}): Promise<BankHubTransactionPage>;
}

function toCompany(raw: {
	xid: string;
	full_name?: string;
	status?: string | number;
	transaction_amount?: string | number | null | undefined;
}): BankHubCompany {
	return {
		xid: raw.xid,
		fullName: raw.full_name ?? "",
		status: raw.status === undefined ? "" : String(raw.status),
		transactionAmount: raw.transaction_amount ?? null,
	};
}

function toAccount(raw: {
	xid: string;
	company_xid?: string;
	brand_name?: string | null;
	bank_bin?: string | null;
	bank_code?: string | null;
	account_holder_name?: string | null;
	account_number?: string | null;
	active?: boolean | number | null;
}): BankHubAccount {
	return {
		xid: raw.xid,
		companyXid: raw.company_xid ?? "",
		brandName: raw.brand_name ?? "",
		bankBin: raw.bank_bin ?? "",
		bankCode: raw.bank_code ?? "",
		accountHolderName: raw.account_holder_name ?? "",
		accountNumber: raw.account_number ?? "",
		active: raw.active === true || raw.active === 1,
	};
}

function toTransaction(raw: {
	transaction_id: string;
	transaction_date?: string | null;
	bank_account_xid?: string | null;
	company_xid?: string | null;
	account_number?: string | null;
	reference_number?: string | null;
	transfer_type: string;
	amount: number;
	transaction_content?: string | null;
	payment_code?: string | null;
	webhook_success?: boolean | number | null;
}): BankHubTransaction {
	return {
		transactionId: raw.transaction_id,
		transactionDate: raw.transaction_date ?? "",
		bankAccountXid: raw.bank_account_xid ?? "",
		companyXid: raw.company_xid ?? "",
		accountNumber: raw.account_number ?? "",
		referenceCode: raw.reference_number ?? "",
		transferType: raw.transfer_type,
		amount: raw.amount,
		content: raw.transaction_content ?? "",
		paymentCode: raw.payment_code ?? null,
		webhookSuccess: raw.webhook_success === true || raw.webhook_success === 1,
	};
}

async function toBankHubError(res: Response): Promise<BankHubError> {
	const text = await res.text().catch(() => "");
	let code: string | undefined;
	let message = `Bank Hub request failed (${res.status})`;
	try {
		const body = JSON.parse(text) as {
			code?: unknown;
			message?: unknown;
			error?: unknown;
		};
		if (typeof body.code === "string" && body.code) code = body.code;
		if (typeof body.message === "string" && body.message)
			message = body.message;
		else if (typeof body.error === "string" && body.error) message = body.error;
	} catch {
		// non-JSON body — keep the generic message
	}
	const retryAfterHeader = res.headers.get("retry-after");
	const retryAfter =
		retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader)
			? Number(retryAfterHeader)
			: undefined;
	return new BankHubError(res.status, message, { code, retryAfter });
}

export function createBankHubClient(
	config: BankHubClientConfig,
	fetchImpl: FetchLike = fetch,
): BankHubClient {
	const baseUrl = config.baseUrl.replace(/\/+$/, "");
	const cacheKey = `${baseUrl}|${config.clientId}`;
	const basicAuth = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;

	async function fetchToken(force: boolean): Promise<string> {
		const cached = tokenCache.get(cacheKey);
		if (
			!force &&
			cached &&
			cached.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS
		) {
			return cached.token;
		}
		const res = await fetchImpl(`${baseUrl}/v1/token`, {
			method: "POST",
			headers: { Authorization: basicAuth },
		});
		if (!res.ok) throw await toBankHubError(res);
		const json: unknown = await res.json().catch(() => undefined);
		const parsed = bankHubTokenResponseSchema.safeParse(json);
		if (!parsed.success) {
			throw new BankHubError(
				res.status,
				"Bank Hub token response is malformed",
			);
		}
		const ttl = Math.min(parsed.data.ttl, TOKEN_MAX_TTL_S);
		tokenCache.set(cacheKey, {
			token: parsed.data.access_token,
			expiresAt: Date.now() + ttl * 1000,
		});
		return parsed.data.access_token;
	}

	async function request<T>(opts: {
		method: "GET" | "POST";
		path: string;
		query?: Record<string, string | number | undefined>;
		body?: unknown;
		schema: ZodType<T>;
	}): Promise<T> {
		const send = async (bearer: string): Promise<Response> => {
			const url = new URL(baseUrl + opts.path);
			for (const [key, value] of Object.entries(opts.query ?? {})) {
				if (value !== undefined) url.searchParams.set(key, String(value));
			}
			return fetchImpl(url.toString(), {
				method: opts.method,
				headers: {
					Authorization: `Bearer ${bearer}`,
					...(opts.body !== undefined
						? { "Content-Type": "application/json" }
						: {}),
				},
				body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
			});
		};
		// 401 → the cached token went stale: clear and fetch once. A second 401
		// surfaces as BankHubError — SePay rate limits token minting (2–3 req/s
		// merchant-wide) so refresh loops are worse than a failed call.
		let res = await send(await fetchToken(false));
		if (res.status === 401) {
			res = await send(await fetchToken(true));
		}
		if (!res.ok) throw await toBankHubError(res);
		const json: unknown = await res.json().catch(() => undefined);
		const parsed = opts.schema.safeParse(json);
		if (!parsed.success) {
			throw new BankHubError(
				res.status,
				`Bank Hub response for ${opts.path} is malformed`,
			);
		}
		return parsed.data;
	}

	const companyEnvelope = bankHubEnvelope(bankHubCompanyRawSchema);
	const accountEnvelope = bankHubEnvelope(bankHubAccountRawSchema);
	const linkTokenEnvelope = bankHubEnvelope(bankHubLinkTokenRawSchema);
	const accountListEnvelope = bankHubEnvelope(bankHubAccountRawSchema.array());

	return {
		createCompany: (input) =>
			request({
				method: "POST",
				path: "/v1/company/create",
				body: {
					full_name: input.fullName,
					status: input.status ?? "Active",
				},
				schema: companyEnvelope,
			}).then((raw) => toCompany(raw.data)),
		getCompany: (xid) =>
			request({
				method: "GET",
				path: `/v1/company/${encodeURIComponent(xid)}`,
				schema: companyEnvelope,
			}).then((raw) => toCompany(raw.data)),
		editCompany: (xid, patch) =>
			request({
				method: "POST",
				path: `/v1/company/edit/${encodeURIComponent(xid)}`,
				body: {
					...(patch.transactionAmount !== undefined
						? { transaction_amount: patch.transactionAmount }
						: {}),
				},
				schema: companyEnvelope,
			}).then((raw) => toCompany(raw.data)),
		createLinkToken: (input) =>
			request({
				method: "POST",
				path: "/v1/link-token/create",
				body: {
					company_xid: input.companyXid,
					purpose: input.purpose,
					...(input.bankAccountXid !== undefined
						? { bank_account_xid: input.bankAccountXid }
						: {}),
					...(input.completionRedirectUri !== undefined
						? { completion_redirect_uri: input.completionRedirectUri }
						: {}),
					...(input.isMobileApp !== undefined
						? { is_mobile_app: input.isMobileApp }
						: {}),
					...(input.language !== undefined ? { language: input.language } : {}),
				},
				schema: linkTokenEnvelope,
			}).then((raw) => ({
				xid: raw.data.xid,
				hostedLinkUrl: raw.data.hosted_link_url,
				linkToken: raw.data.link_token,
				expiresAt: raw.data.expires_at,
			})),
		getBankAccount: (xid) =>
			request({
				method: "GET",
				path: `/v1/bank-account/${encodeURIComponent(xid)}`,
				schema: accountEnvelope,
			}).then((raw) => toAccount(raw.data)),
		listBankAccounts: (companyXid) =>
			request({
				method: "GET",
				path: "/v1/bank-account",
				query: { company_xid: companyXid },
				schema: accountListEnvelope,
			}).then((raw) => raw.data.map(toAccount)),
		listTransactions: (input) =>
			request({
				method: "GET",
				path: "/v1/transaction",
				query: {
					bank_account_xid: input.bankAccountXid,
					start_transaction_date: input.startDate,
					end_transaction_date: input.endDate,
					transfer_type: input.transferType,
					page: input.page,
					per_page: input.perPage,
				},
				schema: bankHubTransactionListSchema,
			}).then((page) => ({
				data: page.data.map(toTransaction),
				meta: page.meta
					? {
							page: page.meta.page,
							perPage: page.meta.per_page,
							total: page.meta.total,
							totalPages: page.meta.total_pages,
						}
					: undefined,
			})),
	};
}

export interface BankHubContext {
	client: BankHubClient;
	ipnApiKey: string;
	webhookSecret: string;
	env: "sandbox" | "production";
}

/**
 * Wiring helper shared by the Worker entry (env bindings) and tests. Any
 * blank secret disables Bank Hub entirely: the routes answer
 * 503 BANKHUB_DISABLED instead of failing at request time.
 */
export function createBankHubContext(input: {
	clientId?: string | undefined;
	clientSecret?: string | undefined;
	ipnApiKey?: string | undefined;
	webhookSecret?: string | undefined;
	baseUrl?: string | undefined;
}): BankHubContext | undefined {
	const clientId = input.clientId?.trim();
	const clientSecret = input.clientSecret?.trim();
	const ipnApiKey = input.ipnApiKey?.trim();
	const webhookSecret = input.webhookSecret?.trim();
	if (!clientId || !clientSecret || !ipnApiKey || !webhookSecret)
		return undefined;
	const baseUrl = input.baseUrl?.trim() || BANK_HUB_SANDBOX_BASE_URL;
	return {
		client: createBankHubClient({ baseUrl, clientId, clientSecret }),
		ipnApiKey,
		webhookSecret,
		env: baseUrl === BANK_HUB_PRODUCTION_BASE_URL ? "production" : "sandbox",
	};
}
