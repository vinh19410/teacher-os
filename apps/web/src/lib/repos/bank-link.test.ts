import { afterEach, describe, expect, test, vi } from "vitest";
import {
	BANK_LINK_DISABLED,
	BankLinkRequestError,
	fetchBankLink,
	removeBankLink,
	saveBankLink,
} from "./bank-link";

function jsonRes(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const LINKED = {
	enabled: true,
	reconcileEnabled: true,
	status: "linked",
	brandName: "MBBank",
	bankBin: "970422",
	bankCode: "MB",
	accountNumber: "0123456789",
	accountNumberMasked: "•••6789",
	vaCode: "",
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

	test("maps 503 SEPAY_DISABLED to the disabled status, not a throw", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes({ code: "SEPAY_DISABLED" }, 503)),
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

describe("saveBankLink", () => {
	test("PUTs normalized bank account and returns updated status", async () => {
		const fetchMock = vi.fn(async () => jsonRes(LINKED));
		vi.stubGlobal("fetch", fetchMock);
		const status = await saveBankLink(
			{
				bankBin: "970422",
				accountNumber: "0123456789",
				holderName: "NGUYEN VAN A",
			},
			"http://api.test",
		);
		expect(status).toEqual(LINKED);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("http://api.test/api/bank-link");
		expect(init.method).toBe("PUT");
	});

	test("surfaces the server error code (409 account in use)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonRes({ code: "BANK_LINK_ACCOUNT_ALREADY_IN_USE" }, 409),
			),
		);
		const err = await saveBankLink(
			{
				bankBin: "970422",
				accountNumber: "0123456789",
				holderName: "NGUYEN VAN A",
			},
			"http://api.test",
		).catch((e) => e);
		expect(err).toBeInstanceOf(BankLinkRequestError);
		expect((err as BankLinkRequestError).code).toBe(
			"BANK_LINK_ACCOUNT_ALREADY_IN_USE",
		);
	});
});

describe("removeBankLink", () => {
	test("DELETEs and parses the reset status", async () => {
		const fetchMock = vi.fn(async () =>
			jsonRes({
				...LINKED,
				status: "none",
				brandName: "",
				bankBin: "",
				bankCode: "",
				accountNumber: "",
				accountNumberMasked: "",
				holderName: "",
				linkedAt: null,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const status = await removeBankLink("http://api.test");
		expect(status.status).toBe("none");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("http://api.test/api/bank-link");
		expect(init.method).toBe("DELETE");
	});
});
