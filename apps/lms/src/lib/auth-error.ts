export function authErrorMessage(error: unknown, fallback: string): string {
	if (typeof error === "string" && error.trim()) return error;
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		if (
			record.code === "USER_ALREADY_EXISTS" ||
			record.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
		) {
			return "Email này đã có tài khoản. Vui lòng chuyển sang tab Đăng nhập hoặc dùng Quên mật khẩu? để đặt mật khẩu.";
		}
		if (record.code === "INVALID_EMAIL_OR_PASSWORD") {
			return "Email hoặc mật khẩu chưa đúng. Nếu trước đây bạn đăng nhập bằng mã email, hãy chọn Quên mật khẩu? để đặt mật khẩu.";
		}
		for (const key of ["message", "statusText"] as const) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return value;
		}
	}
	return fallback;
}

export type GateErrorCode =
	| "NOT_ADMIN"
	| "TEACHER_NOT_ALLOWED"
	| "TEACHER_EMAIL_UNVERIFIED"
	| "EMAIL_NOT_VERIFIED"
	| "SESSION_EXPIRED"
	| "ROLE_MISMATCH";

export const GATE_ERROR_MESSAGES: Record<GateErrorCode, string> = {
	NOT_ADMIN: "Tài khoản của bạn không có quyền quản trị.",
	TEACHER_NOT_ALLOWED:
		"Tài khoản của bạn chưa nằm trong danh sách giáo viên được cấp quyền truy cập.",
	TEACHER_EMAIL_UNVERIFIED:
		"Email tài khoản giáo viên chưa được xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.",
	EMAIL_NOT_VERIFIED:
		"Email của bạn chưa được xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.",
	SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
	ROLE_MISMATCH: "Tài khoản này không có quyền truy cập trang bạn yêu cầu.",
};

const BLOCKED_FALLBACK_MESSAGE =
	"Tài khoản hiện tại không có quyền truy cập trang này. Vui lòng đăng xuất để đổi tài khoản.";

const OAUTH_FALLBACK_MESSAGE = "Đăng nhập Google thất bại. Vui lòng thử lại.";

export function getBlockedErrorMessage(error?: string): string {
	if (error && Object.hasOwn(GATE_ERROR_MESSAGES, error)) {
		return GATE_ERROR_MESSAGES[error as GateErrorCode];
	}
	return BLOCKED_FALLBACK_MESSAGE;
}

export function getLoginToastErrorMessage(
	error: string,
	errorDescription?: string,
): string {
	if (error === "ROLE_MISMATCH") {
		return errorDescription || GATE_ERROR_MESSAGES.ROLE_MISMATCH;
	}
	if (Object.hasOwn(GATE_ERROR_MESSAGES, error)) {
		return GATE_ERROR_MESSAGES[error as GateErrorCode];
	}
	return OAUTH_FALLBACK_MESSAGE;
}

export function needsEmailVerificationResend(error?: string): boolean {
	return error === "TEACHER_EMAIL_UNVERIFIED" || error === "EMAIL_NOT_VERIFIED";
}
