import { afterEach, describe, expect, test, vi } from "vitest";
import {
	BANK_HUB_PRODUCTION_BASE_URL,
	BANK_HUB_SANDBOX_BASE_URL,
	BankHubError,
	createBankHubClient,
	createBankHubContext,
} from "./bank-hub-client";

function jsonResponse(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

interface RecordedRequest {
	url: string;
	method: string;
	authorization: string | null;
	body: string | undefined;
}

type Handler = (req: RecordedRequest) => Response | Promise<Response>;

function mockFetch(handler: Handler): {
	calls: RecordedRequest[];
	fetch: typeof fetch;
} {
	const calls: RecordedRequest[] = [];
	const fetchImpl = (async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const req: RecordedRequest = {
			url: String(input),
			method: (init?.method ?? "GET").toUpperCase(),
			authorization: new Headers(init?.headers).get("authorization"),
			body: typeof init?.body === "string" ? init.body : undefined,
		};
		calls.push(req);
		return handler(req);
	}) as typeof fetch;
	return { calls, fetch: fetchImpl };
}

function isTokenRequest(req: RecordedRequest): boolean {
	return req.url.endsWith("/v1/token");
}

function tokenResponse(token: string, ttl: number): Response {
	return jsonResponse({ code: "200", access_token: token, ttl }, 201);
}

// Unique credential set per test: the token cache is module-scope keyed by
// baseUrl+clientId, so a shared id would leak tokens between cases.
let configSeq = 0;
function newConfig() {
	configSeq += 1;
	return {
		baseUrl: BANK_HUB_SANDBOX_BASE_URL,
		clientId: `cid-${configSeq}`,
		clientSecret: `secret-${configSeq}`,
	};
}

const API_SUFFIXES = [
	"/v1/company",
	"/v1/link-token",
	"/v1/bank-account",
	"/v1/transaction",
];

describe("createBankHubClient", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("fetches the token once and reuses it across requests", async () => {
		const cfg = newConfig();
		let tokenCalls = 0;
		const { calls, fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				expect(req.authorization).toBe(
					`Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
				);
				return tokenResponse("tok-1", 900);
			}
			const { pathname } = new URL(req.url);
			if (pathname === "/v1/bank-account") {
				return jsonResponse({ code: "200", data: [{ xid: "acc-1" }] });
			}
			return jsonResponse({ code: "200", data: { xid: "company-1" } });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		await client.getCompany("company-1");
		await client.listBankAccounts("company-1");

		expect(tokenCalls).toBe(1);
		const apiCalls = calls.filter((c) => !isTokenRequest(c));
		expect(apiCalls).toHaveLength(2);
		for (const call of apiCalls) {
			expect(call.authorization).toBe("Bearer tok-1");
		}
	});

	test("refreshes the token 60s before it expires", async () => {
		vi.useFakeTimers();
		const t0 = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(t0);
		const cfg = newConfig();
		let tokenCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse(`tok-${tokenCalls}`, 120);
			}
			return jsonResponse({ code: "200", data: { xid: "company-1" } });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		await client.getCompany("company-1");
		expect(tokenCalls).toBe(1);

		// 59s in: still inside the 60s safety margin — cached token reused.
		vi.setSystemTime(t0 + 59_000);
		await client.getCompany("company-1");
		expect(tokenCalls).toBe(1);

		// 61s in: inside the margin — a fresh token is issued.
		vi.setSystemTime(t0 + 61_000);
		await client.getCompany("company-1");
		expect(tokenCalls).toBe(2);
	});

	test("caps the token ttl at 3600s regardless of a bigger reported ttl", async () => {
		vi.useFakeTimers();
		const t0 = new Date("2026-01-01T00:00:00Z").getTime();
		vi.setSystemTime(t0);
		const cfg = newConfig();
		let tokenCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse(`tok-${tokenCalls}`, 7200);
			}
			return jsonResponse({ code: "200", data: { xid: "company-1" } });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		await client.getCompany("company-1");
		vi.setSystemTime(t0 + 3_539_000);
		await client.getCompany("company-1");
		expect(tokenCalls).toBe(1);

		// 60s safety margin before the capped expiry (t0+3600s) — not the
		// reported 7200s, proving the cap.
		vi.setSystemTime(t0 + 3_541_000);
		await client.getCompany("company-1");
		expect(tokenCalls).toBe(2);
	});

	test("on 401 it clears the cache, refreshes the token once and retries once", async () => {
		const cfg = newConfig();
		let tokenCalls = 0;
		let apiCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse(`tok-${tokenCalls}`, 900);
			}
			apiCalls += 1;
			if (apiCalls === 1) {
				expect(req.authorization).toBe("Bearer tok-1");
				return jsonResponse({ code: "401", message: "token expired" }, 401);
			}
			expect(req.authorization).toBe("Bearer tok-2");
			return jsonResponse({ code: "200", data: { xid: "company-1" } });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const company = await client.getCompany("company-1");

		expect(company.xid).toBe("company-1");
		expect(tokenCalls).toBe(2);
		expect(apiCalls).toBe(2);
	});

	test("does not loop when the retried request is unauthorized again", async () => {
		const cfg = newConfig();
		let tokenCalls = 0;
		let apiCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse(`tok-${tokenCalls}`, 900);
			}
			apiCalls += 1;
			return jsonResponse({ code: "401", message: "invalid credentials" }, 401);
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const error = await client.getCompany("company-1").catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BankHubError);
		expect((error as BankHubError).status).toBe(401);
		// Initial request + exactly one retry — never a refresh loop.
		expect(apiCalls).toBe(2);
		expect(tokenCalls).toBe(2);
	});

	test("on 429 it throws with retryAfter and does not retry", async () => {
		const cfg = newConfig();
		let tokenCalls = 0;
		let apiCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse("tok-1", 900);
			}
			apiCalls += 1;
			return jsonResponse({ code: "429", message: "too many requests" }, 429, {
				"retry-after": "30",
			});
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const error = await client
			.listBankAccounts("company-1")
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BankHubError);
		const bankHubError = error as BankHubError;
		expect(bankHubError.status).toBe(429);
		expect(bankHubError.retryAfter).toBe(30);
		expect(apiCalls).toBe(1);
		expect(tokenCalls).toBe(1);
	});

	test("leaves retryAfter undefined when Retry-After is not numeric", async () => {
		const cfg = newConfig();
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			return jsonResponse({ code: "429" }, 429, { "retry-after": "later" });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const error = await client.getCompany("company-1").catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BankHubError);
		expect((error as BankHubError).retryAfter).toBeUndefined();
	});

	test("maps error body code/message into BankHubError", async () => {
		const cfg = newConfig();
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			return jsonResponse(
				{ code: "COMPANY_DUPLICATED", message: "full_name already exists" },
				400,
			);
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const error = await client
			.createCompany({ fullName: "Teacher A" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BankHubError);
		const bankHubError = error as BankHubError;
		expect(bankHubError.status).toBe(400);
		expect(bankHubError.code).toBe("COMPANY_DUPLICATED");
		expect(bankHubError.message).toContain("already exists");
	});

	test("throws BankHubError when a required response field is missing", async () => {
		const cfg = newConfig();
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			return jsonResponse({ code: "200", data: {} });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const error = await client
			.createCompany({ fullName: "Teacher A" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BankHubError);
		expect((error as BankHubError).status).toBe(200);
	});

	test("unwraps the {data} envelope into camelCase DTOs", async () => {
		const cfg = newConfig();
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			return jsonResponse({
				code: "200",
				data: {
					xid: "company-9",
					full_name: "Teacher A",
					status: "Active",
					transaction_amount: "Unlimited",
				},
			});
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const company = await client.createCompany({ fullName: "Teacher A" });

		expect(company).toEqual({
			xid: "company-9",
			fullName: "Teacher A",
			status: "Active",
			transactionAmount: "Unlimited",
		});
	});

	test('parses account booleans that arrive as SQLite "0"/"1" strings', async () => {
		// SePay's API is SQLite-backed and serializes booleans as strings:
		// live sandbox /v1/bank-account returns active: "1", which must not
		// fail schema validation nor coerce to `false`.
		const cfg = newConfig();
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			const { pathname } = new URL(req.url);
			if (pathname === "/v1/bank-account") {
				return jsonResponse({
					code: "200",
					data: [
						{
							xid: "8919b3ff-c1f3-11f1-b21a-a6006ab65aca",
							company_xid: "8d212891-9927-4199-9566-eaaa4d597af4",
							brand_name: "ACB",
							bank_bin: "970416",
							bank_code: "ACB",
							account_holder_name: "NGUYEN VAN A",
							account_number: "0071000123",
							accumulated: "0.00",
							account_type: "individual",
							bank_api_connected: "1",
							active: "1",
							last_transaction: null,
							created_at: "2026-10-07 09:05:14",
							updated_at: "2026-10-07 09:05:14",
						},
						{ xid: "acc-2", active: "0" },
					],
					meta: {
						per_page: 20,
						total: 1,
						has_more: false,
						current_page: 1,
						page_count: 1,
					},
				});
			}
			return jsonResponse({ code: "200", data: { xid: "acc-1", active: "1" } });
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const accounts = await client.listBankAccounts("company-1");
		expect(accounts[0]).toEqual({
			xid: "8919b3ff-c1f3-11f1-b21a-a6006ab65aca",
			companyXid: "8d212891-9927-4199-9566-eaaa4d597af4",
			brandName: "ACB",
			bankBin: "970416",
			bankCode: "ACB",
			accountHolderName: "NGUYEN VAN A",
			accountNumber: "0071000123",
			active: true,
		});
		expect(accounts[1]?.active).toBe(false);

		// The webhook path reads the single-account endpoint — same shape.
		const single = await client.getBankAccount("acc-1");
		expect(single.active).toBe(true);
	});

	test("sends the documented method, path and payload for every endpoint", async () => {
		const cfg = newConfig();
		const { calls, fetch: fetchImpl } = mockFetch(async (req) => {
			const { pathname } = new URL(req.url);
			if (isTokenRequest(req)) return tokenResponse("tok-1", 900);
			if (req.method === "POST" && pathname === "/v1/company/create") {
				return jsonResponse({
					code: "200",
					data: { xid: "company-1", full_name: "Teacher A" },
				});
			}
			if (req.method === "POST" && pathname === "/v1/company/edit/company-1") {
				return jsonResponse({
					code: "200",
					data: { xid: "company-1", transaction_amount: "Unlimited" },
				});
			}
			if (req.method === "POST" && pathname === "/v1/link-token/create") {
				// Flat 201 body — no {code, data} envelope (docs + sandbox).
				return jsonResponse(
					{
						xid: "lt-1",
						hosted_link_url: "https://bankhub.sepay.vn/link/lt-1",
						link_token: "ltok-1",
						expires_at: "2026-01-01 01:00:00",
					},
					201,
				);
			}
			if (req.method === "GET" && pathname === "/v1/company/company-1") {
				return jsonResponse({
					code: "200",
					data: { xid: "company-1", status: "Active" },
				});
			}
			if (req.method === "GET" && pathname === "/v1/bank-account/acc-1") {
				return jsonResponse({
					code: "200",
					data: { xid: "acc-1", brand_name: "MBBank" },
				});
			}
			if (req.method === "GET" && pathname === "/v1/bank-account") {
				return jsonResponse({
					code: "200",
					data: [{ xid: "acc-1" }, { xid: "acc-2" }],
				});
			}
			if (req.method === "GET" && pathname === "/v1/transaction") {
				return jsonResponse({
					code: "200",
					data: [
						{
							transaction_id: "txn-1",
							amount: 500_000,
							transfer_type: "credit",
							transaction_content: "TOS1 hoc phi",
							transaction_date: "2026-01-01 10:00:00",
						},
					],
					meta: { page: 2, per_page: 50, total: 51, total_pages: 2 },
				});
			}
			return jsonResponse(
				{ code: "404", message: `unexpected ${req.method} ${pathname}` },
				404,
			);
		});

		const client = createBankHubClient(cfg, fetchImpl);
		const [company, edited, link, got, listed, fetchedAcc, txns] =
			await Promise.all([
				client.createCompany({ fullName: "Teacher A" }),
				client.editCompany("company-1", { transactionAmount: "Unlimited" }),
				client.createLinkToken({
					companyXid: "company-1",
					purpose: "LINK_BANK_ACCOUNT",
					completionRedirectUri: "https://app.example/callback",
				}),
				client.getCompany("company-1"),
				client.listBankAccounts("company-1"),
				client.getBankAccount("acc-1"),
				client.listTransactions({
					bankAccountXid: "acc-1",
					transferType: "credit",
					page: 2,
					perPage: 50,
				}),
			]);

		expect(company.xid).toBe("company-1");
		expect(edited.transactionAmount).toBe("Unlimited");
		expect(link.hostedLinkUrl).toBe("https://bankhub.sepay.vn/link/lt-1");
		expect(got.status).toBe("Active");
		expect(listed.map((a) => a.xid)).toEqual(["acc-1", "acc-2"]);
		expect(fetchedAcc.xid).toBe("acc-1");
		expect(txns.data[0]?.transactionId).toBe("txn-1");
		expect(txns.meta?.perPage).toBe(50);

		const apiCalls = calls.filter((c) => !isTokenRequest(c));
		const byPath = new Map(
			apiCalls.map(
				(c) => [`${c.method} ${new URL(c.url).pathname}`, c] as const,
			),
		);

		const create = byPath.get("POST /v1/company/create");
		expect(create?.body && JSON.parse(create.body)).toEqual({
			full_name: "Teacher A",
			status: "Active",
		});
		const edit = byPath.get("POST /v1/company/edit/company-1");
		expect(edit?.body && JSON.parse(edit.body)).toEqual({
			transaction_amount: "Unlimited",
		});
		const linkToken = byPath.get("POST /v1/link-token/create");
		expect(linkToken?.body && JSON.parse(linkToken.body)).toEqual({
			company_xid: "company-1",
			purpose: "LINK_BANK_ACCOUNT",
			completion_redirect_uri: "https://app.example/callback",
		});
		const bankAccountList = byPath.get("GET /v1/bank-account");
		expect(bankAccountList?.url).toContain("company_xid=company-1");
		const txnList = byPath.get("GET /v1/transaction");
		expect(txnList?.url).toContain("bank_account_xid=acc-1");
		expect(txnList?.url).toContain("transfer_type=credit");
		expect(txnList?.url).toContain("page=2");
		expect(txnList?.url).toContain("per_page=50");
		expect(byPath.get("GET /v1/company/company-1")).toBeDefined();
		expect(byPath.get("GET /v1/bank-account/acc-1")).toBeDefined();
		// Every API call carries the Bearer token (never the Basic credential).
		for (const call of apiCalls) {
			expect(call.authorization).toBe("Bearer tok-1");
			expect(
				API_SUFFIXES.some((s) => call.url.startsWith(cfg.baseUrl + s)),
			).toBe(true);
		}
	});

	test("never logs the client secret or access token", async () => {
		const spies = (["log", "info", "warn", "error"] as const).map((method) =>
			vi.spyOn(console, method).mockImplementation(() => {}),
		);
		const cfg = {
			baseUrl: BANK_HUB_SANDBOX_BASE_URL,
			clientId: "cid-redaction",
			clientSecret: "secret-redaction-test",
		};
		let tokenCalls = 0;
		let apiCalls = 0;
		const { fetch: fetchImpl } = mockFetch(async (req) => {
			if (isTokenRequest(req)) {
				tokenCalls += 1;
				return tokenResponse("tok-redaction", 900);
			}
			apiCalls += 1;
			if (apiCalls === 1) return jsonResponse({ code: "401" }, 401);
			if (apiCalls === 2) {
				return jsonResponse({ code: "429" }, 429, { "retry-after": "5" });
			}
			return jsonResponse({ code: "200" }); // malformed: triggers parse failure
		});

		const client = createBankHubClient(cfg, fetchImpl);
		// 401-retry, 429 and bad-shape responses — the flows most likely to leak.
		await client.getCompany("company-1").catch(() => undefined);
		await client.getCompany("company-1").catch(() => undefined);
		await client.getCompany("company-1").catch(() => undefined);

		expect(tokenCalls).toBeGreaterThan(0);
		expect(apiCalls).toBeGreaterThan(0);
		for (const spy of spies) {
			const printed = spy.mock.calls
				.map((args) => args.map(String).join(" "))
				.join("\n");
			expect(printed).not.toContain("secret-redaction-test");
			expect(printed).not.toContain("tok-redaction");
			expect(printed).not.toContain("Basic ");
		}
	});
});

describe("createBankHubContext", () => {
	const full = {
		clientId: "cid",
		clientSecret: "sec",
		ipnApiKey: "ipn-key",
		webhookSecret: "wh-secret",
	};

	test("returns undefined when any secret is missing or blank", () => {
		expect(createBankHubContext({})).toBeUndefined();
		expect(createBankHubContext({ ...full, clientId: "" })).toBeUndefined();
		expect(
			createBankHubContext({ ...full, clientSecret: "  " }),
		).toBeUndefined();
		expect(createBankHubContext({ ...full, ipnApiKey: "" })).toBeUndefined();
		expect(
			createBankHubContext({ ...full, webhookSecret: "" }),
		).toBeUndefined();
	});

	test("builds a sandbox context when the base URL is omitted", () => {
		const ctx = createBankHubContext({ ...full });
		expect(ctx?.env).toBe("sandbox");
		expect(ctx?.ipnApiKey).toBe("ipn-key");
		expect(ctx?.webhookSecret).toBe("wh-secret");
		expect(typeof ctx?.client.getCompany).toBe("function");
	});

	test("classifies the production base URL", () => {
		const ctx = createBankHubContext({
			...full,
			baseUrl: BANK_HUB_PRODUCTION_BASE_URL,
		});
		expect(ctx?.env).toBe("production");
	});
});
