// @vitest-environment jsdom
import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markRoleBlocked, resetRoleBlockedForTest } from "@/lib/role-block";

const useSession = vi.hoisted(() => vi.fn());
const sendVerificationEmail = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession,
		sendVerificationEmail,
		signOut,
	},
}));

import AccountBlockedView from "./account-blocked-view";

beforeEach(() => {
	resetRoleBlockedForTest();
	useSession.mockReset();
	sendVerificationEmail.mockReset();
	signOut.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("AccountBlockedView (#524)", () => {
	it("giữ nguyên tiêu đề 'Đây là tài khoản học viên' và ẩn nút gửi lại khi bị chặn bởi ACCOUNT_TEACHER_NOT_ALLOWED", () => {
		useSession.mockReturnValue({
			data: { user: { email: "stranger@x.vn", emailVerified: false } },
			isPending: false,
		});
		markRoleBlocked(ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED);
		render(<AccountBlockedView />);

		expect(
			screen.getByRole("heading", { name: "Đây là tài khoản học viên" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Gửi lại email xác thực" }),
		).toBeNull();
	});

	it("hiển thị nút gửi lại email xác thực khi bị chặn bởi ACCOUNT_TEACHER_EMAIL_UNVERIFIED và xử lý cả thành công lẫn lỗi res.error", async () => {
		useSession.mockReturnValue({
			data: { user: { email: "owner@x.vn", emailVerified: false } },
			isPending: false,
		});
		markRoleBlocked(ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED);
		render(<AccountBlockedView />);

		expect(
			screen.getByRole("heading", { name: "Đây là tài khoản học viên" }),
		).toBeTruthy();

		sendVerificationEmail.mockResolvedValueOnce({
			error: { message: "Rate limit exceeded", code: "TOO_MANY_REQUESTS" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Gửi lại email xác thực" }),
		);
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toContain(
			"Rate limit exceeded",
		);

		sendVerificationEmail.mockResolvedValueOnce({ error: null });
		fireEvent.click(
			screen.getByRole("button", { name: "Gửi lại email xác thực" }),
		);
		expect(
			await screen.findByText(
				"Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư của bạn.",
			),
		).toBeTruthy();
		expect(sendVerificationEmail).toHaveBeenCalledWith({
			email: "owner@x.vn",
			callbackURL: `${window.location.origin}/verify-email?verified=ok`,
		});
	});
});
