import { sepayV2TransactionListSchema } from "./sepay-types";

export const SEPAY_API_PRODUCTION_BASE_URL = "https://userapi.sepay.vn/v2";
export const SEPAY_API_SANDBOX_BASE_URL = "https://userapi-sandbox.sepay.vn/v2";

export type FetchLike = typeof fetch;

/** Lỗi chuẩn hóa khi gọi SePay API v2. */
export class SepayError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly retryAfter?: number;

	constructor(
		status: number,
		message: string,
		opts: { code?: string; retryAfter?: number } = {},
	) {
		super(message);
		this.name = "SepayError";
		this.status = status;
		this.code = opts.code;
		this.retryAfter = opts.retryAfter;
	}
}

export interface SepayTransaction {
	id: string;
	transactionDate: string;
	accountNumber: string;
	va: string;
	transferType: string;
	amountIn: number;
	amountOut: number;
	accumulated: number | null;
	transactionContent: string;
	referenceNumber: string;
	code: string | null;
	bankBrandName: string;
	bankAccountId: string;
	vaId: string;
	webhookSuccess: boolean;
}

export interface SepayTransactionPage {
	data: SepayTransaction[];
	hasMore: boolean;
	currentPage: number;
	lastPage: number;
}

export interface SepayClient {
	listTransactions(input: {
		transactionDateFrom?: string;
		transactionDateTo?: string;
		transferType?: "in" | "out";
		page?: number;
		perPage?: number;
	}): Promise<SepayTransactionPage>;
}

export interface SepayContext {
	webhookSecret: string;
	client?: SepayClient;
}

function parseRetryAfter(headers: Headers): number | undefined {
	const raw =
		headers.get("retry-after") ?? headers.get("x-sepay-userapi-retry-after");
	if (!raw) return undefined;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Client gọi SePay API v2 (https://userapi.sepay.vn/v2) bằng Bearer API Token.
 */
export function createSepayClient(config: {
	apiToken: string;
	baseUrl?: string;
	fetchFn?: FetchLike;
}): SepayClient {
	const baseUrl =
		config.baseUrl?.trim().replace(/\/+$/, "") || SEPAY_API_PRODUCTION_BASE_URL;
	const fetchFn = config.fetchFn ?? fetch;

	return {
		async listTransactions(input) {
			const params = new URLSearchParams();
			if (input.transactionDateFrom) {
				params.set("transaction_date_from", input.transactionDateFrom);
			}
			if (input.transactionDateTo) {
				params.set("transaction_date_to", input.transactionDateTo);
			}
			if (input.transferType) {
				params.set("transfer_type", input.transferType);
			}
			if (input.page !== undefined) {
				params.set("page", String(input.page));
			}
			if (input.perPage !== undefined) {
				params.set("per_page", String(input.perPage));
			}
			const qs = params.toString();
			const url = `${baseUrl}/transactions${qs ? `?${qs}` : ""}`;

			const res = await fetchFn(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
					Accept: "application/json",
				},
			});

			if (res.status === 429) {
				const retryAfter = parseRetryAfter(res.headers);
				throw new SepayError(429, "SePay API rate limited", {
					code: "RATE_LIMITED",
					retryAfter,
				});
			}

			if (!res.ok) {
				throw new SepayError(
					res.status,
					`SePay API returned HTTP ${res.status}`,
				);
			}

			let rawJson: unknown;
			try {
				rawJson = await res.json();
			} catch {
				throw new SepayError(502, "SePay API returned invalid JSON");
			}

			const parsed = sepayV2TransactionListSchema.safeParse(rawJson);
			if (!parsed.success) {
				const issues = parsed.error.issues
					.slice(0, 5)
					.map((i) => `${i.path.join(".") || "root"}:${i.code}`)
					.join(",");
				throw new SepayError(502, `SePay API malformed response (${issues})`);
			}

			const pagination = parsed.data.meta?.pagination;
			const currentPage = pagination?.current_page ?? input.page ?? 1;
			const lastPage = pagination?.last_page ?? currentPage;
			const hasMore =
				pagination?.has_more ??
				(currentPage < lastPage && parsed.data.data.length > 0);

			return {
				data: parsed.data.data.map((row) => ({
					id: row.id,
					transactionDate: row.transaction_date ?? "",
					accountNumber: row.account_number ?? "",
					va: row.va ?? "",
					transferType: row.transfer_type,
					amountIn: row.amount_in,
					amountOut: row.amount_out,
					accumulated: row.accumulated ?? null,
					transactionContent: row.transaction_content ?? "",
					referenceNumber: row.reference_number ?? "",
					code: row.code ?? null,
					bankBrandName: row.bank_brand_name ?? "",
					bankAccountId: row.bank_account_id ?? "",
					vaId: row.va_id ?? "",
					webhookSuccess:
						row.webhook_success === true || row.webhook_success === 1,
				})),
				hasMore,
				currentPage,
				lastPage,
			};
		},
	};
}

/**
 * Khởi tạo SepayContext từ biến môi trường Worker.
 * Thiếu SEPAY_WEBHOOK_SECRET ⇒ trả undefined (tắt hoàn toàn).
 * Thiếu SEPAY_API_TOKEN ⇒ webhook vẫn chạy, chỉ tắt tính năng Đối soát API v2.
 */
export function createSepayContext(input: {
	webhookSecret?: string | undefined;
	apiToken?: string | undefined;
	apiBaseUrl?: string | undefined;
	fetchFn?: FetchLike;
}): SepayContext | undefined {
	const webhookSecret = input.webhookSecret?.trim() ?? "";
	if (!webhookSecret) return undefined;

	const apiToken = input.apiToken?.trim() ?? "";
	const baseUrl =
		input.apiBaseUrl?.trim().replace(/\/+$/, "") ||
		SEPAY_API_PRODUCTION_BASE_URL;

	return {
		webhookSecret,
		...(apiToken
			? {
					client: createSepayClient({
						apiToken,
						baseUrl,
						fetchFn: input.fetchFn,
					}),
				}
			: {}),
	};
}
