import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const payable = {
	invoiceCode: "INV-1",
	amount: 500000,
	paidAmount: 0,
	amountDue: 500000,
	status: "unpaid",
	due: "",
	note: "",
	payable: true,
	bank: {
		brandName: "MBBank",
		accountNumber: "0123456789",
		holderName: "NGUYEN VAN A",
	},
	memo: "TOS7K2M9QXA",
	qrUrl: "https://vietqr.app/img?acc=0123456789",
};

describe("PaymentQrPanel", () => {
	it("renders all five transfer fields plus the QR image when payable", () => {
		const html = renderToStaticMarkup(<PaymentQrPanel data={payable} />);
		expect(html).toContain("vietqr.app");
		expect(html).toContain(
			'alt="Mã QR chuyển khoản 500.000đ cho NGUYEN VAN A"',
		);
		for (const label of [
			"Ngân hàng",
			"Số tài khoản",
			"Chủ tài khoản",
			"Số tiền",
			"Nội dung",
		]) {
			expect(html).toContain(label);
		}
		expect(html).toContain("TOS7K2M9QXA");
		expect(html).toContain("500.000đ");
		expect(html).toContain("Giữ nguyên nội dung chuyển khoản");
	});

	it("renders the PAID state without any bank fields", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel data={{ ...payable, payable: false, reason: "PAID" }} />,
		);
		expect(html).toContain("Đã thanh toán đủ");
		expect(html).not.toContain("vietqr.app");
	});

	it("renders NO_BANK_LINK guidance", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{ ...payable, payable: false, reason: "NO_BANK_LINK" }}
			/>,
		);
		expect(html).toContain("Giáo viên chưa thiết lập nhận chuyển khoản");
	});

	it("renders the partial-payment progress line", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{
					...payable,
					paidAmount: 200000,
					amountDue: 300000,
					qrUrl: "https://vietqr.app/img?acc=1",
				}}
			/>,
		);
		expect(html).toContain("Đã nhận 200.000đ / 500.000đ");
	});
});
