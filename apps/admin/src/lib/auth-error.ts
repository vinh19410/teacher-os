export function authErrorMessage(error: unknown, fallback: string): string {
	if (typeof error === "string" && error.trim()) return error;
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		for (const key of ["message", "statusText"] as const) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value;
		}
	}
	return fallback;
}

/**
 * Mã lỗi guard admin hiển thị trên /login (`?error=`). Sinh từ HTTP status
 * + `code` trong body của `GET /api/admin/me` (requireAdmin, plan #413):
 * - 401: session hết hạn / chưa đăng nhập → đăng nhập lại.
 * - 403 + `ACCOUNT_NOT_ADMIN`: đã đăng nhập nhưng không qua admin gate.
 * - 403 + `ROLE_MISMATCH` / `ACCOUNT_ADMIN_ROLE`: đăng nhập Google bằng
 *   tài khoản role khác (server từ chối ở auth kernel).
 * - Còn lại: lỗi không phân loại được.
 */
export type AdminGateErrorCode =
	| "SESSION_EXPIRED"
	| "NOT_ADMIN"
	| "ROLE_MISMATCH"
	| "UNKNOWN";

export function adminGateErrorCode(
	status: number,
	code?: string,
): AdminGateErrorCode {
	if (status === 401) return "SESSION_EXPIRED";
	if (status === 403) {
		if (code === "ACCOUNT_NOT_ADMIN") return "NOT_ADMIN";
		if (code === "ROLE_MISMATCH" || code === "ACCOUNT_ADMIN_ROLE") {
			return "ROLE_MISMATCH";
		}
	}
	return "UNKNOWN";
}

export const ADMIN_GATE_MESSAGES: Record<AdminGateErrorCode, string> = {
	SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
	NOT_ADMIN: "Tài khoản của bạn không có quyền quản trị.",
	ROLE_MISMATCH:
		"Tài khoản này không phải tài khoản quản trị. Vui lòng dùng đúng tài khoản admin.",
	UNKNOWN: "Không xác thực được quyền quản trị. Vui lòng thử lại.",
};

/**
 * Thông báo cho `?error=` trên /login. Giá trị đến từ hai nguồn: guard `_auth`
 * (đã là mã gate, ví dụ `NOT_ADMIN`) và error callback OAuth của better-auth
 * (`ROLE_MISMATCH` khi tài khoản role khác đăng nhập cổng admin). Cả hai đều
 * là mã gate sẵn, nên tra thẳng thay vì map lại qua HTTP status.
 */
export function loginErrorMessage(error: string): string {
	return Object.hasOwn(ADMIN_GATE_MESSAGES, error)
		? ADMIN_GATE_MESSAGES[error as AdminGateErrorCode]
		: ADMIN_GATE_MESSAGES.UNKNOWN;
}

/** Thông báo hiển thị cho một (status, code) của /api/admin/me. */
export function adminGateMessage(status: number, code?: string): string {
	return ADMIN_GATE_MESSAGES[adminGateErrorCode(status, code)];
}
