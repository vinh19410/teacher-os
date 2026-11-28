import {
	escapeEmailHtml,
	isSafeEmailUrl,
	renderBrandedEmailShell,
	renderEmailDetailTable,
	renderEmailPrimaryCta,
	resolveEmailBrandAndGreeting,
	sanitizeSingleLine,
} from "./email-html";
import { formatSchedule, parseSchedule } from "./format-schedule";
import {
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "./skeleton";
import { formatViDateDisplay, formatViWeekdayDate } from "./vietnam-date";

export { escapeEmailHtml, isSafeEmailUrl };

export const ONLINE_SESSION_LINK_NOTICE =
	"Link buổi học sẽ được gửi đến bạn trước buổi học 2 tiếng.";

const INBOX_NOTE_MAX_LENGTH = 140;
const MAX_EXPECTED_END_DATE_SESSIONS = 52;

export interface ClassOpeningEmailInput {
	className: string;
	startDate: string;
	scheduleRaw: string;
	mode: string;
	sessionsTotal?: number;
	/**
	 * Ngày kết thúc khóa học dự kiến (ISO `yyyy-mm-dd`).
	 * - `undefined`: tự suy từ `startDate + scheduleRaw + sessionsTotal` qua `computeExpectedEndDateFromSchedule`.
	 * - `null` hoặc chuỗi rỗng: ẩn dòng này khỏi email.
	 */
	expectedEndDate?: string | null;
	studentName?: string;
	orgName?: string;
	brandName?: string;
	teacherNote?: string;
	isUpdate?: boolean;
	portalUrl?: string;
}

export interface ClassSessionDateInput {
	date: string | null | undefined;
	status?: string;
}

/**
 * Tính ngày kết thúc khóa học dự kiến (ISO `yyyy-mm-dd`) từ ngày khai giảng,
 * lịch học định kỳ dạng JSON và tổng số buổi (`1..52` nguyên). Trả `null` khi
 * lịch không có cấu trúc hoặc thiếu thông tin hợp lệ.
 */
export function computeExpectedEndDateFromSchedule(input: {
	startDate: string;
	scheduleRaw: string;
	sessionsTotal?: number;
}): string | null {
	if (
		typeof input.sessionsTotal !== "number" ||
		!Number.isInteger(input.sessionsTotal) ||
		input.sessionsTotal <= 0 ||
		input.sessionsTotal > MAX_EXPECTED_END_DATE_SESSIONS
	) {
		return null;
	}
	const parsed = parseStoredSchedule(input.scheduleRaw.trim());
	const startISO = parseStartDateStrict(input.startDate.trim());
	if (!parsed || !startISO) return null;
	const skeleton = skeletonOf(parsed, startISO, input.sessionsTotal);
	if (!skeleton) return null;
	let max: string | null = null;
	for (const dates of skeleton.values()) {
		for (const dateISO of dates) {
			if (max === null || dateISO > max) max = dateISO;
		}
	}
	return max;
}

function toReadonlyStringSet(
	input?: ReadonlySet<string> | ReadonlyArray<string>,
): ReadonlySet<string> {
	if (!input) return new Set();
	return input instanceof Set ? input : new Set(input);
}

/**
 * Xác định ngày kết thúc khóa học dự kiến theo trạng thái lớp thật:
 * - Lớp `manual`: hợp nhất ngày hợp lệ từ `classSessions` và `lessons` (bao gồm
 *   buổi bù nghỉ lễ), loại các ngày đã hủy (`cancelled`/`holiday` hoặc trong
 *   `holidayShiftOriginalDates`/`holidayCancelDates`).
 * - Lớp `auto` đã có ít nhất 1 `lesson` mang ngày hợp lệ: lấy ngày lớn nhất
 *   trong các buổi chưa bị `holiday`/`cancelled` (trả `null` nếu tất cả đều hủy/nghỉ).
 * - Lớp `auto` chưa có `lesson` mang ngày (0 buổi hoặc legacy `date: null`): ước tính
 *   qua `computeExpectedEndDateFromSchedule`.
 */
export function resolveClassExpectedEndDate(input: {
	startDate: string;
	scheduleRaw: string;
	sessionsTotal?: number;
	isManual?: boolean;
	lessons?: ReadonlyArray<ClassSessionDateInput>;
	classSessions?: ReadonlyArray<{ date: string | null | undefined }>;
	holidayShiftOriginalDates?: ReadonlySet<string> | ReadonlyArray<string>;
	holidayCancelDates?: ReadonlySet<string> | ReadonlyArray<string>;
}): string | null {
	const shiftedOrigSet = toReadonlyStringSet(input.holidayShiftOriginalDates);
	const cancelDateSet = toReadonlyStringSet(input.holidayCancelDates);
	const isManual = input.isManual ?? (input.classSessions?.length ?? 0) > 0;
	const lessons = input.lessons ?? [];

	if (isManual) {
		const lessonsByDate = new Map<string, string[]>();
		const candidateDates = new Set<string>();
		for (const cs of input.classSessions ?? []) {
			const dateISO = parseStartDateStrict((cs.date ?? "").trim());
			if (dateISO) candidateDates.add(dateISO);
		}
		for (const row of lessons) {
			const dateISO = parseStartDateStrict((row.date ?? "").trim());
			if (!dateISO) continue;
			candidateDates.add(dateISO);
			const list = lessonsByDate.get(dateISO) ?? [];
			list.push(row.status ?? "upcoming");
			lessonsByDate.set(dateISO, list);
		}
		let maxDate: string | null = null;
		for (const dateISO of candidateDates) {
			const statuses = lessonsByDate.get(dateISO);
			if (statuses && statuses.length > 0) {
				if (
					statuses.every(
						(status) => status === "holiday" || status === "cancelled",
					)
				) {
					continue;
				}
			} else if (shiftedOrigSet.has(dateISO) || cancelDateSet.has(dateISO)) {
				continue;
			}
			if (maxDate === null || dateISO > maxDate) {
				maxDate = dateISO;
			}
		}
		return maxDate;
	}

	let hasAnyDatedLesson = false;
	let maxAutoDate: string | null = null;
	for (const row of lessons) {
		const dateISO = parseStartDateStrict((row.date ?? "").trim());
		if (!dateISO) continue;
		hasAnyDatedLesson = true;
		if (row.status === "holiday" || row.status === "cancelled") continue;
		if (maxAutoDate === null || dateISO > maxAutoDate) {
			maxAutoDate = dateISO;
		}
	}
	if (hasAnyDatedLesson) {
		return maxAutoDate;
	}

	return computeExpectedEndDateFromSchedule({
		startDate: input.startDate,
		scheduleRaw: input.scheduleRaw,
		sessionsTotal: input.sessionsTotal,
	});
}

export interface RenderedClassOpeningEmail {
	subject: string;
	html: string;
	text: string;
	inboxTitle: string;
	inboxBody: string;
}

export function normalizeMultilineText(value: string): string {
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
	const isOnlineMode = trimmedMode.toLowerCase() === "online";

	const resolvedEndDateRaw =
		input.expectedEndDate === undefined
			? (computeExpectedEndDateFromSchedule({
					startDate: trimmedStartDate,
					scheduleRaw: trimmedSchedule,
					sessionsTotal: input.sessionsTotal,
				}) ?? "")
			: (input.expectedEndDate ?? "").trim();
	const strictEndDateISO = parseStartDateStrict(resolvedEndDateRaw);
	const expectedEndDateDisplay = sanitizeSingleLine(
		strictEndDateISO
			? formatViWeekdayDate(strictEndDateISO) ||
					formatViDateDisplay(strictEndDateISO)
			: formatViDateDisplay(resolvedEndDateRaw) || resolvedEndDateRaw,
	);
	if (expectedEndDateDisplay) {
		detailRows.push(["Ngày kết thúc khóa học dự kiến", expectedEndDateDisplay]);
	}

	const { brandName, orgName, showOrgName, greeting, footerBrand } =
		resolveEmailBrandAndGreeting({
			brandName: input.brandName,
			orgName: input.orgName,
			studentName: input.studentName,
		});

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

	const detailTableHtml = renderEmailDetailTable(detailRows);

	const sessionLinkNoticeHtml = isOnlineMode
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-session-notice" style="margin:0 0 22px 0;background-color:#ecfdf5;border:1px solid #a7f3d0;border-left:3px solid #059669;border-radius:8px;border-collapse:separate;">` +
			`<tr><td style="padding:14px 16px;">` +
			`<div class="text-session-notice-title" style="margin:0 0 4px 0;font-size:13px;line-height:18px;font-weight:600;color:#065f46;">Link buổi học</div>` +
			`<div class="text-session-notice-body" style="margin:0;font-size:14px;line-height:22px;color:#171717;">${escapeEmailHtml(ONLINE_SESSION_LINK_NOTICE)}</div>` +
			"</td></tr></table>"
		: "";

	const teacherNoteHtml = teacherNote
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-callout" style="margin:0 0 24px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-left:3px solid #171717;border-radius:8px;border-collapse:separate;">` +
			`<tr><td style="padding:14px 16px;">` +
			`<div class="text-main" style="margin:0 0 6px 0;font-size:13px;line-height:18px;font-weight:600;color:#171717;">Lời nhắn từ giáo viên</div>` +
			`<div class="text-body" style="margin:0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(teacherNote).replace(/\n/g, "<br>")}</div>` +
			"</td></tr></table>"
		: "";

	const ctaHtml = safePortalUrl
		? renderEmailPrimaryCta(safePortalUrl, "Mở cổng học viên")
		: "";

	const html = renderBrandedEmailShell({
		subject,
		preheader: inboxBody,
		brandName,
		orgName,
		showOrgName,
		badgeLabel: inboxTitle,
		badgeVariant: isUpdate ? "update" : "initial",
		heading,
		greeting,
		intro,
		bodySectionsHtml: [
			detailTableHtml,
			sessionLinkNoticeHtml,
			teacherNoteHtml,
			ctaHtml,
		].join(""),
		footerLead: "Chúc bạn có một khóa học thật hiệu quả!",
		footerSupport: `Email này được gửi từ ${footerBrand}. Nếu cần hỗ trợ về lịch học, vui lòng liên hệ trực tiếp với giáo viên phụ trách.`,
	});

	const textSections: string[] = [
		`${brandName}${showOrgName ? ` (${orgName})` : ""}`,
		`${inboxTitle}: ${heading}`,
		"",
		greeting,
		"",
		intro,
		"",
		...detailRows.map(([label, value]) => `- ${label}: ${value}`),
	];

	if (isOnlineMode) {
		textSections.push(
			"",
			`Lưu ý về link buổi học: ${ONLINE_SESSION_LINK_NOTICE}`,
		);
	}

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

	return {
		subject,
		html,
		text: textSections.join("\n"),
		inboxTitle,
		inboxBody,
	};
}
