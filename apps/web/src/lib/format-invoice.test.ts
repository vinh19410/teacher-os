import { describe, expect, test } from "vitest";

import {
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_VARIANT,
	invoiceCode,
	invoiceType,
} from "./format-invoice";

describe("invoiceCode (issue #176)", () => {
	test("uses INV + the last 8 chars uppercased", () => {
		expect(invoiceCode("0f2a91bc-77d1-4c0e-9f6a-1b2c3d4e5f60")).toBe(
			"INV-3D4E5F60",
		);
	});

	test("keeps short ids intact", () => {
		expect(invoiceCode("abc")).toBe("INV-ABC");
	});
});

describe("invoiceType (issue #176)", () => {
	test("empty or whitespace type falls back to Khác", () => {
		expect(invoiceType("")).toBe("Khác");
		expect(invoiceType("   ")).toBe("Khác");
	});

	test("a real type passes through untouched", () => {
		expect(invoiceType("Gói học viên")).toBe("Gói học viên");
	});
});

describe("INVOICE_STATUS_LABEL / INVOICE_STATUS_VARIANT (#322)", () => {
	test("map đủ 3 trạng thái — nhãn khớp /tuition, variant khớp Badge", () => {
		expect(Object.keys(INVOICE_STATUS_LABEL).sort()).toEqual([
			"overdue",
			"paid",
			"unpaid",
		]);
		expect(INVOICE_STATUS_LABEL).toEqual({
			paid: "Đã thu",
			unpaid: "Chưa thu",
			overdue: "Quá hạn",
		});
		expect(INVOICE_STATUS_VARIANT).toEqual({
			paid: "success",
			unpaid: "warn",
			overdue: "danger",
		});
	});
});
