import {
	escapeEmailHtml,
	isSafeEmailUrl,
	renderBrandedEmailShell,
	renderEmailDetailTable,
	renderEmailPrimaryCta,
	resolveEmailBrandAndGreeting,
	sanitizeSingleLine,
} from "./email-html";
import { parseStartDateStrict } from "./skeleton";
import {
	formatViDateDisplay,
	formatVietnamTimeHHMM,
	formatViWeekdayDate,
	vietnamDateKeyOf,
	vietnamDateTimeMs,
	vietnamSessionEndMs,
} from "./vietnam-date";
import { isValidZoomJoinUrl } from "./zoom-window";

/** Số phút gửi email link buổi học trước giờ bắt đầu buổi học. */
export const SESSION_LINK_REMINDER_LEAD_MINUTES = 120;

/** Số mili-giây gửi email link buổi học trước giờ bắt đầu buổi học. */
export const SESSION_LINK_REMINDER_LEAD_MS =
	SESSION_LINK_REMINDER_LEAD_MINUTES * 60_000;

const STRICT_TIME_HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type SessionLinkReminderWindowStatus =
	| "too_early"
	| "due"
	| "started"
	| "invalid";

export type SessionLinkReminderWindowResult =
	| {
			status: "invalid";
			startMs: null;
			windowStartMs: null;
	  }
	| {
			status: "too_early" | "due" | "started";
			startMs: number;
			windowStartMs: number;
	  };

/**
 * Đánh giá xem buổi học tại `(date, time)` theo múi giờ Việt Nam (UTC+7) có đang
 * nằm trong cửa sổ gửi link trước 2 tiếng `[startMs - 2h, startMs)` hay không.
 */
export function evaluateSessionLinkReminderWindow(input: {
	date: string | null | undefined;
	time: string;
	nowMs?: number;
}): SessionLinkReminderWindowResult {
	const nowMs = input.nowMs ?? Date.now();
	const strictDate =
		typeof input.date === "string" ? parseStartDateStrict(input.date) : null;
	if (
		typeof input.date !== "string" ||
		strictDate === null ||
		strictDate !== input.date ||
		typeof input.time !== "string" ||
		!STRICT_TIME_HHMM_REGEX.test(input.time) ||
		!Number.isFinite(nowMs)
	) {
		return { status: "invalid", startMs: null, windowStartMs: null };
	}

	const startMs = vietnamDateTimeMs(strictDate, input.time);
	if (!Number.isFinite(startMs)) {
		return { status: "invalid", startMs: null, windowStartMs: null };
	}
	const windowStartMs = startMs - SESSION_LINK_REMINDER_LEAD_MS;

	if (nowMs < windowStartMs) {
		return { status: "too_early", startMs, windowStartMs };
	}
	if (nowMs >= startMs) {
		return { status: "started", startMs, windowStartMs };
	}
	return { status: "due", startMs, windowStartMs };
}

export interface SessionLinkEmailInput {
	className: string;
	dateISO: string;
	time: string;
	dur?: number;
	topic?: string;
	joinUrl: string;
	sessionPortalUrl?: string;
	studentName?: string;
	orgName?: string;
	brandName?: string;
}

export interface RenderedSessionLinkEmail {
	subject: string;
	html: string;
	text: string;
	summaryBody: string;
}

function formatSessionTimeRange(
	dateISO: string,
	time: string,
	dur: number | undefined,
): string {
	const cleanTime = sanitizeSingleLine(time);
	if (!cleanTime) return "";
	const strictDate = parseStartDateStrict(dateISO.trim());
	if (
		!strictDate ||
		!STRICT_TIME_HHMM_REGEX.test(cleanTime) ||
		typeof dur !== "number" ||
		!Number.isFinite(dur) ||
		dur <= 0
	) {
		return cleanTime;
	}
	const startMs = vietnamDateTimeMs(strictDate, cleanTime);
	const endMs = vietnamSessionEndMs(strictDate, cleanTime, dur);
	if (!Number.isFinite(startMs) || endMs === null || endMs <= startMs) {
		return cleanTime;
	}
	const endDate = new Date(endMs);
	const endHHMM = formatVietnamTimeHHMM(endDate);
	if (!endHHMM) return cleanTime;
	const endDateISO = vietnamDateKeyOf(endDate);
	if (endDateISO === strictDate) {
		return `${cleanTime} – ${endHHMM}`;
	}
	return `${cleanTime} – ${endHHMM} (${formatViDateDisplay(endDateISO)})`;
}

/**
 * Render email nhắc link buổi học Online gửi trước giờ học 2 tiếng (HTML Light/Dark,
 * plain-text, nút CTA chính trỏ thẳng link Zoom và link phụ tới cổng học viên).
 */
export function renderSessionLinkEmail(
	input: SessionLinkEmailInput,
): RenderedSessionLinkEmail {
	const cleanClassName = sanitizeSingleLine(input.className);
	const trimmedDate = input.dateISO.trim();
	const strictDate = parseStartDateStrict(trimmedDate);
	const dateDisplay = sanitizeSingleLine(
		strictDate
			? formatViWeekdayDate(strictDate) || formatViDateDisplay(strictDate)
			: formatViDateDisplay(trimmedDate) || trimmedDate,
	);
	const shortDate = sanitizeSingleLine(
		formatViDateDisplay(strictDate ?? trimmedDate),
	);
	const cleanStartTime = sanitizeSingleLine(input.time);
	const timeDisplay = formatSessionTimeRange(
		trimmedDate,
		input.time,
		input.dur,
	);
	const cleanTopic = sanitizeSingleLine(input.topic ?? "");

	const subjectSuffix = [cleanStartTime, shortDate].filter(Boolean).join(", ");
	const subject = sanitizeSingleLine(
		subjectSuffix
			? `Link buổi học lớp ${cleanClassName} — ${subjectSuffix}`
			: `Link buổi học lớp ${cleanClassName}`,
	);

	const summaryTimePart = timeDisplay ? ` lúc ${timeDisplay}` : "";
	const summaryDatePart = dateDisplay ? ` (${dateDisplay})` : "";
	const summaryBody = sanitizeSingleLine(
		`Buổi học lớp ${cleanClassName}${summaryTimePart}${summaryDatePart}. Link tham gia buổi học đã được gửi qua email.`,
	);

	const detailRows: [string, string][] = [["Lớp học", cleanClassName]];
	if (dateDisplay) {
		detailRows.push(["Ngày học", dateDisplay]);
	}
	if (timeDisplay) {
		detailRows.push(["Giờ học", timeDisplay]);
	}
	if (cleanTopic) {
		detailRows.push(["Nội dung buổi học", cleanTopic]);
	}

	const { brandName, orgName, showOrgName, greeting, footerBrand } =
		resolveEmailBrandAndGreeting({
			brandName: input.brandName,
			orgName: input.orgName,
			studentName: input.studentName,
		});

	const trimmedJoinUrl = input.joinUrl.trim();
	const safeJoinUrl = isValidZoomJoinUrl(trimmedJoinUrl) ? trimmedJoinUrl : "";

	const rawPortalUrl = input.sessionPortalUrl?.trim() ?? "";
	const safePortalUrl = isSafeEmailUrl(rawPortalUrl) ? rawPortalUrl : "";
	const escapedPortalUrl = safePortalUrl ? escapeEmailHtml(safePortalUrl) : "";

	const detailTableHtml = renderEmailDetailTable(detailRows);
	const primaryCtaHtml = safeJoinUrl
		? renderEmailPrimaryCta(safeJoinUrl, "Tham gia buổi học")
		: "";

	const portalSecondaryHtml = escapedPortalUrl
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-callout" style="margin:18px 0 0 0;background-color:#fafafa;border:1px solid #e5e5e5;border-left:3px solid #171717;border-radius:8px;border-collapse:separate;">` +
			`<tr><td style="padding:12px 16px;">` +
			`<div class="text-body" style="margin:0 0 4px 0;font-size:13px;line-height:20px;color:#404040;">Xem tài liệu và chi tiết buổi học trên cổng học viên:</div>` +
			`<div style="margin:0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapedPortalUrl}" target="_blank" rel="noopener noreferrer" class="link-accent" style="font-weight:600;color:#171717;text-decoration:underline;">Mở trang chi tiết buổi học</a></div>` +
			"</td></tr></table>"
		: "";

	const heading = `Link buổi học lớp ${cleanClassName}`;
	const intro = safeJoinUrl
		? `Buổi học lớp ${cleanClassName} sắp bắt đầu. Dưới đây là thông tin chi tiết và đường dẫn tham gia buổi học của bạn.`
		: `Buổi học lớp ${cleanClassName} sắp bắt đầu. Dưới đây là thông tin chi tiết buổi học của bạn.`;

	const html = renderBrandedEmailShell({
		subject,
		preheader: summaryBody,
		brandName,
		orgName,
		showOrgName,
		badgeLabel: "Buổi học sắp diễn ra",
		badgeVariant: "initial",
		heading,
		greeting,
		intro,
		bodySectionsHtml: [
			detailTableHtml,
			primaryCtaHtml,
			portalSecondaryHtml,
		].join(""),
		footerLead: "Chúc bạn có một buổi học thật hiệu quả!",
		footerSupport: `Email tự động từ ${footerBrand}. Nếu cần hỗ trợ về buổi học, vui lòng liên hệ trực tiếp với giáo viên phụ trách.`,
	});

	const textSections: string[] = [
		`${brandName}${showOrgName ? ` (${orgName})` : ""}`,
		`Buổi học sắp diễn ra: ${heading}`,
		"",
		greeting,
		"",
		intro,
		"",
		...detailRows.map(([label, value]) => `- ${label}: ${value}`),
	];

	if (safeJoinUrl) {
		textSections.push("", `Tham gia buổi học: ${safeJoinUrl}`);
	}

	if (safePortalUrl) {
		textSections.push(
			"",
			`Xem chi tiết buổi học trên cổng học viên: ${safePortalUrl}`,
		);
	}

	textSections.push(
		"",
		"Chúc bạn có một buổi học thật hiệu quả!",
		`Email tự động từ ${footerBrand}.`,
	);

	return {
		subject,
		html,
		text: textSections.join("\n"),
		summaryBody,
	};
}
