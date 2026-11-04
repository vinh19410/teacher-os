// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import { OtpSignInForm } from "./otp-sign-in-form";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/overview" }),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		emailOtp: {
			sendVerificationOtp: vi.fn().mockResolvedValue({ error: null }),
		},
		signIn: {
			emailOtp: vi.fn().mockResolvedValue({ error: null }),
		},
		getSession: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
	},
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

describe("OtpSignInForm component (#578)", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders email step initially with email field and submit button", () => {
		render(<OtpSignInForm onSwitchToPassword={vi.fn()} />);

		expect(screen.getByLabelText(/Email học viên/i)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Gửi mã đăng nhập/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Đăng nhập bằng mật khẩu/i }),
		).toBeDefined();
	});

	it("validates empty email before submission", async () => {
		render(<OtpSignInForm />);

		const submitBtn = screen.getByRole("button", { name: /Gửi mã đăng nhập/i });
		fireEvent.click(submitBtn);

		expect(
			await screen.findByText(/Vui lòng nhập địa chỉ email/i),
		).toBeDefined();
	});

	it("submits email and switches to 6-digit OTP code step", async () => {
		render(<OtpSignInForm />);

		const emailInput = screen.getByLabelText(/Email học viên/i);
		fireEvent.change(emailInput, { target: { value: "student@example.com" } });

		const submitBtn = screen.getByRole("button", { name: /Gửi mã đăng nhập/i });
		fireEvent.click(submitBtn);

		expect(await screen.findByLabelText(/Mã xác thực 6 số/i)).toBeDefined();
		expect(screen.getByRole("button", { name: /Đăng nhập/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Đổi email/i })).toBeDefined();
		expect(screen.getByText(/Gửi tới:/i)).toBeDefined();
	});

	it("switches back to email step when clicking Đổi email", async () => {
		render(<OtpSignInForm />);

		const emailInput = screen.getByLabelText(/Email học viên/i);
		fireEvent.change(emailInput, { target: { value: "student@example.com" } });
		fireEvent.click(screen.getByRole("button", { name: /Gửi mã đăng nhập/i }));

		const changeEmailBtn = await screen.findByRole("button", {
			name: /Đổi email/i,
		});
		fireEvent.click(changeEmailBtn);

		expect(screen.getByLabelText(/Email học viên/i)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Gửi mã đăng nhập/i }),
		).toBeDefined();
	});

	it("handles role mismatch error toast on OTP submit", async () => {
		vi.mocked(authClient.signIn.emailOtp).mockResolvedValueOnce({
			error: { message: "ROLE_MISMATCH", code: "ROLE_MISMATCH" },
		} as never);

		render(<OtpSignInForm />);

		const emailInput = screen.getByLabelText(/Email học viên/i);
		fireEvent.change(emailInput, { target: { value: "teacher@example.com" } });
		fireEvent.click(screen.getByRole("button", { name: /Gửi mã đăng nhập/i }));

		const otpInput = await screen.findByLabelText(/Mã xác thực 6 số/i);
		fireEvent.change(otpInput, { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: /Đăng nhập/i }));
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Tài khoản giáo viên không thể đăng nhập vào cổng học viên.",
			);
		});
	});

	it("handles too many attempts error toast on OTP submit", async () => {
		vi.mocked(authClient.signIn.emailOtp).mockResolvedValueOnce({
			error: { message: "Too many attempts", code: "TOO_MANY_ATTEMPTS" },
		} as never);

		render(<OtpSignInForm />);

		const emailInput = screen.getByLabelText(/Email học viên/i);
		fireEvent.change(emailInput, { target: { value: "student@example.com" } });
		fireEvent.click(screen.getByRole("button", { name: /Gửi mã đăng nhập/i }));

		const otpInput = await screen.findByLabelText(/Mã xác thực 6 số/i);
		fireEvent.change(otpInput, { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: /Đăng nhập/i }));
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.",
			);
		});
	});
});
