import { formatSchedule, parseSchedule } from "./format-schedule";
import { formatViDateDisplay, formatViWeekdayDate } from "./vietnam-date";

const DEFAULT_BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh";
const INBOX_NOTE_MAX_LENGTH = 140;
const EMAIL_FONT_STACK =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export interface ClassOpeningEmailInput {
	className: string;
	startDate: string;
	scheduleRaw: string;
	mode: string;
	sessionsTotal?: number;
	level?: string;
	studentName?: string;
	orgName?: string;
	brandName?: string;
	teacherNote?: string;
	isUpdate?: boolean;
	portalUrl?: string;
}

export interface RenderedClassOpeningEmail {
	subject: string;
	html: string;
	text: string;
	inboxTitle: string;
	inboxBody: string;
}

export function escapeEmailHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function hasControlChars(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

function sanitizeSingleLine(value: string): string {
	let out = "";
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code === 0) continue;
		if (code === 0x0a || code === 0x0d) {
			out += " ";
			continue;
		}
		if (code <= 0x1f || code === 0x7f) continue;
		out += value[i];
	}
	return out.replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: string): string {
	const normalized = value.replace(/\r\n?/g, "\n");
	let out = "";
	for (let i = 0; i < normalized.length; i += 1) {
		const ch = normalized[i] ?? "";
		const code = normalized.charCodeAt(i);
		if (ch === "\n" || ch === "\t" || (code >= 0x20 && code !== 0x7f)) {
			out += ch;
		}
	}
	return out.trim();
}

export function isSafeEmailUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed || hasControlChars(trimmed) || /\s/.test(trimmed)) return false;

	if (trimmed.startsWith("/")) {
		return !trimmed.startsWith("//") && !trimmed.startsWith("/\\");
	}

	if (!/^https?:\/\//i.test(trimmed)) return false;

	try {
		const parsed = new URL(trimmed);
		return (
			(parsed.protocol === "https:" || parsed.protocol === "http:") &&
			parsed.hostname.length > 0
		);
	} catch {
		return false;
	}
}

function buildInboxBody(params: {
	isUpdate: boolean;
	className: string;
	openingDateDisplay: string;
	scheduleSummary: string;
	noteSnippet: string;
}): string {
	const {
		isUpdate,
		className,
		openingDateDisplay,
		scheduleSummary,
		noteSnippet,
	} = params;

	let lead: string;
	if (isUpdate) {
		lead = openingDateDisplay
			? `Cập nhật lịch khai giảng lớp ${className}: ${openingDateDisplay}`
			: `Cập nhật lịch khai giảng lớp ${className}`;
	} else {
		lead = openingDateDisplay
			? `Lớp ${className} khai giảng ${openingDateDisplay}`
			: `Lớp ${className} đã chốt lịch khai giảng`;
	}

	if (scheduleSummary) {
		lead = `${lead} (${scheduleSummary})`;
	}

	let body = `${lead}.`;
	if (noteSnippet) {
		body = `${body} Lời nhắn: ${noteSnippet}`;
	}
	return body;
}

export function renderClassOpeningEmail(
	input: ClassOpeningEmailInput,
): RenderedClassOpeningEmail {
	const isUpdate = Boolean(input.isUpdate);
	const cleanClassName = sanitizeSingleLine(input.className);
	const trimmedStartDate = input.startDate.trim();
	const openingDateDisplay = sanitizeSingleLine(
		formatViWeekdayDate(trimmedStartDate) ||
			formatViDateDisplay(trimmedStartDate) ||
			trimmedStartDate,
	);
	const shortDate = sanitizeSingleLine(formatViDateDisplay(trimmedStartDate));

	const subjectBase = isUpdate
		? `Cập nhật lịch khai giảng lớp ${cleanClassName}`
		: `Thông báo khai giảng lớp ${cleanClassName}`;
	const subject = sanitizeSingleLine(
		shortDate ? `${subjectBase} — ${shortDate}` : subjectBase,
	);

	const inboxTitle = sanitizeSingleLine(
		isUpdate ? "Cập nhật lịch khai giảng" : "Thông báo khai giảng",
	);

	const trimmedSchedule = input.scheduleRaw.trim();
	const parsedSchedule = trimmedSchedule
		? parseSchedule(trimmedSchedule)
		: null;
	const scheduleSummary = parsedSchedule
		? formatSchedule(trimmedSchedule)
		: sanitizeSingleLine(trimmedSchedule);

	const detailRows: [string, string][] = [["Lớp học", cleanClassName]];
	if (openingDateDisplay) {
		detailRows.push(["Ngày khai giảng", openingDateDisplay]);
	}
	if (parsedSchedule) {
		detailRows.push([
			"Giờ học",
			`${parsedSchedule.start} – ${parsedSchedule.end}`,
		]);
		detailRows.push(["Lịch học định kỳ", scheduleSummary]);
	} else if (scheduleSummary) {
		detailRows.push(["Lịch học", scheduleSummary]);
	}

	const trimmedMode = sanitizeSingleLine(input.mode);
	if (trimmedMode) {
		detailRows.push(["Hình thức", trimmedMode]);
	}

	const trimmedLevel = sanitizeSingleLine(input.level ?? "");
	if (trimmedLevel) {
		detailRows.push(["Trình độ", trimmedLevel]);
	}

	if (
		typeof input.sessionsTotal === "number" &&
		Number.isFinite(input.sessionsTotal) &&
		input.sessionsTotal > 0
	) {
		detailRows.push(["Thời lượng", `${input.sessionsTotal} buổi`]);
	}

	const brandName =
		sanitizeSingleLine(input.brandName ?? "") || DEFAULT_BRAND_NAME;
	const orgName = sanitizeSingleLine(input.orgName ?? "");
	const showOrgName =
		orgName.length > 0 && orgName.toLowerCase() !== brandName.toLowerCase();

	const studentName = sanitizeSingleLine(input.studentName ?? "");
	const greeting = studentName ? `Chào ${studentName},` : "Chào bạn,";

	const badgeLabel = inboxTitle;
	const badgeClass = isUpdate ? "badge-update" : "badge-initial";
	const badgeInlineStyle = isUpdate
		? "background-color:#fffbeb;border:1px solid #fde68a;color:#92400e;"
		: "background-color:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;";
	const badgeDotColor = isUpdate ? "#d97706" : "#059669";

	const heading = isUpdate
		? `Cập nhật lịch khai giảng lớp ${cleanClassName}`
		: `Lịch khai giảng lớp ${cleanClassName}`;

	let intro: string;
	if (isUpdate) {
		intro = openingDateDisplay
			? `Lịch khai giảng lớp ${cleanClassName} vừa được giáo viên cập nhật (${openingDateDisplay}). Vui lòng xem lại thông tin mới nhất bên dưới để sắp xếp thời gian học phù hợp.`
			: `Thông tin khai giảng lớp ${cleanClassName} vừa được giáo viên cập nhật. Vui lòng xem lại chi tiết mới nhất bên dưới.`;
	} else {
		intro = openingDateDisplay
			? `Lớp ${cleanClassName} chính thức khai giảng vào ${openingDateDisplay}. Dưới đây là thông tin chi tiết về lịch học để bạn chuẩn bị sẵn sàng cho buổi học đầu tiên.`
			: `Thông tin khai giảng lớp ${cleanClassName} đã được xác nhận. Dưới đây là chi tiết lịch học để bạn chuẩn bị sẵn sàng cho buổi học đầu tiên.`;
	}

	const teacherNote = normalizeMultilineText(input.teacherNote ?? "");
	const compactNote = sanitizeSingleLine(teacherNote);
	const noteSnippet =
		compactNote.length > INBOX_NOTE_MAX_LENGTH
			? `${compactNote.slice(0, INBOX_NOTE_MAX_LENGTH).trimEnd()}…`
			: compactNote;

	const inboxBody = buildInboxBody({
		isUpdate,
		className: cleanClassName,
		openingDateDisplay,
		scheduleSummary,
		noteSnippet,
	});

	const rawPortalUrl = input.portalUrl?.trim() ?? "";
	const safePortalUrl = isSafeEmailUrl(rawPortalUrl) ? rawPortalUrl : "";
	const escapedPortalUrl = safePortalUrl ? escapeEmailHtml(safePortalUrl) : "";

	const footerBrand = showOrgName ? `${orgName} · ${brandName}` : brandName;
	const preheaderFiller = "&#847; &zwnj;&nbsp;&#8199;&shy; ".repeat(14);

	const detailTableRowsHtml = detailRows
		.map(([label, value], index) => {
			const isLast = index === detailRows.length - 1;
			const borderCss = isLast ? "" : "border-bottom:1px solid #e5e5e5;";
			const borderClass = isLast ? "" : " border-row";
			return (
				"<tr>" +
				`<td class="text-muted${borderClass}" style="padding:11px 16px;${borderCss}font-size:13px;line-height:20px;color:#525252;vertical-align:top;width:38%;">${escapeEmailHtml(label)}</td>` +
				`<td class="text-main${borderClass}" style="padding:11px 16px;${borderCss}font-size:14px;line-height:20px;font-weight:600;color:#171717;text-align:right;vertical-align:top;">${escapeEmailHtml(value)}</td>` +
				"</tr>"
			);
		})
		.join("");

	const headerOrgHtml = showOrgName
		? `<div class="text-muted" style="margin:3px 0 0 0;font-size:12px;line-height:18px;color:#737373;">${escapeEmailHtml(orgName)}</div>`
		: "";

	const teacherNoteHtml = teacherNote
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-callout" style="margin:0 0 24px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-left:3px solid #171717;border-radius:8px;border-collapse:separate;">` +
			`<tr><td style="padding:14px 16px;">` +
			`<div class="text-main" style="margin:0 0 6px 0;font-size:13px;line-height:18px;font-weight:600;color:#171717;">Lời nhắn từ giáo viên</div>` +
			`<div class="text-body" style="margin:0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(teacherNote).replace(/\n/g, "<br>")}</div>` +
			"</td></tr></table>"
		: "";

	const ctaHtml = escapedPortalUrl
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">` +
			"<tr>" +
			`<td class="cta-cell" bgcolor="#171717" style="border-radius:8px;background-color:#171717;">` +
			`<a href="${escapedPortalUrl}" target="_blank" rel="noopener noreferrer" class="cta-btn" style="display:inline-block;padding:12px 24px;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#171717;">Mở cổng học viên</a>` +
			"</td>" +
			"</tr>" +
			"</table>" +
			`<p class="text-muted" style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#737373;">Nếu nút không hoạt động, hãy sao chép và mở đường dẫn sau:</p>` +
			`<p style="margin:0 0 8px 0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${escapedPortalUrl}" target="_blank" rel="noopener noreferrer" class="link-accent" style="color:#171717;text-decoration:underline;">${escapedPortalUrl}</a></p>`
		: "";

	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeEmailHtml(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg-body { background-color: #0a0a0a !important; }
  .bg-card { background-color: #171717 !important; border-color: #262626 !important; }
  .bg-surface { background-color: #202020 !important; border-color: #333333 !important; }
  .bg-callout { background-color: #202020 !important; border-color: #333333 !important; border-left-color: #e5e5e5 !important; }
  .border-row { border-bottom-color: #333333 !important; }
  .border-sep { border-top-color: #262626 !important; }
  .text-main { color: #fafafa !important; }
  .text-body { color: #d4d4d4 !important; }
  .text-muted { color: #a3a3a3 !important; }
  .badge-initial { background-color: #064e3b !important; border-color: #047857 !important; color: #d1fae5 !important; }
  .badge-update { background-color: #451a03 !important; border-color: #b45309 !important; color: #fef3c7 !important; }
  .cta-cell { background-color: #fafafa !important; }
  .cta-btn { background-color: #fafafa !important; color: #171717 !important; }
  .link-accent { color: #fafafa !important; }
}
[data-ogsc] .bg-body { background-color: #0a0a0a !important; }
[data-ogsc] .bg-card { background-color: #171717 !important; border-color: #262626 !important; }
[data-ogsc] .bg-surface { background-color: #202020 !important; border-color: #333333 !important; }
[data-ogsc] .bg-callout { background-color: #202020 !important; border-color: #333333 !important; border-left-color: #e5e5e5 !important; }
[data-ogsc] .border-row { border-bottom-color: #333333 !important; }
[data-ogsc] .border-sep { border-top-color: #262626 !important; }
[data-ogsc] .text-main { color: #fafafa !important; }
[data-ogsc] .text-body { color: #d4d4d4 !important; }
[data-ogsc] .text-muted { color: #a3a3a3 !important; }
[data-ogsc] .badge-initial { background-color: #064e3b !important; border-color: #047857 !important; color: #d1fae5 !important; }
[data-ogsc] .badge-update { background-color: #451a03 !important; border-color: #b45309 !important; color: #fef3c7 !important; }
[data-ogsc] .cta-cell { background-color: #fafafa !important; }
[data-ogsc] .cta-btn { background-color: #fafafa !important; color: #171717 !important; }
[data-ogsc] .link-accent { color: #fafafa !important; }
</style>
</head>
<body class="bg-body" style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f5f5f5;font-family:${EMAIL_FONT_STACK};">
<div style="display:none;max-height:0px;overflow:hidden;font-size:1px;line-height:1px;color:#f5f5f5;opacity:0;">${escapeEmailHtml(inboxBody)}${preheaderFiller}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-body" style="background-color:#f5f5f5;width:100%;margin:0;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-card" style="max-width:580px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;font-family:${EMAIL_FONT_STACK};text-align:left;border-collapse:separate;overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 20px 28px;">
            <div class="text-main" style="font-size:15px;line-height:22px;font-weight:700;letter-spacing:-0.01em;color:#171717;">${escapeEmailHtml(brandName)}</div>
            ${headerOrgHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px 28px;">
            <div style="margin:0 0 14px 0;">
              <span class="${badgeClass}" style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;line-height:18px;font-weight:600;${badgeInlineStyle}"><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background-color:${badgeDotColor};margin-right:6px;vertical-align:middle;"></span>${escapeEmailHtml(badgeLabel)}</span>
            </div>
            <h1 class="text-main" style="margin:0 0 14px 0;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#171717;">${escapeEmailHtml(heading)}</h1>
            <p class="text-main" style="margin:0 0 10px 0;font-size:15px;line-height:24px;font-weight:500;color:#171717;">${escapeEmailHtml(greeting)}</p>
            <p class="text-body" style="margin:0 0 22px 0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(intro)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-surface" style="margin:0 0 22px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;border-collapse:separate;overflow:hidden;">
              ${detailTableRowsHtml}
            </table>
            ${teacherNoteHtml}
            ${ctaHtml}
          </td>
        </tr>
        <tr>
          <td class="border-sep" style="padding:20px 28px 26px 28px;border-top:1px solid #e5e5e5;">
            <p class="text-body" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#404040;">Chúc bạn có một khóa học thật hiệu quả!</p>
            <p class="text-muted" style="margin:0;font-size:12px;line-height:18px;color:#737373;">Email này được gửi từ ${escapeEmailHtml(footerBrand)}. Nếu cần hỗ trợ về lịch học, vui lòng liên hệ trực tiếp với giáo viên phụ trách.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

	const textSections: string[] = [
		`${brandName}${showOrgName ? ` (${orgName})` : ""}`,
		`${badgeLabel}: ${heading}`,
		"",
		greeting,
		"",
		intro,
		"",
		...detailRows.map(([label, value]) => `- ${label}: ${value}`),
	];

	if (teacherNote) {
		textSections.push("", "Lời nhắn từ giáo viên:", teacherNote);
	}

	if (safePortalUrl) {
		textSections.push("", "Mở cổng học viên tại:", safePortalUrl);
	}

	textSections.push(
		"",
		"Chúc bạn có một khóa học thật hiệu quả!",
		`Email này được gửi từ ${footerBrand}.`,
	);

	const text = textSections.join("\n");

	return {
		subject,
		html,
		text,
		inboxTitle,
		inboxBody,
	};
}
