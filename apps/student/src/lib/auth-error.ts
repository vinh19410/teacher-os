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
