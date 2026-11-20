import { ROLE_HOME_PATH, resolvePostAuthRedirect } from "@teacher-os/auth/role";

export const DEFAULT_RETURN_URL = ROLE_HOME_PATH.student;

const STUDENT_BASE_RE = /^\/student(?:\/|\?|#|$)/;

/**
 * Chuẩn hóa `returnUrl` cho cổng học viên: chỉ chấp nhận đường dẫn an toàn
 * thuộc namespace `/student` (chống open redirect, scheme, `//`, `/\`, ký tự
 * điều khiển, path traversal); mặc định rơi về `/student`.
 */
export function validateReturnUrl(raw: string | undefined | null): string {
	return resolvePostAuthRedirect("student", raw);
}

/**
 * Đảm bảo href nội bộ của TanStack Router (vốn đã bị strip `basepath: "/student"`)
 * luôn mang tiền tố `/student` trước khi truyền vào `/login?returnUrl=...`.
 */
export function toStudentReturnUrl(href: string): string {
	if (
		!href?.startsWith("/") ||
		href.startsWith("//") ||
		href.startsWith("/\\")
	) {
		return DEFAULT_RETURN_URL;
	}
	if (STUDENT_BASE_RE.test(href)) {
		return validateReturnUrl(href);
	}
	if (href === "/") {
		return DEFAULT_RETURN_URL;
	}
	if (href.startsWith("/?") || href.startsWith("/#")) {
		return validateReturnUrl(`${DEFAULT_RETURN_URL}${href.slice(1)}`);
	}
	return validateReturnUrl(`${DEFAULT_RETURN_URL}${href}`);
}
