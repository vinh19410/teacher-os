import { renderClassOpeningEmail } from "@teacher-os/api/class-opening-email";
import {
	NOTIFICATION_EVENT_GROUP_BY_TYPE,
	type NotificationEventGroup,
	type NotificationEventType,
} from "@teacher-os/api/contracts";
import { renderSessionLinkEmail } from "@teacher-os/api/session-link-email";
import {
	type InvoiceEmailPaymentInfo,
	renderInvoiceEmail,
} from "@teacher-os/api/invoice-email";
import {
	formatViDateDisplay,
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
} from "@teacher-os/api/vietnam-date";
import { BRAND_NAME } from "../brand";
import { escapeHtml, isSafeLinkUrl } from "./deliver";

/** 1 sự kiện phát ra từ route nghiệp vụ, chưa resolve người nhận (D4). */
export interface NotificationEvent {
	studentId: string;
	eventType: NotificationEventType;
	/** Khóa chống trùng theo D3, vd "grade_returned:<attemptId>". */
	idempotencyKey: string;
	title: string;
	body: string;
	/** Nội dung HTML đã render sẵn cho email giàu định dạng; bỏ trống/null dùng renderer mặc định. */
	htmlBody?: string | null;
	/** Nội dung plain-text đầy đủ cho email giàu định dạng; bỏ trống/null dùng renderer mặc định từ body + linkPath. */
	textBody?: string | null;
	/** Đường dẫn trên cổng học viên, vd "/assignments/a-1". */
	linkPath: string;
	refType: string;
	refId: string;
	/** Mặc định enqueue theo email học viên ("email,in_app" nếu có email); "in_app" chỉ gửi inbox; "email" chỉ gửi email và bỏ qua khi trống email. */
	channels?: "in_app" | "email" | "email,in_app";
}

export function eventGroupOf(
	eventType: NotificationEventType,
): NotificationEventGroup {
	return NOTIFICATION_EVENT_GROUP_BY_TYPE[eventType];
}

export function formatVnd(amount: number): string {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

export interface InvoiceNotificationInput {
	id: string;
	studentId: string;
	/** Số tiền còn phải thanh toán (VND). */
	amount: number;
	due: string;
	totalAmount?: number;
	paidAmount?: number;
	studentName?: string;
	className?: string;
	note?: string;
	orgName?: string;
	payToken?: string | null;
	payment?: InvoiceEmailPaymentInfo | null;
	studentOrigin?: string;
	appOrigin?: string;
}

/**
 * Xác định origin phục vụ `/pay/$token`:
 * - Unified LMS (`studentOrigin` có hậu tố `/student`) → `parsed.origin` (gốc phục vụ `/pay/$token`).
 * - Hoặc fallback `appOrigin` (`apps/web` có route `/pay/$token`).
 * - Standalone `apps/student` (không có `/student`, không có `/pay/$token`) → `undefined`.
 */
export function resolvePublicPayOrigin(input: {
	studentOrigin?: string;
	appOrigin?: string;
}): string | undefined {
	const rawStudent = (input.studentOrigin ?? "").trim().replace(/\/+$/, "");
	if (rawStudent) {
		try {
			const parsed = new URL(rawStudent);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				const normalizedPath = parsed.pathname.replace(/\/+$/, "");
				if (normalizedPath.endsWith("/student")) {
					return parsed.origin;
				}
			}
		} catch {
			// Bỏ qua studentOrigin không hợp lệ.
		}
	}
	const rawApp = (input.appOrigin ?? "").trim().replace(/\/+$/, "");
	if (rawApp) {
		try {
			const parsed = new URL(rawApp);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				return parsed.origin;
			}
		} catch {
			// Bỏ qua appOrigin không hợp lệ.
		}
	}
	return undefined;
}

export function buildInvoiceEmailUrls(input: {
	invoiceId: string;
	payToken?: string | null;
	studentOrigin?: string;
	appOrigin?: string;
}): { payUrl?: string; portalUrl?: string } {
	const payOrigin = resolvePublicPayOrigin({
		studentOrigin: input.studentOrigin,
		appOrigin: input.appOrigin,
	});
	const cleanToken = input.payToken?.trim() ?? "";
	const payUrl =
		payOrigin && cleanToken
			? `${payOrigin}/pay/${encodeURIComponent(cleanToken)}`
			: undefined;

	const cleanStudentOrigin = (input.studentOrigin ?? "")
		.trim()
		.replace(/\/+$/, "");
	let portalUrl: string | undefined;
	if (cleanStudentOrigin) {
		try {
			const parsed = new URL(cleanStudentOrigin);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				portalUrl = `${cleanStudentOrigin}/tuition/${encodeURIComponent(input.invoiceId)}`;
			}
		} catch {
			// Bỏ qua studentOrigin không hợp lệ.
		}
	}

	return { payUrl, portalUrl };
}

/**
 * Sự kiện "nhắc hạn hóa đơn học phí" cho TOS-18 (#452) — builder thuần,
 * khóa chống trùng gồm ngày VN nên mỗi ngày nhắc 1 lần (D3).
 */
export function tuitionReminderEvent(
	invoice: InvoiceNotificationInput,
	vnDate: string,
): NotificationEvent {
	const urls = buildInvoiceEmailUrls({
		invoiceId: invoice.id,
		payToken: invoice.payToken,
		studentOrigin: invoice.studentOrigin,
		appOrigin: invoice.appOrigin,
	});
	const rendered = renderInvoiceEmail({
		variant: "reminder",
		invoiceId: invoice.id,
		amountDue: invoice.amount,
		totalAmount: invoice.totalAmount,
		paidAmount: invoice.paidAmount,
		due: invoice.due,
		vnToday: vnDate,
		studentName: invoice.studentName,
		className: invoice.className,
		note: invoice.note,
		orgName: invoice.orgName,
		brandName: BRAND_NAME,
		payUrl: urls.payUrl,
		portalUrl: urls.portalUrl,
		payment: invoice.payment,
	});
	return {
		studentId: invoice.studentId,
		eventType: "tuition_reminder",
		idempotencyKey: `tuition_reminder:${invoice.id}:${vnDate}`,
		title: rendered.subject,
		body: rendered.inboxBody,
		htmlBody: rendered.html,
		textBody: rendered.text,
		linkPath: "/tuition",
		refType: "invoice",
		refId: invoice.id,
	};
}

/**
 * Sự kiện "học viên được mời vào lớp" (#454 phase 3) — builder thuần,
 * khóa chống trùng theo enrollment (mời lại sau khi hủy = enrollment mới).
 */
export function classEnrolledEvent(input: {
	enrollmentId: string;
	studentId: string;
	className: string;
}): NotificationEvent {
	return {
		studentId: input.studentId,
		eventType: "class_enrolled",
		idempotencyKey: `class_enrolled:${input.enrollmentId}`,
		title: "Được mời vào lớp",
		body: `Bạn được mời tham gia lớp ${input.className}. Vào cổng học viên để kích hoạt và xem lịch học.`,
		linkPath: "/classes",
		refType: "enrollment",
		refId: input.enrollmentId,
	};
}

/**
 * Sự kiện "giao bài cho học viên" (#454 phase 3) — 1 sự kiện mỗi học viên
 * đích (danh sách classAssignmentTarget, hoặc cả lớp đang active).
 */
export function assignmentPublishedEvents(input: {
	classAssignmentId: string;
	title: string;
	due: string;
	dueAt?: string | null;
	studentIds: string[];
}): NotificationEvent[] {
	const rawDueAtMs = input.dueAt ? Date.parse(input.dueAt) : Number.NaN;
	const dueLabel = Number.isFinite(rawDueAtMs)
		? `${formatVietnamTimeHHMM(rawDueAtMs)} ${formatViDateDisplay(vietnamDateKeyOf(new Date(rawDueAtMs)))}`
		: formatViDateDisplay(input.due);
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "assignment_published",
		idempotencyKey: `assignment_published:${input.classAssignmentId}:${studentId}`,
		title: "Bài tập mới",
		body: `Có bài tập mới: ${input.title}, hạn nộp ${dueLabel}.`,
		// Cổng học viên xem bài qua /learn/quizzes/$assignmentId (CR I1 —
		// không có route /assignments/$id trên portal).
		linkPath: `/learn/quizzes/${input.classAssignmentId}`,
		refType: "class_assignment",
		refId: input.classAssignmentId,
	}));
}

/**
 * Sự kiện "bài đã được chấm" (#454 phase 3) — khóa canonical theo attempt:
 * cả route /api/grading/:attemptId/grade lẫn route fan-out đều phát theo
 * attempt nên enqueue không nhân đôi.
 */
export function gradeReturnedEvent(input: {
	attemptId: string;
	studentId: string;
	title: string;
	linkPath: string;
}): NotificationEvent {
	return {
		studentId: input.studentId,
		eventType: "grade_returned",
		idempotencyKey: `grade_returned:${input.attemptId}`,
		title: "Bài đã được chấm",
		body: `Bài "${input.title}" của bạn đã có điểm và nhận xét của giáo viên.`,
		linkPath: input.linkPath,
		refType: "quiz_attempt",
		refId: input.attemptId,
	};
}

/** Sự kiện "hóa đơn học phí được tạo" (#454 phase 3). */
export function invoiceIssuedEvent(
	invoice: InvoiceNotificationInput,
): NotificationEvent {
	const urls = buildInvoiceEmailUrls({
		invoiceId: invoice.id,
		payToken: invoice.payToken,
		studentOrigin: invoice.studentOrigin,
		appOrigin: invoice.appOrigin,
	});
	const rendered = renderInvoiceEmail({
		variant: "issued",
		invoiceId: invoice.id,
		amountDue: invoice.amount,
		totalAmount: invoice.totalAmount,
		paidAmount: invoice.paidAmount,
		due: invoice.due,
		studentName: invoice.studentName,
		className: invoice.className,
		note: invoice.note,
		orgName: invoice.orgName,
		brandName: BRAND_NAME,
		payUrl: urls.payUrl,
		portalUrl: urls.portalUrl,
		payment: invoice.payment,
	});
	return {
		studentId: invoice.studentId,
		eventType: "invoice_issued",
		idempotencyKey: `invoice_issued:${invoice.id}`,
		title: rendered.subject,
		body: rendered.inboxBody,
		htmlBody: rendered.html,
		textBody: rendered.text,
		linkPath: "/tuition",
		refType: "invoice",
		refId: invoice.id,
	};
}

/**
 * Sự kiện "đổi lịch/hủy buổi học" (#454 phase 3) — 1 sự kiện mỗi học viên có
 * dòng lesson bị đổi. `date` là ngày bị tác động, `editedAtMs` là thời điểm
 * route ghi thay đổi (mỗi lần đổi thật sự là 1 khóa mới).
 */
export function scheduleChangedEvents(input: {
	classId: string;
	date: string;
	editedAtMs: number;
	studentIds: string[];
}): NotificationEvent[] {
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "schedule_changed",
		idempotencyKey: `schedule_changed:${input.classId}:${input.date}:${input.editedAtMs}:${studentId}`,
		title: "Lịch học thay đổi",
		body: `Lịch học ngày ${input.date} vừa được giáo viên thay đổi hoặc hủy. Vui lòng kiểm tra lại lịch học.`,
		// Cổng học viên chưa có trang lịch — hạ cánh về danh sách lớp (CR I1).
		linkPath: "/classes",
		refType: "lesson",
		refId: `${input.classId}:${input.date}`,
	}));
}

/**
 * Sự kiện "tạo lịch nghỉ chung" cho #445 (TOS-11) — builder thuần, route
 * phát sự kiện sẽ nối sau khi #445 merge (D9). Trả 1 sự kiện mỗi học viên.
 */
export function holidayCreatedEvents(input: {
	holidayId: string;
	title: string;
	date: string;
	studentIds: string[];
}): NotificationEvent[] {
	return input.studentIds.map((studentId) => ({
		studentId,
		eventType: "holiday_created",
		idempotencyKey: `holiday_created:${input.holidayId}:${studentId}`,
		title: "Thông báo lịch nghỉ",
		body: `Trung tâm nghỉ ngày ${input.date}: ${input.title}.`,
		// Cổng học viên chưa có trang lịch — hạ cánh về danh sách lớp (CR I1).
		linkPath: "/classes",
		refType: "holiday",
		refId: input.holidayId,
	}));
}

/** Sự kiện in-app khi học viên nộp bài kiểm tra đầu vào thành công. */
export function placementSubmittedEvent(input: {
	submissionId: string;
	studentId: string;
}): NotificationEvent {
	return {
		studentId: input.studentId,
		eventType: "placement_submitted",
		idempotencyKey: `placement_submitted:${input.submissionId}`,
		title: "Nộp bài kiểm tra đầu vào thành công",
		body: "Bài làm của bạn đã được ghi nhận và đang chờ giáo viên chấm điểm. Bấm để xem trạng thái và kết quả.",
		linkPath: "/placement-test",
		refType: "placement_submission",
		refId: input.submissionId,
		channels: "in_app",
	};
}

/**
 * Kiểm tra học viên đã nhận đủ thông báo khai giảng chưa:
 * - Chưa có bản ghi nào → `false`.
 * - Hiện đã có email → chỉ `true` khi từng có ít nhất 1 bản ghi chứa kênh `"email"`
 *   (học viên trước đó chỉ nhận `in_app` vì thiếu email sẽ được nâng cấp gửi email ở lần `new_only`).
 * - Hiện chưa có email → `true` (đã nhận `in_app`, tránh gửi lặp vô hạn).
 */
export function isOpeningStudentNotified(
	studentEmail: string,
	priorChannels: ReadonlySet<string> | undefined,
): boolean {
	if (!priorChannels || priorChannels.size === 0) return false;
	if (studentEmail.trim().length > 0) {
		for (const channels of priorChannels) {
			if (channels.includes("email")) return true;
		}
		return false;
	}
	return true;
}

/**
 * Sự kiện thông báo chốt / cập nhật lịch khai giảng lớp học — sinh HTML và
 * plain-text thương hiệu riêng từng học viên, khóa chống trùng theo
 * `(classId, version, studentId, channel)` để học viên từng chỉ nhận `in_app`
 * có thể nâng cấp sang `email` trong cùng phiên bản mà không bị trùng khóa.
 */
export function classOpeningConfirmedEvents(input: {
	classId: string;
	className: string;
	startDate: string;
	scheduleRaw: string;
	mode: string;
	sessionsTotal?: number;
	expectedEndDate?: string | null;
	version: number;
	isUpdate: boolean;
	teacherNote: string;
	orgName: string;
	studentOrigin?: string;
	students: Array<{ id: string; name: string; hasEmail?: boolean }>;
}): NotificationEvent[] {
	const trimmedOrigin = input.studentOrigin?.trim() ?? "";
	const normalizedOrigin = trimmedOrigin.replace(/\/+$/, "");
	const portalUrl = normalizedOrigin
		? `${normalizedOrigin}/classes`
		: undefined;

	return input.students.map((s) => {
		const channelSuffix = s.hasEmail === false ? ":in_app" : ":email";
		const rendered = renderClassOpeningEmail({
			className: input.className,
			startDate: input.startDate,
			scheduleRaw: input.scheduleRaw,
			mode: input.mode,
			sessionsTotal: input.sessionsTotal,
			expectedEndDate: input.expectedEndDate,
			studentName: s.name,
			orgName: input.orgName,
			brandName: BRAND_NAME,
			teacherNote: input.teacherNote,
			isUpdate: input.isUpdate,
			portalUrl,
		});
		return {
			studentId: s.id,
			eventType: "class_opening_confirmed",
			idempotencyKey: `class_opening_confirmed:${input.classId}:v${input.version}:${s.id}${channelSuffix}`,
			title: rendered.subject,
			body: rendered.inboxBody,
			htmlBody: rendered.html,
			textBody: rendered.text,
			linkPath: "/classes",
			refType: "class",
			refId: input.classId,
		};
	});
}

export interface DailyDeadlineReminderItem {
	assignmentId: string;
	title: string;
	className: string;
	dueTimeLabel: string;
	opensAtLabel?: string | null;
}

export interface DailyDeadlineReminderDigest {
	dateISO: string;
	studentName: string;
	homework: DailyDeadlineReminderItem[];
	selfStudy: DailyDeadlineReminderItem[];
}

function buildStudentPortalLink(baseOrigin: string, path: string): string {
	return baseOrigin ? `${baseOrigin}${path}` : path;
}

function renderReminderSectionHtml(
	heading: string,
	items: DailyDeadlineReminderItem[],
	baseOrigin: string,
): string {
	if (items.length === 0) return "";
	const itemRows = items
		.map((item) => {
			const trimmedClass = item.className.trim();
			const trimmedOpens = item.opensAtLabel?.trim() ?? "";
			const opensHtml = trimmedOpens
				? ` (mở lúc ${escapeHtml(trimmedOpens)})`
				: "";
			const metaHtml = trimmedClass
				? `${escapeHtml(trimmedClass)} &middot; Hạn ${escapeHtml(item.dueTimeLabel)}${opensHtml}`
				: `Hạn ${escapeHtml(item.dueTimeLabel)}${opensHtml}`;
			const itemUrl = buildStudentPortalLink(
				baseOrigin,
				`/learn/quizzes/${encodeURIComponent(item.assignmentId)}`,
			);
			const safeItemUrl = isSafeLinkUrl(itemUrl) ? escapeHtml(itemUrl) : "";
			const actionHtml = safeItemUrl
				? `<div style="margin-top:8px"><a href="${safeItemUrl}" style="font-size:13px;font-weight:600;color:#2563eb;text-decoration:none">Làm bài →</a></div>`
				: "";
			return [
				'<li style="padding:12px 14px;margin:0 0 8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">',
				`<div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:4px">${escapeHtml(item.title)}</div>`,
				`<div style="font-size:13px;color:#475569">${metaHtml}</div>`,
				actionHtml,
				"</li>",
			].join("");
		})
		.join("");

	return [
		`<h2 style="font-size:14px;font-weight:600;color:#0f172a;margin:20px 0 10px">${escapeHtml(heading)} (${items.length})</h2>`,
		`<ul style="list-style:none;padding:0;margin:0">${itemRows}</ul>`,
	].join("");
}

/**
 * Render email HTML có cấu trúc cho bản tin nhắc hạn bài mỗi ngày, tách riêng
 * Bài tập về nhà và Bộ đề tự học kèm link trực tiếp tới từng bài.
 */
export function renderDailyDeadlineReminderHtml(
	digest: DailyDeadlineReminderDigest,
	studentOrigin = "",
): string {
	const baseOrigin = studentOrigin.trim().replace(/\/+$/, "");
	const greetingName = digest.studentName.trim() || "bạn";
	const displayDate = formatViDateDisplay(digest.dateISO);
	const totalCount = digest.homework.length + digest.selfStudy.length;

	const homeworkHtml = renderReminderSectionHtml(
		"Bài tập về nhà",
		digest.homework,
		baseOrigin,
	);
	const selfStudyHtml = renderReminderSectionHtml(
		"Bộ đề tự học",
		digest.selfStudy,
		baseOrigin,
	);

	const allAssignmentsUrl = buildStudentPortalLink(baseOrigin, "/assignments");
	const safeAllUrl = isSafeLinkUrl(allAssignmentsUrl)
		? escapeHtml(allAssignmentsUrl)
		: "";
	const ctaHtml = safeAllUrl
		? `<p style="margin:24px 0"><a href="${safeAllUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Xem tất cả bài tập</a></p>`
		: "";

	return [
		'<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"></head><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:16px">',
		'<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">',
		`<p style="font-size:15px;line-height:1.6;color:#0f172a;margin:0 0 8px">Chào ${escapeHtml(greetingName)},</p>`,
		`<p style="font-size:15px;line-height:1.6;color:#0f172a;margin:0 0 16px">Bạn có <strong>${totalCount}</strong> bài tập cần hoàn thành trong hôm nay (${escapeHtml(displayDate)}):</p>`,
		homeworkHtml,
		selfStudyHtml,
		ctaHtml,
		`<p style="font-size:12px;color:#64748b;margin:24px 0 0">Email tự động từ ${escapeHtml(BRAND_NAME)}.</p>`,
		"</div></body></html>",
	].join("");
}

function renderReminderSectionText(
	heading: string,
	items: DailyDeadlineReminderItem[],
	baseOrigin: string,
): string[] {
	if (items.length === 0) return [];
	const lines: string[] = ["", `${heading} (${items.length}):`];
	for (const item of items) {
		const trimmedClass = item.className.trim();
		const classClause = trimmedClass ? ` (${trimmedClass})` : "";
		const trimmedOpens = item.opensAtLabel?.trim() ?? "";
		const opensClause = trimmedOpens ? ` (mở lúc ${trimmedOpens})` : "";
		lines.push(
			`- ${item.title}${classClause} — Hạn ${item.dueTimeLabel}${opensClause}`,
		);
		const itemUrl = buildStudentPortalLink(
			baseOrigin,
			`/learn/quizzes/${encodeURIComponent(item.assignmentId)}`,
		);
		if (isSafeLinkUrl(itemUrl)) {
			lines.push(`  Làm bài: ${itemUrl}`);
		}
	}
	return lines;
}

/**
 * Render bản plain-text đầy đủ cho email nhắc hạn bài mỗi ngày, giữ phân mục,
 * link từng bài và link danh sách bài tập ở cuối thư.
 */
export function renderDailyDeadlineReminderText(
	digest: DailyDeadlineReminderDigest,
	studentOrigin = "",
): string {
	const baseOrigin = studentOrigin.trim().replace(/\/+$/, "");
	const greetingName = digest.studentName.trim() || "bạn";
	const displayDate = formatViDateDisplay(digest.dateISO);
	const totalCount = digest.homework.length + digest.selfStudy.length;

	const lines: string[] = [
		`Chào ${greetingName},`,
		`Bạn có ${totalCount} bài tập cần hoàn thành trong hôm nay (${displayDate}):`,
		...renderReminderSectionText("Bài tập về nhà", digest.homework, baseOrigin),
		...renderReminderSectionText("Bộ đề tự học", digest.selfStudy, baseOrigin),
	];

	const allAssignmentsUrl = buildStudentPortalLink(baseOrigin, "/assignments");
	if (isSafeLinkUrl(allAssignmentsUrl)) {
		lines.push("", `Xem tất cả bài tập: ${allAssignmentsUrl}`);
	}
	lines.push("", `Email tự động từ ${BRAND_NAME}.`);
	return lines.join("\n");
}

/**
 * Sự kiện email tổng hợp nhắc bài tập & bộ đề tự học đến hạn trong ngày (chỉ gửi email,
 * mỗi học viên tối đa 1 email/ngày theo khóa `daily_deadline_reminder:<studentId>:<dateISO>`).
 * Lưu sẵn `htmlBody` và `textBody` để cả lượt gửi cron lẫn gửi lại thủ công giữ đúng bố cục digest.
 */
export function dailyDeadlineReminderEvent(input: {
	studentId: string;
	studentName: string;
	dateISO: string;
	homework: DailyDeadlineReminderItem[];
	selfStudy: DailyDeadlineReminderItem[];
	studentOrigin?: string;
}): NotificationEvent {
	const greetingName = input.studentName.trim() || "bạn";
	const displayDate = formatViDateDisplay(input.dateISO);
	const totalCount = input.homework.length + input.selfStudy.length;

	const lines: string[] = [
		`Chào ${greetingName},`,
		`Bạn có ${totalCount} bài tập cần hoàn thành trong hôm nay (${displayDate}):`,
	];

	if (input.homework.length > 0) {
		lines.push("", `Bài tập về nhà (${input.homework.length}):`);
		for (const item of input.homework) {
			const trimmedClass = item.className.trim();
			const classClause = trimmedClass ? ` (${trimmedClass})` : "";
			lines.push(`- ${item.title}${classClause} — Hạn ${item.dueTimeLabel}`);
		}
	}

	if (input.selfStudy.length > 0) {
		lines.push("", `Bộ đề tự học (${input.selfStudy.length}):`);
		for (const item of input.selfStudy) {
			const trimmedClass = item.className.trim();
			const classClause = trimmedClass ? ` (${trimmedClass})` : "";
			const trimmedOpens = item.opensAtLabel?.trim() ?? "";
			const opensClause = trimmedOpens ? ` (mở lúc ${trimmedOpens})` : "";
			lines.push(
				`- ${item.title}${classClause} — Hạn ${item.dueTimeLabel}${opensClause}`,
			);
		}
	}

	const digest: DailyDeadlineReminderDigest = {
		dateISO: input.dateISO,
		studentName: input.studentName,
		homework: input.homework,
		selfStudy: input.selfStudy,
	};

	return {
		studentId: input.studentId,
		eventType: "daily_deadline_reminder",
		idempotencyKey: `daily_deadline_reminder:${input.studentId}:${input.dateISO}`,
		title: `Nhắc bài tập đến hạn hôm nay (${displayDate})`,
		body: lines.join("\n"),
		htmlBody: renderDailyDeadlineReminderHtml(digest, input.studentOrigin),
		textBody: renderDailyDeadlineReminderText(digest, input.studentOrigin),
		linkPath: "/assignments",
		refType: "daily_deadline_reminder",
		refId: input.dateISO,
		channels: "email",
	};
}

/**
 * Sự kiện email nhắc link buổi học Online trước giờ học 2 tiếng (chỉ gửi email,
 * khóa chống trùng theo `(classId, dateISO, time, studentId)` để đổi giờ học vẫn
 * nhận được link cập nhật mà cùng một buổi không gửi lặp lại).
 */
export function sessionLinkReminderEvent(input: {
	classId: string;
	className: string;
	dateISO: string;
	time: string;
	dur: number;
	topic?: string;
	joinUrl: string;
	orgName?: string;
	studentId: string;
	studentName: string;
	studentOrigin?: string;
}): NotificationEvent {
	const linkPath = `/classes/${encodeURIComponent(input.classId)}/sessions/${encodeURIComponent(input.dateISO)}`;
	const normalizedOrigin = (input.studentOrigin?.trim() ?? "").replace(
		/\/+$/,
		"",
	);
	const sessionPortalUrl =
		normalizedOrigin && /^https?:\/\//i.test(normalizedOrigin)
			? `${normalizedOrigin}${linkPath}`
			: undefined;

	const rendered = renderSessionLinkEmail({
		className: input.className,
		dateISO: input.dateISO,
		time: input.time,
		dur: input.dur,
		topic: input.topic,
		joinUrl: input.joinUrl,
		sessionPortalUrl,
		studentName: input.studentName,
		orgName: input.orgName,
		brandName: BRAND_NAME,
	});

	return {
		studentId: input.studentId,
		eventType: "session_link_reminder",
		idempotencyKey: `session_link_reminder:${input.classId}:${input.dateISO}:${input.time}:${input.studentId}`,
		title: rendered.subject,
		body: rendered.summaryBody,
		htmlBody: rendered.html,
		textBody: rendered.text,
		linkPath,
		refType: "lesson",
		refId: `${input.classId}:${input.dateISO}`,
		channels: "email",
	};
}
