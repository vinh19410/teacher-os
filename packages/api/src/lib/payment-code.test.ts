import { describe, expect, test } from "vitest";
import {
	extractPaymentCode,
	generatePaymentCode,
	generatePayToken,
	PAYMENT_CODE_RE,
} from "./payment-code";

describe("extractPaymentCode", () => {
	test("finds an uppercase code in transfer content", () => {
		expect(extractPaymentCode("TOS7K2M9QXA hoc phi")).toBe("TOS7K2M9QXA");
	});

	test("is case-insensitive and normalizes to uppercase", () => {
		expect(extractPaymentCode("SEVQR tos7k2m9qxa hoc phi")).toBe("TOS7K2M9QXA");
	});

	test("does not match a 9-character run (TOSHIBA…)", () => {
		expect(extractPaymentCode("TOSHIBA123 laptop")).toBeNull();
	});

	test("does not match random prose", () => {
		expect(extractPaymentCode("hoc phi thang 10 con Toan")).toBeNull();
	});

	test("prefers the dedicated payment_code field format", () => {
		expect(PAYMENT_CODE_RE.test("TOS7K2M9QXA")).toBe(true);
	});
});

describe("generatePaymentCode", () => {
	test("produces TOS + 8 alphabet chars", () => {
		for (let i = 0; i < 50; i += 1) {
			const code = generatePaymentCode();
			expect(code).toMatch(/^TOS[0-9A-HJKMNP-TV-Z]{8}$/);
		}
	});

	test("generates distinct codes across calls (WebCrypto source)", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 20; i += 1) {
			const code = generatePaymentCode();
			expect(code).toMatch(/^TOS[0-9A-HJKMNP-TV-Z]{8}$/);
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
