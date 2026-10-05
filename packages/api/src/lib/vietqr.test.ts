import { describe, expect, test } from "vitest";
import { buildTransferMemo, buildVietQrUrl, VIETINBANK_BIN } from "./vietqr";

describe("buildTransferMemo", () => {
	test("plain code for non-VietinBank", () => {
		expect(buildTransferMemo({ code: "TOS7K2M9QXA", bankBin: "970422" })).toBe(
			"TOS7K2M9QXA",
		);
	});

	test("prepends SEVQR for VietinBank", () => {
		expect(
			buildTransferMemo({ code: "TOS7K2M9QXA", bankBin: VIETINBANK_BIN }),
		).toBe("SEVQR TOS7K2M9QXA");
	});
});

describe("buildVietQrUrl", () => {
	test("encodes every field and floors the amount", () => {
		const url = buildVietQrUrl({
			bin: "970422",
			accountNumber: "0123456789",
			amount: 500000.9,
			memo: "SEVQR TOS7K2M9QXA",
		});
		const parsed = new URL(url);
		expect(parsed.origin).toBe("https://vietqr.app");
		expect(parsed.pathname).toBe("/img");
		expect(parsed.searchParams.get("acc")).toBe("0123456789");
		expect(parsed.searchParams.get("bank")).toBe("970422");
		expect(parsed.searchParams.get("amount")).toBe("500000");
		expect(parsed.searchParams.get("des")).toBe("SEVQR TOS7K2M9QXA");
		expect(parsed.searchParams.get("template")).toBe("compact");
	});
});
