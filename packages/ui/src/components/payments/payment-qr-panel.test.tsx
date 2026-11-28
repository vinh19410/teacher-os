import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const basePayable = {
	amount: 500000,
	paidAmount: 0,
	amountDue: 500000,
	status: "unpaid",
	payable: true,
	bank: {
		brandName: "MBBank",
		accountNumber: "0123456789",
		holderName: "NGUYEN VAN A",
	},
	memo: "TKPMMY MSMY7K2M9QXA",
	qrUrl: "https://vietqr.app/img?acc=0123456789",
};

describe("PaymentQrPanel", () => {
	it("renders QR title, image, and 5 copyable fields when payable with bank", () => {
		const html = renderToStaticMarkup(<PaymentQrPanel data={basePayable} />);
		expect(html).toContain("Chuyển khoản theo QR dưới đây");
		expect(html).toContain("vietqr.app");
		expect(html).toContain("Ngân hàng");
		expect(html).toContain("Số tài khoản");
		expect(html).toContain("Chủ tài khoản");
		expect(html).toContain("Số tiền");
		expect(html).toContain("Nội dung");
		expect(html).toContain("TKPMMY MSMY7K2M9QXA");
	});

	it("renders QR title and partial banner when partially paid with bank", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{
					...basePayable,
					paidAmount: 200000,
					amountDue: 300000,
				}}
			/>,
		);
		expect(html).toContain("Chuyển khoản theo QR dưới đây");
		expect(html).toContain("Đã nhận 200.000đ / 500.000đ");
		expect(html).toContain("vietqr.app");
	});

	it("hides QR title and bank fields when PAID", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{ ...basePayable, payable: false, reason: "PAID" }}
			/>,
		);
		expect(html).toContain("Đã thanh toán đủ");
		expect(html).not.toContain("Chuyển khoản theo QR dưới đây");
		expect(html).not.toContain("vietqr.app");
	});

	it("hides QR title when NO_BANK_LINK", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{
					...basePayable,
					payable: false,
					reason: "NO_BANK_LINK",
					bank: undefined,
					qrUrl: undefined,
				}}
			/>,
		);
		expect(html).toContain("Giáo viên chưa thiết lập nhận chuyển khoản");
		expect(html).not.toContain("Chuyển khoản theo QR dưới đây");
		expect(html).not.toContain("vietqr.app");
	});

	it("falls back to nolink guidance and hides QR title when payable is true without bank", () => {
		const html = renderToStaticMarkup(
			<PaymentQrPanel
				data={{
					...basePayable,
					payable: true,
					bank: undefined,
					qrUrl: undefined,
				}}
			/>,
		);
		expect(html).toContain("Giáo viên chưa thiết lập nhận chuyển khoản");
		expect(html).not.toContain("Chuyển khoản theo QR dưới đây");
	});
});
