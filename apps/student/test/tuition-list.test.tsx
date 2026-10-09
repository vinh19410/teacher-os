import type { StudentInvoiceItem } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// TuitionList dùng TanStack Link (#320) — stub thành <a> thuần để
// renderToStaticMarkup chạy không cần router context (same overview.test.tsx).
vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		params?: Record<string, string>;
		children: React.ReactNode;
	}) => (
		<a
			href={Object.entries(props.params ?? {}).reduce(
				(href, [key, value]) => href.replace(`$${key}`, value),
				props.to,
			)}
		>
			{props.children}
		</a>
	),
}));

import { TuitionList } from "@/components/overview/tuition-list";

const baseInvoice: StudentInvoiceItem = {
	id: "inv-1",
	invoiceCode: "INV-0001",
	amount: 5_000_000,
	paidAmount: 0,
	amountDue: 5_000_000,
	status: "unpaid",
	due: "2099-01-31",
	type: "Học phí",
};

describe("TuitionList", () => {
	it("hóa đơn trả đủ (amountDue = 0) hiện gọn: số tiền + badge Đã thanh toán", () => {
		const settled: StudentInvoiceItem = {
			...baseInvoice,
			paidAmount: 5_000_000,
			amountDue: 0,
		};
		const html = renderToStaticMarkup(<TuitionList invoices={[settled]} />);
		expect(html).toContain("Đã thanh toán");
		expect(html).toContain("5.000.000đ");
		// Không còn dòng 0đ ở cột phải của row (ô "Còn lại" tổng vẫn 0đ là đúng).
		expect(html).not.toContain(">0đ</span>");
		expect(html).not.toContain("Đã nhận");
		expect(html).not.toContain("Hạn 2099");
		// Row vẫn là link sang trang chi tiết.
		expect(html).toContain('href="/tuition/inv-1"');
	});

	it("hóa đơn thu tay (status paid, paidAmount 0) tính vào Đã đóng, không vào Còn lại", () => {
		const markPaid: StudentInvoiceItem = {
			...baseInvoice,
			id: "inv-2",
			status: "paid",
			paidAmount: 0,
			amountDue: 5_000_000,
		};
		const html = renderToStaticMarkup(<TuitionList invoices={[markPaid]} />);
		expect(html).toContain("Đã thanh toán");
		expect(html).not.toContain(">0đ</span>");
		expect(html).not.toContain("Đã nhận");
		// Pin tổng ở MiniStat (tiền nằm trong <div>, row amount là <span>):
		// "Đã đóng" = đủ amount, "Còn lại" = 0đ.
		expect(html).toContain(">5.000.000đ</div>");
		expect(html).toContain(">0đ</div>");
	});

	it("danh sách trộn: settled + đóng một phần cộng đúng cả hai tổng", () => {
		const settled: StudentInvoiceItem = {
			...baseInvoice,
			id: "inv-4",
			paidAmount: 5_000_000,
			amountDue: 0,
		};
		const partial: StudentInvoiceItem = {
			...baseInvoice,
			id: "inv-3",
			paidAmount: 2_000_000,
			amountDue: 3_000_000,
		};
		const html = renderToStaticMarkup(
			<TuitionList invoices={[settled, partial]} />,
		);
		// Đã đóng = 5tr (settled đủ) + 2tr (partial đã nhận); Còn lại = 3tr.
		expect(html).toContain(">7.000.000đ</div>");
		expect(html).toContain(">3.000.000đ</div>");
		expect(html).toContain("Đã thanh toán");
	});

	it("hóa đơn đóng một phần giữ nguyên hiển thị, không có badge", () => {
		const partial: StudentInvoiceItem = {
			...baseInvoice,
			id: "inv-3",
			paidAmount: 2_000_000,
			amountDue: 3_000_000,
		};
		const html = renderToStaticMarkup(<TuitionList invoices={[partial]} />);
		expect(html).not.toContain("Đã thanh toán");
		expect(html).toContain("Hạn 2099-01-31");
		expect(html).toContain("Đã nhận 2.000.000đ / 5.000.000đ");
		expect(html).toContain("3.000.000đ");
	});

	it("mảng rỗng không render gì", () => {
		const html = renderToStaticMarkup(<TuitionList invoices={[]} />);
		expect(html).toBe("");
	});
});
