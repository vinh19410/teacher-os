import { afterEach, describe, expect, test, vi } from "vitest";
import {
	BANK_LINK_DISABLED,
	BankLinkRequestError,
	createBankLinkToken,
	fetchBankLink,
	syncBankLink,
} from "./bank-link";

function jsonRes(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const LINKED = {
	enabled: true,
	status: "linked",
	brandName: "MBBank",
	accountNumberMasked: "•••6789",
	holderName: "NGUYEN VAN A",
	linkedAt: "2026-10-05T00:00:00.000Z",
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("fetchBankLink", () => {
	test("parses the status DTO", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes(LINKED)),
		);
		const status = await fetchBankLink("http://api.test");
		expect(status).toEqual(LINKED);
	});

	test("maps 503 BANKHUB_DISABLED to the disabled status, not a throw", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes({ code: "BANKHUB_DISABLED" }, 503)),
		);
		const status = await fetchBankLink("http://api.test");
		expect(status).toEqual(BANK_LINK_DISABLED);
	});

	test("other failures throw", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes({ error: "boom" }, 500)),
		);
		await expect(fetchBankLink("http://api.test")).rejects.toThrow();
	});
});

describe("createBankLinkToken", () => {
	test("posts the purpose and returns the hosted link", async () => {
		const fetchMock = vi.fn(async () =>
			jsonRes({
				hostedLinkUrl: "https://bankhub.sepay.vn/link/abc",
				expiresAt: "2026-01-01T00:00:00Z",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const token = await createBankLinkToken("link", "http://api.test");
		expect(token.hostedLinkUrl).toContain("bankhub.sepay.vn");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("http://api.test/api/bank-link/link-token");
		expect(JSON.parse(init.body as string)).toEqual({ purpose: "link" });
	});

	test("surfaces the server error code (409 already linked)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes({ code: "BANK_LINK_ALREADY_LINKED" }, 409)),
		);
		const err = await createBankLinkToken("link", "http://api.test").catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(BankLinkRequestError);
		expect((err as BankLinkRequestError).code).toBe("BANK_LINK_ALREADY_LINKED");
	});
});

describe("syncBankLink", () => {
	test("POSTs and parses the refreshed status", async () => {
		const fetchMock = vi.fn(async () => jsonRes({ ...LINKED, status: "none" }));
		vi.stubGlobal("fetch", fetchMock);
		const status = await syncBankLink("http://api.test");
		expect(status.status).toBe("none");
		const [url] = fetchMock.mock.calls[0] as unknown as [string];
		expect(url).toBe("http://api.test/api/bank-link/sync");
	});
});
