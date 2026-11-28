import { describe, expect, test, vi } from "vitest";
import {
	createSepayClient,
	createSepayContext,
	SEPAY_API_PRODUCTION_BASE_URL,
	SEPAY_API_SANDBOX_BASE_URL,
	SepayError,
} from "./sepay-client";

function jsonRes(
	body: unknown,
	status = 200,
	headers?: Record<string, string>,
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("createSepayContext", () => {
	test("returns undefined when webhookSecret is blank", () => {
		expect(createSepayContext({ webhookSecret: "" })).toBeUndefined();
		expect(createSepayContext({ webhookSecret: "   " })).toBeUndefined();
	});

	test("creates context without client when apiToken is blank", () => {
		const ctx = createSepayContext({
			webhookSecret: "whsec",
			apiToken: "",
			apiBaseUrl: "",
		});
		expect(ctx?.webhookSecret).toBe("whsec");
		expect(ctx?.client).toBeUndefined();
	});

	test("creates context with client when apiToken is set", () => {
		const ctx = createSepayContext({
			webhookSecret: "whsec",
			apiToken: "tok-64",
			apiBaseUrl: `${SEPAY_API_SANDBOX_BASE_URL}/`,
		});
		expect(ctx?.webhookSecret).toBe("whsec");
		expect(ctx?.client).toBeDefined();
	});
});

describe("createSepayClient", () => {
	test("calls GET /transactions with Bearer token and maps v2 DTO", async () => {
		const fetchMock = vi.fn(
			async (url: RequestInfo | URL, init?: RequestInit) => {
				expect(String(url)).toBe(
					`${SEPAY_API_PRODUCTION_BASE_URL}/transactions?transaction_date_from=2026-11-20+00%3A00%3A00&transfer_type=in&page=1&per_page=100`,
				);
				const headers = init?.headers as Record<string, string> | undefined;
				expect(headers?.Authorization).toBe("Bearer my-api-token");
				return jsonRes({
					status: "success",
					data: [
						{
							id: "a1b2c3d4-0001",
							transaction_date: "2026-11-27 10:15:00",
							account_number: "0123456789",
							va: "VA001",
							transfer_type: "in",
							amount_in: 500000,
							amount_out: 0,
							accumulated: 1500000,
							transaction_content: "TOS7K2M9QXA hoc phi",
							reference_number: "FT261127001",
							code: "TOS7K2M9QXA",
							bank_brand_name: "MBBank",
							bank_account_id: "ba-uuid",
							va_id: "va-uuid",
							webhook_success: 1,
						},
					],
					meta: {
						pagination: {
							total: 1,
							per_page: 100,
							current_page: 1,
							last_page: 1,
							has_more: false,
						},
					},
				});
			},
		);

		const client = createSepayClient({
			apiToken: "my-api-token",
			baseUrl: `${SEPAY_API_PRODUCTION_BASE_URL}/`,
			fetchFn: fetchMock as unknown as typeof fetch,
		});
		const page = await client.listTransactions({
			transactionDateFrom: "2026-11-20 00:00:00",
			transferType: "in",
			page: 1,
			perPage: 100,
		});

		expect(page.hasMore).toBe(false);
		expect(page.data).toEqual([
			{
				id: "a1b2c3d4-0001",
				transactionDate: "2026-11-27 10:15:00",
				accountNumber: "0123456789",
				va: "VA001",
				transferType: "in",
				amountIn: 500000,
				amountOut: 0,
				accumulated: 1500000,
				transactionContent: "TOS7K2M9QXA hoc phi",
				referenceNumber: "FT261127001",
				code: "TOS7K2M9QXA",
				bankBrandName: "MBBank",
				bankAccountId: "ba-uuid",
				vaId: "va-uuid",
				webhookSuccess: true,
			},
		]);
	});

	test("surfaces 429 with Retry-After seconds as SepayError", async () => {
		const fetchMock = vi.fn(async () =>
			jsonRes({ message: "Too many requests" }, 429, { "Retry-After": "12" }),
		);
		const client = createSepayClient({
			apiToken: "tok",
			fetchFn: fetchMock as unknown as typeof fetch,
		});

		const err = await client.listTransactions({ page: 1 }).catch((e) => e);
		expect(err).toBeInstanceOf(SepayError);
		expect((err as SepayError).status).toBe(429);
		expect((err as SepayError).retryAfter).toBe(12);
	});

	test("throws SepayError 502 on malformed response", async () => {
		const fetchMock = vi.fn(async () =>
			jsonRes({ status: "success", data: "bad" }),
		);
		const client = createSepayClient({
			apiToken: "tok",
			fetchFn: fetchMock as unknown as typeof fetch,
		});
		const err = await client.listTransactions({ page: 1 }).catch((e) => e);
		expect(err).toBeInstanceOf(SepayError);
		expect((err as SepayError).status).toBe(502);
	});
});
