import { normalizeMultilineText } from "./class-opening-email";
import {
	escapeEmailHtml,
	hasControlChars,
	sanitizeSingleLine,
} from "./email-html";
import { formatViDateDisplay, formatViWeekdayDate } from "./vietnam-date";

const DEFAULT_BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh";
const EMAIL_FONT_STACK =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const EMAIL_MONO_STACK = "'SFMono-Regular',Consolas,Menlo,monospace";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type InvoiceEmailVariant = "issued" | "reminder";

export interface InvoiceEmailPaymentInfo {
	bankBrandName: string;
	accountNumber: string;
	holderName: string;
	memo: string;
	qrUrl?: string | null;
}

export interface InvoiceEmailInput {
	variant: InvoiceEmailVariant;
	invoiceId: string;
	invoiceCode?: string;
	amountDue: number;
	totalAmount?: number;
	paidAmount?: number;
	due: string;
	vnToday?: string;
	studentName?: string;
	className?: string;
	note?: string;
	orgName?: string;
	brandName?: string;
	payUrl?: string;
	portalUrl?: string;
	payment?: InvoiceEmailPaymentInfo | null;
}

export interface RenderedInvoiceEmail {
	subject: string;
	html: string;
	text: string;
	inboxTitle: string;
	inboxBody: string;
}

export function formatInvoiceCode(invoiceId: string): string {
	return `INV-${invoiceId.slice(-8).toUpperCase()}`;
}

export function formatInvoiceVnd(amount: number): string {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

/**
 * Only allow absolute http/https URLs without credentials, whitespace, or control chars
 * for email links (never emit relative paths like `/tuition` in email HTML/text).
 */
export function isSafeHttpEmailUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed || hasControlChars(trimmed) || /\s/.test(trimmed)) return false;
	if (!/^https?:\/\//i.test(trimmed)) return false;
	try {
		const parsed = new URL(trimmed);
		return (
			(parsed.protocol === "https:" || parsed.protocol === "http:") &&
			parsed.hostname.length > 0 &&
			!parsed.username &&
			!parsed.password
		);
	} catch {
		return false;
	}
}

/** Strict allowlist for VietQR image URLs embedded inside email HTML. */
export function isSafeVietQrUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed || hasControlChars(trimmed) || /\s/.test(trimmed)) return false;
	try {
		const parsed = new URL(trimmed);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname === "vietqr.app" &&
			parsed.port === "" &&
			parsed.pathname === "/img" &&
			!parsed.username &&
			!parsed.password
		);
	} catch {
		return false;
	}
}

function renderKeyValueRows(
	rows: Array<{
		label: string;
		value: string;
		mono?: boolean;
		highlight?: boolean;
	}>,
): string {
	return rows
		.map((row, index) => {
			const isLast = index === rows.length - 1;
			const borderCss = isLast ? "" : "border-bottom:1px solid #e5e5e5;";
			const borderClass = isLast ? "" : " border-row";
			const valueFont = row.mono ? `font-family:${EMAIL_MONO_STACK};` : "";
			const tdFont = row.highlight ? "" : valueFont;
			const valueHtml = row.highlight
				? `<span class="memo-pill" style="display:inline-block;padding:2px 8px;border-radius:6px;background-color:#f5f5f5;border:1px solid #d4d4d4;${valueFont}font-weight:700;">${escapeEmailHtml(row.value)}</span>`
				: escapeEmailHtml(row.value);
			return (
				"<tr>" +
				`<td class="text-muted${borderClass}" style="padding:10px 14px;${borderCss}font-size:13px;line-height:20px;color:#525252;vertical-align:top;width:44%;">${escapeEmailHtml(row.label)}</td>` +
				`<td class="text-main${borderClass}" style="padding:10px 14px;${borderCss}font-size:14px;line-height:20px;font-weight:600;color:#171717;text-align:right;vertical-align:top;${tdFont}">${valueHtml}</td>` +
				"</tr>"
			);
		})
		.join("");
}

export function renderInvoiceEmail(
	input: InvoiceEmailInput,
): RenderedInvoiceEmail {
	const isReminder = input.variant === "reminder";
	const cleanCode =
		sanitizeSingleLine(input.invoiceCode ?? "") ||
		formatInvoiceCode(input.invoiceId);
	const amountDue = Math.max(0, Math.round(input.amountDue));
	const amountDueDisplay = formatInvoiceVnd(amountDue);
	const hasPartialPayment =
		isReminder &&
		typeof input.paidAmount === "number" &&
		input.paidAmount > 0 &&
		typeof input.totalAmount === "number" &&
		input.totalAmount > amountDue;
	const totalAmountDisplay =
		typeof input.totalAmount === "number"
			? formatInvoiceVnd(Math.max(0, Math.round(input.totalAmount)))
			: amountDueDisplay;
	const paidAmountDisplay =
		typeof input.paidAmount === "number"
			? formatInvoiceVnd(Math.max(0, Math.round(input.paidAmount)))
			: "";

	const trimmedDue = sanitizeSingleLine(input.due);
	const trimmedVnToday = sanitizeSingleLine(input.vnToday ?? "");
	const isOverdue =
		isReminder &&
		ISO_DATE_RE.test(trimmedDue) &&
		ISO_DATE_RE.test(trimmedVnToday) &&
		trimmedDue < trimmedVnToday;

	const dueDisplay = trimmedDue
		? sanitizeSingleLine(
				formatViWeekdayDate(trimmedDue) ||
					formatViDateDisplay(trimmedDue) ||
					trimmedDue,
			)
		: "";
	const dueShort = trimmedDue
		? sanitizeSingleLine(formatViDateDisplay(trimmedDue) || trimmedDue)
		: "";

	const studentName = sanitizeSingleLine(input.studentName ?? "");
	const className = sanitizeSingleLine(input.className ?? "");
	const note = normalizeMultilineText(input.note ?? "");
	const brandName =
		sanitizeSingleLine(input.brandName ?? "") || DEFAULT_BRAND_NAME;
	const orgName = sanitizeSingleLine(input.orgName ?? "");
	const showOrgName =
		orgName.length > 0 && orgName.toLowerCase() !== brandName.toLowerCase();
	const footerBrand = showOrgName ? `${orgName} · ${brandName}` : brandName;

	const inboxTitle = isReminder ? "Nhắc học phí" : "Hóa đơn học phí";
	const subject = `${inboxTitle} ${cleanCode} — ${amountDueDisplay}`;
	const classClause = className ? ` (Lớp ${className})` : "";

	const inboxBody = isReminder
		? `Hóa đơn học phí ${amountDueDisplay}${classClause}${dueShort ? ` đến hạn ngày ${dueShort}` : ""}. Vui lòng thanh toán đúng hạn.`
		: `Hóa đơn học phí ${amountDueDisplay}${classClause} đã được tạo${dueShort ? `, hạn thanh toán ${dueShort}` : ""}.`;

	const badgeClass = isOverdue
		? "badge-overdue"
		: isReminder
			? "badge-reminder"
			: "badge-issued";
	const badgeInlineStyle = isOverdue
		? "background-color:#fef2f2;border:1px solid #fecaca;color:#991b1b;"
		: isReminder
			? "background-color:#fffbeb;border:1px solid #fde68a;color:#92400e;"
			: "background-color:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;";
	const badgeDotColor = isOverdue
		? "#dc2626"
		: isReminder
			? "#d97706"
			: "#059669";
	const badgeLabel = isOverdue
		? "Quá hạn thanh toán"
		: isReminder
			? "Nhắc học phí"
			: "Hóa đơn học phí";

	const heading = isOverdue
		? "Hóa đơn học phí đã quá hạn"
		: isReminder
			? "Nhắc thanh toán học phí"
			: "Thông báo hóa đơn học phí";
	const greeting = studentName ? `Chào ${studentName},` : "Chào bạn,";
	const intro = isOverdue
		? `Hóa đơn học phí ${cleanCode}${className ? ` cho lớp ${className}` : ""} đã qua hạn thanh toán. Vui lòng kiểm tra thông tin bên dưới và hoàn tất thanh toán sớm.`
		: isReminder
			? `Đây là lời nhắc thanh toán cho hóa đơn học phí ${cleanCode}${className ? ` của lớp ${className}` : ""}. Vui lòng kiểm tra số tiền và hạn thanh toán bên dưới.`
			: `Hóa đơn học phí ${cleanCode}${className ? ` cho lớp ${className}` : ""} vừa được tạo. Dưới đây là chi tiết hóa đơn và hướng dẫn thanh toán.`;

	const detailRows: Array<{ label: string; value: string; mono?: boolean }> = [
		{ label: "Mã hóa đơn", value: cleanCode, mono: true },
	];
	if (studentName) detailRows.push({ label: "Học viên", value: studentName });
	if (className) detailRows.push({ label: "Lớp học", value: className });
	if (hasPartialPayment) {
		detailRows.push({
			label: "Tổng hóa đơn",
			value: totalAmountDisplay,
			mono: true,
		});
		detailRows.push({
			label: "Đã thanh toán",
			value: paidAmountDisplay,
			mono: true,
		});
		detailRows.push({
			label: "Còn lại cần thanh toán",
			value: amountDueDisplay,
			mono: true,
		});
	} else {
		detailRows.push({ label: "Số tiền", value: amountDueDisplay, mono: true });
	}
	if (dueDisplay) {
		detailRows.push({ label: "Hạn thanh toán", value: dueDisplay });
	}

	const rawPayment = input.payment;
	const cleanBank = rawPayment
		? {
				bankBrandName: sanitizeSingleLine(rawPayment.bankBrandName),
				accountNumber: sanitizeSingleLine(rawPayment.accountNumber),
				holderName: sanitizeSingleLine(rawPayment.holderName),
				memo: sanitizeSingleLine(rawPayment.memo),
				qrUrl:
					rawPayment.qrUrl && isSafeVietQrUrl(rawPayment.qrUrl)
						? rawPayment.qrUrl.trim()
						: "",
			}
		: null;
	const hasBankTransfer =
		cleanBank !== null &&
		cleanBank.bankBrandName.length > 0 &&
		cleanBank.accountNumber.length > 0 &&
		cleanBank.holderName.length > 0 &&
		cleanBank.memo.length > 0;

	const rawPayUrl = input.payUrl?.trim() ?? "";
	const safePayUrl = isSafeHttpEmailUrl(rawPayUrl) ? rawPayUrl : "";
	const rawPortalUrl = input.portalUrl?.trim() ?? "";
	const safePortalUrl = isSafeHttpEmailUrl(rawPortalUrl) ? rawPortalUrl : "";

	const primaryUrl = safePayUrl || safePortalUrl;
	const primaryLabel = safePayUrl
		? "Mở trang thanh toán"
		: "Xem hóa đơn trên cổng học viên";
	const secondaryPortalUrl = safePayUrl ? safePortalUrl : "";

	const headerOrgHtml = showOrgName
		? `<div class="text-muted" style="margin:3px 0 0 0;font-size:12px;line-height:18px;color:#737373;">${escapeEmailHtml(orgName)}</div>`
		: "";

	const heroLabel = hasPartialPayment
		? "Còn lại cần thanh toán"
		: "Số tiền cần thanh toán";
	const heroDueHtml = dueDisplay
		? `<div class="${isOverdue ? "text-danger" : "text-muted"}" style="margin:6px 0 0 0;font-size:13px;line-height:18px;color:${isOverdue ? "#b91c1c" : "#525252"};">Hạn thanh toán: <strong>${escapeEmailHtml(dueDisplay)}</strong></div>`
		: "";
	const heroPartialHtml = hasPartialPayment
		? `<div class="text-muted" style="margin:4px 0 0 0;font-size:12px;line-height:18px;color:#737373;">Đã thanh toán ${escapeEmailHtml(paidAmountDisplay)} / ${escapeEmailHtml(totalAmountDisplay)}</div>`
		: "";

	const noteHtml = note
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-callout" style="margin:0 0 20px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-left:3px solid #171717;border-radius:8px;border-collapse:separate;">` +
			`<tr><td style="padding:12px 14px;">` +
			`<div class="text-main" style="margin:0 0 4px 0;font-size:13px;line-height:18px;font-weight:600;color:#171717;">Ghi chú hóa đơn</div>` +
			`<div class="text-body" style="margin:0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(note).replace(/\n/g, "<br>")}</div>` +
			"</td></tr></table>"
		: "";

	let paymentHtml = "";
	if (hasBankTransfer && cleanBank) {
		const qrBlockHtml = cleanBank.qrUrl
			? `<div style="text-align:center;margin:0 0 14px 0;">` +
				`<div class="qr-plate" style="display:inline-block;padding:12px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">` +
				`<img src="${escapeEmailHtml(cleanBank.qrUrl)}" alt="${escapeEmailHtml(`Mã QR chuyển khoản ${amountDueDisplay} cho ${cleanBank.holderName}`)}" width="200" style="display:block;margin:0 auto;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;background-color:#ffffff;">` +
				"</div>" +
				`<p class="text-muted" style="margin:8px 0 0 0;font-size:12px;line-height:18px;color:#737373;">Mã QR hiển thị số tiền tại thời điểm gửi email. Mở trang thanh toán trực tuyến để xem số dư mới nhất.</p>` +
				"</div>"
			: "";

		const transferRowsHtml = renderKeyValueRows([
			{ label: "Ngân hàng", value: cleanBank.bankBrandName },
			{ label: "Số tài khoản", value: cleanBank.accountNumber, mono: true },
			{ label: "Chủ tài khoản", value: cleanBank.holderName },
			{ label: "Số tiền", value: amountDueDisplay, mono: true },
			{
				label: "Nội dung chuyển khoản",
				value: cleanBank.memo,
				mono: true,
				highlight: true,
			},
		]);

		paymentHtml =
			`<div style="margin:0 0 20px 0;">` +
			`<div class="text-main" style="margin:0 0 10px 0;font-size:14px;line-height:20px;font-weight:600;color:#171717;">Thông tin chuyển khoản</div>` +
			qrBlockHtml +
			`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-surface" style="margin:0 0 8px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;border-collapse:separate;overflow:hidden;">` +
			transferRowsHtml +
			"</table>" +
			`<p class="text-muted" style="margin:0;font-size:12px;line-height:18px;color:#737373;">Vui lòng giữ nguyên nội dung chuyển khoản để hệ thống tự động xác nhận thanh toán.</p>` +
			"</div>";
	}

	let ctaHtml = "";
	if (primaryUrl) {
		const escapedPrimary = escapeEmailHtml(primaryUrl);
		const secondaryHtml = secondaryPortalUrl
			? `<p style="margin:0 0 12px 0;font-size:13px;line-height:20px;"><a href="${escapeEmailHtml(secondaryPortalUrl)}" target="_blank" rel="noopener noreferrer" class="link-accent" style="color:#171717;text-decoration:underline;font-weight:500;">Xem hóa đơn trên cổng học viên →</a></p>`
			: "";
		ctaHtml =
			`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">` +
			`<tr><td class="cta-cell" bgcolor="#171717" style="border-radius:8px;background-color:#171717;">` +
			`<a href="${escapedPrimary}" target="_blank" rel="noopener noreferrer" class="cta-btn" style="display:inline-block;padding:12px 24px;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#171717;">${escapeEmailHtml(primaryLabel)}</a>` +
			"</td></tr></table>" +
			secondaryHtml +
			`<p class="text-muted" style="margin:0 0 4px 0;font-size:12px;line-height:18px;color:#737373;">Nếu nút không hoạt động, hãy sao chép và mở đường dẫn sau:</p>` +
			`<p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${escapedPrimary}" target="_blank" rel="noopener noreferrer" class="link-accent" style="color:#171717;text-decoration:underline;">${escapedPrimary}</a></p>`;
	}

	const badgeDarkCss =
		badgeClass === "badge-overdue"
			? ".badge-overdue{background-color:#450a0a !important;border-color:#b91c1c !important;color:#fecaca !important;}"
			: badgeClass === "badge-reminder"
				? ".badge-reminder{background-color:#451a03 !important;border-color:#b45309 !important;color:#fef3c7 !important;}"
				: ".badge-issued{background-color:#064e3b !important;border-color:#047857 !important;color:#d1fae5 !important;}";
	const darkRules: string[] = [
		".bg-body{background-color:#0a0a0a !important;}",
		".bg-card{background-color:#171717 !important;border-color:#262626 !important;}",
		".bg-surface{background-color:#202020 !important;border-color:#333333 !important;}",
		".border-row{border-bottom-color:#333333 !important;}",
		".border-sep{border-top-color:#262626 !important;}",
		".text-main{color:#fafafa !important;}",
		".text-body{color:#d4d4d4 !important;}",
		".text-muted{color:#a3a3a3 !important;}",
		badgeDarkCss,
	];
	if (note) {
		darkRules.push(
			".bg-callout{background-color:#202020 !important;border-color:#333333 !important;border-left-color:#e5e5e5 !important;}",
		);
	}
	if (isOverdue) {
		darkRules.push(".text-danger{color:#fca5a5 !important;}");
	}
	if (hasBankTransfer && cleanBank) {
		if (cleanBank.qrUrl) {
			darkRules.push(
				".qr-plate{background-color:#ffffff !important;border-color:#404040 !important;}",
			);
		}
		darkRules.push(
			".memo-pill{background-color:#262626 !important;border-color:#525252 !important;color:#fafafa !important;}",
		);
	}
	if (primaryUrl) {
		darkRules.push(
			".cta-cell{background-color:#fafafa !important;}",
			".cta-btn{background-color:#fafafa !important;color:#171717 !important;}",
			".link-accent{color:#fafafa !important;}",
		);
	}
	const mediaDarkCss = darkRules.join("");
	const ogscDarkCss = darkRules.map((rule) => `[data-ogsc] ${rule}`).join("");

	const preheaderFiller = "&#847; &zwnj;&nbsp;&#8199;&shy; ".repeat(8);
	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeEmailHtml(subject)}</title>
<style>
@media (prefers-color-scheme: dark){${mediaDarkCss}}
${ogscDarkCss}
</style>
</head>
<body class="bg-body" style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f5f5f5;font-family:${EMAIL_FONT_STACK};">
<div style="display:none;max-height:0px;overflow:hidden;font-size:1px;line-height:1px;color:#f5f5f5;opacity:0;">${escapeEmailHtml(inboxBody)}${preheaderFiller}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-body" style="background-color:#f5f5f5;width:100%;margin:0;padding:24px 0;">
<tr><td align="center" style="padding:0 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-card" style="max-width:580px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;font-family:${EMAIL_FONT_STACK};text-align:left;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:24px 28px 16px 28px;">
<div class="text-main" style="font-size:15px;line-height:22px;font-weight:700;letter-spacing:-0.01em;color:#171717;">${escapeEmailHtml(brandName)}</div>
${headerOrgHtml}
</td></tr>
<tr><td style="padding:0 28px 24px 28px;">
<div style="margin:0 0 12px 0;"><span class="${badgeClass}" style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;line-height:18px;font-weight:600;${badgeInlineStyle}"><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background-color:${badgeDotColor};margin-right:6px;vertical-align:middle;"></span>${escapeEmailHtml(badgeLabel)}</span></div>
<h1 class="text-main" style="margin:0 0 12px 0;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#171717;">${escapeEmailHtml(heading)}</h1>
<p class="text-main" style="margin:0 0 8px 0;font-size:15px;line-height:24px;font-weight:500;color:#171717;">${escapeEmailHtml(greeting)}</p>
<p class="text-body" style="margin:0 0 18px 0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-surface" style="margin:0 0 18px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;border-collapse:separate;overflow:hidden;">
<tr><td style="padding:18px 16px;text-align:center;">
<div class="text-muted" style="margin:0 0 4px 0;font-size:12px;line-height:18px;font-weight:600;color:#525252;">${escapeEmailHtml(heroLabel)}</div>
<div class="text-main" style="margin:0;font-size:28px;line-height:36px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:#171717;">${escapeEmailHtml(amountDueDisplay)}</div>
${heroDueHtml}${heroPartialHtml}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-surface" style="margin:0 0 20px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;border-collapse:separate;overflow:hidden;">
${renderKeyValueRows(detailRows)}
</table>
${noteHtml}${paymentHtml}${ctaHtml}
</td></tr>
<tr><td class="border-sep" style="padding:18px 28px 24px 28px;border-top:1px solid #e5e5e5;">
<p class="text-body" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#404040;">Nếu bạn đã thanh toán, vui lòng bỏ qua email này.</p>
<p class="text-muted" style="margin:0;font-size:12px;line-height:18px;color:#737373;">Email này được gửi từ ${escapeEmailHtml(footerBrand)}. Nếu cần hỗ trợ về học phí, vui lòng liên hệ trực tiếp với giáo viên phụ trách.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	const textLines: string[] = [
		`${brandName}${showOrgName ? ` (${orgName})` : ""}`,
		`${badgeLabel}: ${heading}`,
		"",
		greeting,
		"",
		intro,
		"",
		...detailRows.map((r) => `- ${r.label}: ${r.value}`),
	];

	if (note) {
		textLines.push("", "Ghi chú hóa đơn:", note);
	}
	if (hasBankTransfer && cleanBank) {
		textLines.push(
			"",
			"Thông tin chuyển khoản:",
			`- Ngân hàng: ${cleanBank.bankBrandName}`,
			`- Số tài khoản: ${cleanBank.accountNumber}`,
			`- Chủ tài khoản: ${cleanBank.holderName}`,
			`- Số tiền: ${amountDueDisplay}`,
			`- Nội dung chuyển khoản: ${cleanBank.memo}`,
			"Vui lòng giữ nguyên nội dung chuyển khoản để hệ thống tự động xác nhận thanh toán.",
		);
	}
	if (safePayUrl) {
		textLines.push("", "Mở trang thanh toán tại:", safePayUrl);
	}
	if (safePortalUrl) {
		textLines.push("", "Xem hóa đơn trên cổng học viên:", safePortalUrl);
	}
	textLines.push(
		"",
		"Nếu bạn đã thanh toán, vui lòng bỏ qua email này.",
		`Email này được gửi từ ${footerBrand}.`,
	);

	return {
		subject,
		html,
		text: textLines.join("\n"),
		inboxTitle,
		inboxBody,
	};
}
