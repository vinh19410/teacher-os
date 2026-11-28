// @vitest-environment jsdom

import type { StudentInvoiceItem } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuitionList } from "./tuition-list";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href =
			typeof to === "string"
				? to.replace("$invoiceId", params?.invoiceId ?? "")
				: String(to);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

afterEach(cleanup);

function makeInvoice(
	overrides: Partial<StudentInvoiceItem> = {},
): StudentInvoiceItem {
	return {
		id: "inv-1",
		invoiceCode: "INV-00000001",
		amount: 1000,
		paidAmount: 0,
		amountDue: 1000,
		status: "unpaid",
		due: "2026-12-01",
		type: "Học phí tháng 12",
		...overrides,
	};
}

describe("TuitionList", () => {
	it("uses light card styling with text-destructive on Còn lại when debt remains", () => {
		render(<TuitionList invoices={[makeInvoice()]} />);

		const label = screen.getByText("Còn lại");
		const tile = label.parentElement;
		expect(tile).not.toBeNull();
		expect(tile?.className).toContain("bg-card");
		expect(tile?.className).toContain("border");
		expect(tile?.className).not.toContain("bg-primary");
		expect(tile?.className).not.toContain("bg-muted");

		const valueEl = tile?.children.item(1);
		expect(valueEl?.textContent).toBe("1.000đ");
		expect(valueEl?.className).toContain("text-destructive");
		expect(valueEl?.className).toContain("tabular-nums");
		expect(valueEl?.className).not.toContain("text-primary");
	});

	it("renders 0đ with text-foreground (not text-destructive) when all invoices are settled", () => {
		render(
			<TuitionList
				invoices={[
					makeInvoice({
						id: "inv-paid",
						amount: 1000,
						paidAmount: 0,
						amountDue: 1000,
						status: "paid",
					}),
				]}
			/>,
		);

		const label = screen.getByText("Còn lại");
		const tile = label.parentElement;
		expect(tile?.className).toContain("bg-card");
		expect(tile?.className).not.toContain("bg-primary");

		const valueEl = tile?.children.item(1);
		expect(valueEl?.textContent).toBe("0đ");
		expect(valueEl?.className).toContain("text-foreground");
		expect(valueEl?.className).not.toContain("text-destructive");
	});
});
