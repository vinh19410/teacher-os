import { describe, expect, test } from "vitest";

import {
	formatRemainingVND,
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_VARIANT,
	invoiceCode,
	invoiceRemainingLabel,
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

// #340 — copy đơn nguồn của nhãn "còn Xđ" dùng chung roster + /tuition + hồ sơ.
describe("formatRemainingVND (#340)", () => {
	test("prefix 'còn ' + fmtVND", () => {
		expect(formatRemainingVND(8000000)).toBe("còn 8.000.000đ");
		expect(formatRemainingVND(400000)).toBe("còn 400.000đ");
	});
});

describe("invoiceRemainingLabel (#340)", () => {
	test("paid → null (badge Đã thu tự nói đủ)", () => {
		expect(
			invoiceRemainingLabel({
				amount: 10000000,
				paidAmount: 0,
				status: "paid",
			}),
		).toBeNull();
	});

	test("chưa thu gì (paidAmount 0) → null — cell Số tiền đã hiện đủ amount", () => {
		expect(
			invoiceRemainingLabel({
				amount: 10000000,
				paidAmount: 0,
				status: "unpaid",
			}),
		).toBeNull();
	});

	test("thu một phần → 'còn Xđ'", () => {
		expect(
			invoiceRemainingLabel({
				amount: 10000000,
				paidAmount: 2000000,
				status: "unpaid",
			}),
		).toBe("còn 8.000.000đ");
	});

	test("thu một phần quá hạn → vẫn 'còn Xđ' (đỏ do caller styling)", () => {
		expect(
			invoiceRemainingLabel({
				amount: 10000000,
				paidAmount: 2000000,
				status: "overdue",
			}),
		).toBe("còn 8.000.000đ");
	});

	test("overpay clamp → null (tránh 'còn 0đ')", () => {
		expect(
			invoiceRemainingLabel({
				amount: 400000,
				paidAmount: 500000,
				status: "unpaid",
			}),
		).toBeNull();
	});
});
