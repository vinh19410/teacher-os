import { describe, expect, test } from "vitest";
import {
	buildTransferMemo,
	buildVietQrUrl,
	formatTkpVaPrefix,
	matchesTkpVa,
	normalizeVaCode,
	VIETINBANK_BIN,
} from "./vietqr";

describe("TKP VA helpers", () => {
	test("normalizeVaCode strips spaces/hyphens and uppercases", () => {
		expect(normalizeVaCode(" mmy ")).toBe("MMY");
		expect(normalizeVaCode(" tkp-mmy ")).toBe("TKPMMY");
		expect(normalizeVaCode("")).toBe("");
	});

	test("formatTkpVaPrefix prepends TKP without double-prefixing", () => {
		expect(formatTkpVaPrefix("MMY")).toBe("TKPMMY");
		expect(formatTkpVaPrefix("mmy")).toBe("TKPMMY");
		expect(formatTkpVaPrefix("TKPMMY")).toBe("TKPMMY");
		expect(formatTkpVaPrefix(" TKP-MMY ")).toBe("TKPMMY");
		expect(formatTkpVaPrefix("")).toBe("");
	});

	test("matchesTkpVa checks subAccount/VA or falls back to content when empty", () => {
		expect(
			matchesTkpVa({ vaCode: "MMY", subAccount: "MMY", content: "" }),
		).toBe(true);
		expect(
			matchesTkpVa({ vaCode: "MMY", subAccount: "tkpmmy", content: "" }),
		).toBe(true);
		expect(
			matchesTkpVa({
				vaCode: "MMY",
				subAccount: "OTHER",
				content: "TKPMMY MSMY7K2M9QXA",
			}),
		).toBe(false);
		expect(
			matchesTkpVa({
				vaCode: "MMY",
				subAccount: "",
				content: "TKPMMY MSMY7K2M9QXA",
			}),
		).toBe(true);
		expect(
			matchesTkpVa({
				vaCode: "MMY",
				subAccount: "",
				content: "TKPMMYMSMY7K2M9QXA",
			}),
		).toBe(true);
		expect(
			matchesTkpVa({
				vaCode: "MMY",
				subAccount: "",
				content: "tra tien an trua",
			}),
		).toBe(false);
	});
});

describe("buildTransferMemo", () => {
	test("plain code for non-VietinBank without VA", () => {
		expect(buildTransferMemo({ code: "MSMY7K2M9QXA", bankBin: "970422" })).toBe(
			"MSMY7K2M9QXA",
		);
	});

	test("prepends TKPMMY for memo-based VA without doubling TKP", () => {
		expect(
			buildTransferMemo({
				code: "MSMY7K2M9QXA",
				bankBin: "970422",
				vaCode: "MMY",
			}),
		).toBe("TKPMMY MSMY7K2M9QXA");
		expect(
			buildTransferMemo({
				code: "MSMY7K2M9QXA",
				bankBin: "970422",
				vaCode: "TKPMMY",
			}),
		).toBe("TKPMMY MSMY7K2M9QXA");
	});

	test("prepends SEVQR before TKPMMY for VietinBank", () => {
		expect(
			buildTransferMemo({
				code: "MSMY7K2M9QXA",
				bankBin: VIETINBANK_BIN,
			}),
		).toBe("SEVQR MSMY7K2M9QXA");
		expect(
			buildTransferMemo({
				code: "MSMY7K2M9QXA",
				bankBin: VIETINBANK_BIN,
				vaCode: "MMY",
			}),
		).toBe("SEVQR TKPMMY MSMY7K2M9QXA");
	});
});

describe("buildVietQrUrl", () => {
	test("encodes every field and floors the amount", () => {
		const url = buildVietQrUrl({
			bin: "970422",
			accountNumber: "0123456789",
			amount: 500000.9,
			memo: "SEVQR TKPMMY MSMY7K2M9QXA",
		});
		const parsed = new URL(url);
		expect(parsed.origin).toBe("https://vietqr.app");
		expect(parsed.pathname).toBe("/img");
		expect(parsed.searchParams.get("acc")).toBe("0123456789");
		expect(parsed.searchParams.get("bank")).toBe("970422");
		expect(parsed.searchParams.get("amount")).toBe("500000");
		expect(parsed.searchParams.get("des")).toBe("SEVQR TKPMMY MSMY7K2M9QXA");
		expect(parsed.searchParams.get("template")).toBe("compact");
	});
});
