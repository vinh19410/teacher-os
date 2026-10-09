// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) =>
		Object.assign(options, {
			useSearch: () => router.search,
			useNavigate: () => router.navigate,
		}),
	Link: ({ to, children }: { to: string; children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

const auth = vi.hoisted(() => ({
	resetPassword: vi.fn(),
	requestPasswordReset: vi.fn(),
	// The reset pages are reached from an email link, logged out: touching the
	// session would gate them behind a loader or a login redirect.
	useSession: vi.fn(() => {
		throw new Error("reset pages must not read the session");
	}),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: auth }));

import { Route as ForgotRoute } from "@/routes/forgot-password";
import { Route as ResetRoute } from "@/routes/reset-password";

type RouteWithComponent = { component: () => ReactNode };
const ForgotPassword = (ForgotRoute as unknown as RouteWithComponent).component;
const ResetPassword = (ResetRoute as unknown as RouteWithComponent).component;

beforeEach(() => {
	router.search = {};
	router.navigate = vi.fn();
	auth.resetPassword.mockReset();
	auth.resetPassword.mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe("forgot-password page", () => {
	it("renders the request form straight away for a logged-out visitor", () => {
		render(<ForgotPassword />);
		expect(screen.getByRole("heading", { name: "Quên mật khẩu" })).toBeTruthy();
		expect(screen.getByRole("textbox")).toBeTruthy();
		expect(auth.useSession).not.toHaveBeenCalled();
	});
});

describe("reset-password page", () => {
	it("renders the new-password form straight away for a logged-out visitor", () => {
		router.search = { token: "tok-1" };
		render(<ResetPassword />);
		expect(screen.getByLabelText(/^Mật khẩu mới/)).toBeTruthy();
		expect(auth.useSession).not.toHaveBeenCalled();
	});

	it("removes the one-time token from the address bar on arrival", () => {
		router.search = { token: "tok-1" };
		render(<ResetPassword />);
		expect(router.navigate).toHaveBeenCalledWith({ search: {}, replace: true });
	});

	it("still resets with the captured token after the URL was cleared", async () => {
		router.search = { token: "tok-1" };
		const view = render(<ResetPassword />);
		// The navigate above empties the search; the page re-renders with it.
		router.search = {};
		view.rerender(<ResetPassword />);

		fireEvent.change(screen.getByLabelText(/^Mật khẩu mới/), {
			target: { value: "new-password-1" },
		});
		fireEvent.change(screen.getByLabelText(/^Nhập lại mật khẩu mới/), {
			target: { value: "new-password-1" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

		await waitFor(() =>
			expect(auth.resetPassword).toHaveBeenCalledWith({
				newPassword: "new-password-1",
				token: "tok-1",
			}),
		);
	});

	it("shows the invalid-link view when the link carried an error", () => {
		router.search = { token: "tok-1", error: "INVALID_TOKEN" };
		render(<ResetPassword />);
		expect(
			screen.getByText("Liên kết đặt lại không hợp lệ hoặc đã hết hạn."),
		).toBeTruthy();
		expect(screen.queryByLabelText(/^Mật khẩu mới/)).toBeNull();
	});
});
