import { BRAND_NAME } from "../brand";
import { renderHtml, renderText } from "./deliver";

function cleanInlineText(value: string, maxLen = 160): string {
	return value
		.replaceAll("\r", " ")
		.replaceAll("\n", " ")
		.replaceAll("\0", "")
		.trim()
		.slice(0, maxLen);
}

function normalizePortalUrl(studentOrigin?: string): string {
	const trimmed = (studentOrigin ?? "").trim().replace(/\/+$/, "");
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return `${trimmed}/login`;
	}
	return "";
}

export interface BuiltInviteEmail {
	subject: string;
	html: string;
	text: string;
}

/**
 * Nội dung email lời mời tham gia tổ chức (`POST /api/students/invite` & `/resend`).
 * Học viên đăng ký/đăng nhập trên Student Portal rồi bấm Chấp nhận tại biểu tượng chuông.
 */
export function buildOrgInvitationEmail(input: {
	orgName: string;
	inviterName?: string;
	studentOrigin?: string;
}): BuiltInviteEmail {
	const orgLabel = cleanInlineText(input.orgName) || BRAND_NAME;
	const inviter = cleanInlineText(input.inviterName ?? "");
	const subject = `Lời mời tham gia ${orgLabel} trên ${BRAND_NAME}`;
	const inviterClause = inviter ? `Giáo viên ${inviter}` : orgLabel;
	const body = `${inviterClause} đã mời bạn tham gia ${orgLabel} trên ${BRAND_NAME}. Vui lòng mở cổng học viên, đăng nhập hoặc tạo tài khoản bằng đúng địa chỉ email này, sau đó bấm biểu tượng chuông thông báo để chấp nhận lời mời.`;
	const portalUrl = normalizePortalUrl(input.studentOrigin);
	return {
		subject,
		html: renderHtml(body, portalUrl, "Mở cổng học viên"),
		text: renderText(body, portalUrl),
	};
}

/**
 * Nội dung email mời học viên đã được giáo viên tạo sẵn hồ sơ (`POST /api/students` & `/students/:id/resend-invite`).
 * Khi đăng nhập bằng đúng email trên Student Portal, tài khoản tự động khớp hồ sơ.
 */
export function buildStudentPortalInviteEmail(input: {
	orgName: string;
	studentName?: string;
	className?: string;
	studentOrigin?: string;
}): BuiltInviteEmail {
	const orgLabel = cleanInlineText(input.orgName) || BRAND_NAME;
	const studentName = cleanInlineText(input.studentName ?? "");
	const className = cleanInlineText(input.className ?? "");
	const greeting = studentName ? `Chào ${studentName}, ` : "";
	const subject = className
		? `Lời mời tham gia lớp ${className} tại ${orgLabel}`
		: `Lời mời tham gia cổng học viên ${orgLabel}`;
	const body = className
		? `${greeting}hồ sơ học viên của bạn trong lớp ${className} tại ${orgLabel} đã sẵn sàng. Vui lòng mở cổng học viên và đăng nhập hoặc tạo tài khoản bằng đúng địa chỉ email này để xem lịch học và bài tập.`
		: `${greeting}hồ sơ học viên của bạn tại ${orgLabel} đã sẵn sàng. Vui lòng mở cổng học viên và đăng nhập hoặc tạo tài khoản bằng đúng địa chỉ email này để bắt đầu học tập.`;
	const portalUrl = normalizePortalUrl(input.studentOrigin);
	return {
		subject,
		html: renderHtml(body, portalUrl, "Mở cổng học viên"),
		text: renderText(body, portalUrl),
	};
}
