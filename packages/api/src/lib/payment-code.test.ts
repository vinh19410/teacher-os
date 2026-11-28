import { describe, expect, test } from "vitest";
import {
	extractPaymentCode,
	generatePaymentCode,
	generatePayToken,
	PAYMENT_CODE_RE,
} from "./payment-code";

describe("extractPaymentCode", () => {
	test("finds an uppercase MSMY code in transfer content", () => {
		expect(extractPaymentCode("MSMY7K2M9QXA hoc phi")).toBe("MSMY7K2M9QXA");
	});

	test("finds MSMY code preceded by TKP VA prefix (spaced or glued)", () => {
		expect(extractPaymentCode("TKPMMY MSMY7K2M9QXA")).toBe("MSMY7K2M9QXA");
		expect(extractPaymentCode("tkpmmy msmy7k2m9qxa hoc phi")).toBe(
			"MSMY7K2M9QXA",
		);
		expect(extractPaymentCode("TKPMMYMSMY7K2M9QXA")).toBe("MSMY7K2M9QXA");
		expect(extractPaymentCode("SEVQR TKPMMY MSMY7K2M9QXA")).toBe(
			"MSMY7K2M9QXA",
		);
	});

	test("keeps accepting legacy TOS codes case-insensitively", () => {
		expect(extractPaymentCode("TOS7K2M9QXA hoc phi")).toBe("TOS7K2M9QXA");
		expect(extractPaymentCode("SEVQR tos7k2m9qxa hoc phi")).toBe("TOS7K2M9QXA");
	});

	test("does not match longer runs or random prose", () => {
		expect(extractPaymentCode("MSMY7K2M9QXA1 hoc phi")).toBeNull();
		expect(extractPaymentCode("XMSMY7K2M9QXA hoc phi")).toBeNull();
		expect(extractPaymentCode("TOSHIBA123 laptop")).toBeNull();
		expect(extractPaymentCode("hoc phi thang 10 con Toan")).toBeNull();
	});

	test("prefers the dedicated payment_code field format", () => {
		expect(PAYMENT_CODE_RE.test("MSMY7K2M9QXA")).toBe(true);
		expect(PAYMENT_CODE_RE.test("TOS7K2M9QXA")).toBe(true);
	});
});

describe("generatePaymentCode", () => {
	test("produces MSMY + 8 alphabet chars", () => {
		for (let i = 0; i < 50; i += 1) {
			const code = generatePaymentCode();
			expect(code).toMatch(/^MSMY[0-9A-HJKMNP-TV-Z]{8}$/);
		}
	});

	test("generates distinct codes across calls (WebCrypto source)", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 20; i += 1) {
			const code = generatePaymentCode();
			expect(code).toMatch(/^MSMY[0-9A-HJKMNP-TV-Z]{8}$/);
			seen.add(code);
		}
		expect(seen.size).toBeGreaterThan(15);
	});
});

describe("generatePayToken", () => {
	test("is a 22-char URL-safe token", () => {
		const token = generatePayToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
	});

	test("tokens differ", () => {
		expect(generatePayToken()).not.toBe(generatePayToken());
	});
});
