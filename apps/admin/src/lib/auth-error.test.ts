import { describe, expect, it } from "vitest";
import {
	adminGateErrorCode,
	adminGateMessage,
	authErrorMessage,
} from "@/lib/auth-error";

describe("adminGateErrorCode", () => {
	it("401 → SESSION_EXPIRED bất kể code", () => {
		expect(adminGateErrorCode(401)).toBe("SESSION_EXPIRED");
		expect(adminGateErrorCode(401, "ACCOUNT_NOT_ADMIN")).toBe(
			"SESSION_EXPIRED",
		);
	});

	it("403 + ACCOUNT_NOT_ADMIN (requireAdmin) → NOT_ADMIN", () => {
		expect(adminGateErrorCode(403, "ACCOUNT_NOT_ADMIN")).toBe("NOT_ADMIN");
	});

	it("403 + ROLE_MISMATCH / ACCOUNT_ADMIN_ROLE (auth kernel) → ROLE_MISMATCH", () => {
		expect(adminGateErrorCode(403, "ROLE_MISMATCH")).toBe("ROLE_MISMATCH");
		expect(adminGateErrorCode(403, "ACCOUNT_ADMIN_ROLE")).toBe("ROLE_MISMATCH");
	});

	it("403 không nhận diện được → UNKNOWN", () => {
		expect(adminGateErrorCode(403)).toBe("UNKNOWN");
		expect(adminGateErrorCode(403, "SOMETHING_ELSE")).toBe("UNKNOWN");
	});

	it("status khác 401/403 → UNKNOWN (lỗi mạng/500)", () => {
		expect(adminGateErrorCode(500)).toBe("UNKNOWN");
		expect(adminGateErrorCode(0)).toBe("UNKNOWN");
	});
});

describe("adminGateMessage", () => {
	it("map đúng thông báo cho từng mã gate", () => {
		expect(adminGateMessage(401)).toMatch(/hết hạn/);
		expect(adminGateMessage(403, "ACCOUNT_NOT_ADMIN")).toMatch(
			/không có quyền quản trị/,
		);
		expect(adminGateMessage(403, "ROLE_MISMATCH")).toMatch(
			/không phải tài khoản quản trị/,
		);
		expect(adminGateMessage(403, "ACCOUNT_ADMIN_ROLE")).toMatch(
			/không phải tài khoản quản trị/,
		);
	});

	it("mã không nhận diện được → thông báo fallback", () => {
		expect(adminGateMessage(500)).toMatch(/Không xác thực được/);
	});
});

describe("authErrorMessage", () => {
	it("ưu tiên message/statusText của error better-auth", () => {
		expect(authErrorMessage({ message: "boom" }, "fb")).toBe("boom");
		expect(authErrorMessage({ statusText: "Bad" }, "fb")).toBe("Bad");
		expect(authErrorMessage("chuỗi", "fb")).toBe("chuỗi");
	});

	it("rỗng/không hợp lệ → fallback", () => {
		expect(authErrorMessage({}, "fb")).toBe("fb");
		expect(authErrorMessage(null, "fb")).toBe("fb");
	});
});
