import { describe, expect, test } from "vitest";
import {
	formatInvoiceCode,
	formatInvoiceVnd,
	isSafeHttpEmailUrl,
	isSafeVietQrUrl,
	renderInvoiceEmail,
} from "./invoice-email";

describe("invoice email helpers", () => {
	test("formatInvoiceCode and formatInvoiceVnd follow repo conventions", () => {
		expect(formatInvoiceCode("11111111-2222-3333-4444-abcdef123456")).toBe(
			"INV-EF123456",
		);
		expect(formatInvoiceCode("inv-9")).toBe("INV-INV-9");
		expect(formatInvoiceVnd(2_500_000)).toBe("2.500.000đ");
	});

	test("isSafeHttpEmailUrl accepts only absolute http/https URLs and rejects relative or unsafe schemes", () => {
		expect(isSafeHttpEmailUrl("https://lms.msmy.io.vn/pay/abc123")).toBe(true);
		expect(isSafeHttpEmailUrl("http://localhost:8001/pay/abc123")).toBe(true);
		expect(isSafeHttpEmailUrl("/tuition")).toBe(false);
		expect(isSafeHttpEmailUrl("//evil.com/pay")).toBe(false);
		expect(isSafeHttpEmailUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeHttpEmailUrl("data:text/html,<script>1</script>")).toBe(false);
		expect(isSafeHttpEmailUrl("https://user:pass@lms.msmy.io.vn/pay/1")).toBe(
			false,
		);
		expect(isSafeHttpEmailUrl("https://lms.msmy.io.vn/pay/a\nb")).toBe(false);
	});

	test("isSafeVietQrUrl allows only https://vietqr.app/img URLs", () => {
		expect(
			isSafeVietQrUrl(
				"https://vietqr.app/img?acc=0123456789&bank=970422&amount=1500000&des=MSMY1234&template=compact",
			),
		).toBe(true);
		expect(
			isSafeVietQrUrl(
				"http://vietqr.app/img?acc=0123456789&bank=970422&amount=1500000",
			),
		).toBe(false);
		expect(isSafeVietQrUrl("https://evil.example/img?acc=1")).toBe(false);
		expect(isSafeVietQrUrl("https://vietqr.app/other?acc=1")).toBe(false);
		expect(isSafeVietQrUrl("https://user@vietqr.app/img?acc=0123456789")).toBe(
			false,
		);
		expect(isSafeVietQrUrl("https://vietqr.app:8443/img?acc=0123456789")).toBe(
			false,
		);
	});
});

describe("renderInvoiceEmail", () => {
	test("renders issued variant with bank transfer, VietQR, note, pay CTA, and portal secondary link", () => {
		const rendered = renderInvoiceEmail({
			variant: "issued",
			invoiceId: "11111111-2222-3333-4444-555566667777",
			amountDue: 2_500_000,
			due: "2026-12-05",
			studentName: "Nguyễn Minh Anh",
			className: "IELTS 6.5 — Tối T3/T5",
			note: "Học phí tháng 12\nĐã bao gồm tài liệu",
			orgName: "Trung tâm Anh ngữ Minh Anh",
			payUrl: "https://lms.msmy.io.vn/pay/tok_1234567890abcdef",
			portalUrl:
				"https://lms.msmy.io.vn/student/tuition/11111111-2222-3333-4444-555566667777",
			payment: {
				bankBrandName: "MBBank",
				accountNumber: "0987654321",
				holderName: "NGUYEN THI MY",
				memo: "TKPMMY MSMY7K2M9QXA",
				qrUrl:
					"https://vietqr.app/img?acc=0987654321&bank=970422&amount=2500000&des=TKPMMY+MSMY7K2M9QXA&template=compact",
			},
		});

		expect(rendered.inboxTitle).toBe("Hóa đơn học phí");
		expect(rendered.subject).toBe("Hóa đơn học phí INV-66667777 — 2.500.000đ");
		expect(rendered.subject.startsWith("Hóa đơn học phí")).toBe(true);
		expect(rendered.inboxBody).toBe(
			"Hóa đơn học phí 2.500.000đ (Lớp IELTS 6.5 — Tối T3/T5) đã được tạo, hạn thanh toán 05/12/2026.",
		);
		expect(rendered.inboxBody).not.toContain("2026-12-05");

		expect(rendered.html).toContain("<!DOCTYPE html>");
		expect(rendered.html).toContain('lang="vi"');
		expect(rendered.html).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.html).toContain("INV-66667777");
		expect(rendered.html).toContain("2.500.000đ");
		expect(rendered.html).toContain("Thứ Bảy, 05/12/2026");
		expect(rendered.html).toContain("Học phí tháng 12<br>Đã bao gồm tài liệu");
		expect(rendered.html).toContain("Trung tâm Anh ngữ Minh Anh");
		expect(rendered.html).toContain("Cô Mỹ Dạy Tiếng Anh");
		expect(rendered.html).toContain("MBBank");
		expect(rendered.html).toContain("0987654321");
		expect(rendered.html).toContain("NGUYEN THI MY");
		expect(rendered.html).toContain("TKPMMY MSMY7K2M9QXA");
		expect(rendered.html).toContain("https://vietqr.app/img?");
		expect(rendered.html).toContain('width="200"');
		expect(rendered.html).toContain("height:auto");
		expect(rendered.html).toContain(
			'href="https://lms.msmy.io.vn/pay/tok_1234567890abcdef"',
		);
		expect(rendered.html).toContain(
			'href="https://lms.msmy.io.vn/student/tuition/11111111-2222-3333-4444-555566667777"',
		);
		expect(rendered.html.length).toBeLessThan(15_000);

		expect(rendered.text).toContain("Chào Nguyễn Minh Anh,");
		expect(rendered.text).toContain("- Mã hóa đơn: INV-66667777");
		expect(rendered.text).toContain("- Hạn thanh toán: Thứ Bảy, 05/12/2026");
		expect(rendered.text).toContain("Học phí tháng 12\nĐã bao gồm tài liệu");
		expect(rendered.text).toContain("Ngân hàng: MBBank");
		expect(rendered.text).toContain(
			"Nội dung chuyển khoản: TKPMMY MSMY7K2M9QXA",
		);
		expect(rendered.text).toContain(
			"https://lms.msmy.io.vn/pay/tok_1234567890abcdef",
		);
		expect(rendered.text).toContain(
			"https://lms.msmy.io.vn/student/tuition/11111111-2222-3333-4444-555566667777",
		);
	});

	test("forces white .qr-plate background in both dark mode media query and [data-ogsc]", () => {
		const rendered = renderInvoiceEmail({
			variant: "issued",
			invoiceId: "inv-dark",
			amountDue: 1_000_000,
			due: "2026-12-01",
			payment: {
				bankBrandName: "ACB",
				accountNumber: "123456",
				holderName: "CO MY",
				memo: "MSMY1111",
				qrUrl:
					"https://vietqr.app/img?acc=123456&bank=970416&amount=1000000&des=MSMY1111&template=compact",
			},
		});

		expect(rendered.html).toContain('class="qr-plate"');
		expect(rendered.html).toMatch(
			/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*?\.qr-plate\s*\{\s*background-color:\s*#ffffff\s*!important;/,
		);
		expect(rendered.html).toMatch(
			/\[data-ogsc\]\s*\.qr-plate\s*\{\s*background-color:\s*#ffffff\s*!important;/,
		);
	});

	test("renders reminder variant with partial payment breakdown in HTML/text while keeping totalAmount out of inboxBody", () => {
		const rendered = renderInvoiceEmail({
			variant: "reminder",
			invoiceId: "inv-partial-01",
			amountDue: 2_500_000,
			totalAmount: 4_500_000,
			paidAmount: 2_000_000,
			due: "2026-11-28",
			vnToday: "2026-11-28",
			studentName: "Trần Thu Hà",
			className: "IELTS 6.5A",
			portalUrl: "https://lms.msmy.io.vn/student/tuition/inv-partial-01",
		});

		expect(rendered.inboxTitle).toBe("Nhắc học phí");
		expect(rendered.subject).toBe("Nhắc học phí INV-RTIAL-01 — 2.500.000đ");
		expect(rendered.subject.startsWith("Nhắc học phí")).toBe(true);
		expect(rendered.subject).not.toContain("4.500.000đ");
		expect(rendered.inboxBody).toContain("2.500.000đ");
		expect(rendered.inboxBody).toContain("28/11/2026");
		expect(rendered.inboxBody).not.toContain("4.500.000đ");
		expect(rendered.inboxBody).not.toContain("quá hạn");

		expect(rendered.html).toContain("2.500.000đ");
		expect(rendered.html).toContain("4.500.000đ");
		expect(rendered.html).toContain("2.000.000đ");
		expect(rendered.html).toContain("Xem hóa đơn trên cổng học viên");
		expect(rendered.html).not.toContain("Mở trang thanh toán");

		expect(rendered.text).toContain("Tổng hóa đơn: 4.500.000đ");
		expect(rendered.text).toContain("Đã thanh toán: 2.000.000đ");
		expect(rendered.text).toContain("Còn lại cần thanh toán: 2.500.000đ");
	});

	test("marks reminder email as overdue only when due < vnToday and both are valid ISO dates", () => {
		const overdue = renderInvoiceEmail({
			variant: "reminder",
			invoiceId: "inv-late",
			amountDue: 1_500_000,
			due: "2026-11-20",
			vnToday: "2026-11-28",
		});
		expect(overdue.subject.startsWith("Nhắc học phí")).toBe(true);
		expect(overdue.html).toContain("Quá hạn");
		expect(overdue.html).toContain('class="badge-overdue"');
		expect(overdue.text).toContain("Quá hạn");

		const emptyDue = renderInvoiceEmail({
			variant: "reminder",
			invoiceId: "inv-empty-due",
			amountDue: 1_500_000,
			due: "",
			vnToday: "2026-11-28",
		});
		expect(emptyDue.html).toContain('class="badge-reminder"');
		expect(emptyDue.html).not.toContain('class="badge-overdue"');
		expect(emptyDue.html).not.toContain("badge-overdue");
		expect(emptyDue.html).not.toContain("Hạn thanh toán");
		expect(emptyDue.inboxBody).toBe(
			"Hóa đơn học phí 1.500.000đ. Vui lòng thanh toán đúng hạn.",
		);
	});

	test("renders minimal unlinked email cleanly and omits redundant orgName when equal to brandName", () => {
		const rendered = renderInvoiceEmail({
			variant: "issued",
			invoiceId: "inv-min",
			amountDue: 500_000,
			due: "2026-12-10",
			orgName: "Cô Mỹ Dạy Tiếng Anh",
			brandName: "Cô Mỹ Dạy Tiếng Anh",
		});

		expect(rendered.html).toContain("Chào bạn,");
		expect(rendered.html).not.toContain("Thông tin chuyển khoản");
		expect(rendered.html).not.toContain("<img ");
		expect(rendered.html).not.toContain("<a ");
		expect(rendered.html).toContain(
			"Email này được gửi từ Cô Mỹ Dạy Tiếng Anh.",
		);
		expect(rendered.html).not.toContain(
			"Cô Mỹ Dạy Tiếng Anh · Cô Mỹ Dạy Tiếng Anh",
		);
	});

	test("escapes XSS in all fields and rejects relative/unsafe CTA and non-vietqr QR URLs", () => {
		const rendered = renderInvoiceEmail({
			variant: "issued",
			invoiceId: "inv-xss",
			amountDue: 900_000,
			due: "2026-12-01",
			studentName: '<script>alert("stu")</script>',
			className: '<img src=x onerror="alert(1)">',
			orgName: 'Org "A" & <B>',
			note: '<b>Note</b>\nLine "2"',
			payUrl: "javascript:alert(1)",
			portalUrl: "/tuition/inv-xss",
			payment: {
				bankBrandName: "<svg onload=alert(1)>",
				accountNumber: "123<456>",
				holderName: 'CHU "TK"',
				memo: "MSMY<script>",
				qrUrl: "https://evil.example/img?acc=1",
			},
		});

		expect(rendered.html).not.toContain("<script>");
		expect(rendered.html).not.toContain("<svg");
		expect(rendered.html).not.toContain("javascript:");
		expect(rendered.html).not.toContain('href="/tuition/inv-xss"');
		expect(rendered.html).not.toContain("<a ");
		expect(rendered.html).not.toContain("<img ");
		expect(rendered.html).toContain(
			"&lt;script&gt;alert(&quot;stu&quot;)&lt;/script&gt;",
		);
		expect(rendered.html).toContain(
			"&lt;b&gt;Note&lt;/b&gt;<br>Line &quot;2&quot;",
		);
		expect(rendered.html).toContain("Thông tin chuyển khoản");
		expect(rendered.html).toContain("&lt;svg onload=alert(1)&gt;");
	});
});
