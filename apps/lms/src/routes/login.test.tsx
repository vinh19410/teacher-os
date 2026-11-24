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
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const navMock = vi.hoisted(() => ({
	redirectReplace: vi.fn(),
	redirectAssign: vi.fn(),
	reloadPage: vi.fn(),
}));
vi.mock("@/lib/navigation", () => navMock);

const authMock = vi.hoisted(() => ({
	session: null as {
		user?: {
			id: string;
			email?: string;
			role?: string | null;
			emailVerified?: boolean;
		};
	} | null,
	isPending: false,
	signInEmail: vi.fn(),
	signInSocial: vi.fn(),
	signUpEmail: vi.fn(),
	getSession: vi.fn(),
	signOut: vi.fn(),
	sendVerificationEmail: vi.fn(),
}));

vi.mock("@/lib/auth-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth-client")>();
	return {
		...actual,
		authClient: {
			useSession: () => ({
				data: authMock.session,
				isPending: authMock.isPending,
			}),
			signIn: {
				email: authMock.signInEmail,
				social: authMock.signInSocial,
			},
			signUp: {
				email: authMock.signUpEmail,
			},
			getSession: authMock.getSession,
			signOut: authMock.signOut,
			sendVerificationEmail: authMock.sendVerificationEmail,
		},
	};
});

import { Route as LoginRoute } from "./login";

const LoginPage = (LoginRoute as unknown as { component: () => ReactNode })
	.component;
const validateSearch = (
	LoginRoute as unknown as {
		validateSearch: (
			search: Record<string, unknown>,
		) => Record<string, unknown>;
	}
).validateSearch;

beforeEach(() => {
	resetRouterState();
	authMock.session = null;
	authMock.isPending = false;
	authMock.signInEmail.mockReset();
	authMock.signInSocial.mockReset();
	authMock.signUpEmail.mockReset();
	authMock.getSession.mockReset();
	authMock.signOut.mockReset();
	authMock.sendVerificationEmail.mockReset();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function requireElement(selector: string): Element {
	const el = document.querySelector(selector);
	if (!el) {
		throw new Error(`Expected element matching ${selector}`);
	}
	return el;
}

describe("Unified /login route", () => {
	it("normalizes numeric blocked=1 and gateStatus from TanStack Router search parser", () => {
		expect(
			validateSearch({
				blocked: 1,
				gateStatus: 403,
				error: "NOT_ADMIN",
				tab: "signup",
			}),
		).toEqual({
			returnUrl: undefined,
			error: "NOT_ADMIN",
			error_description: undefined,
			blocked: 1,
			gateStatus: 403,
			tab: "signup",
		});
	});

	it("renders signin tab by default and switches cleanly to student signup tab", () => {
		render(<LoginPage />);

		const signInTab = screen.getByRole("tab", { name: "Đăng nhập" });
		const signUpTab = screen.getByRole("tab", { name: "Đăng ký" });
		expect(signInTab.getAttribute("aria-selected")).toBe("true");
		expect(signUpTab.getAttribute("aria-selected")).toBe("false");
		expect(document.querySelector("#signin-email")).not.toBeNull();
		expect(document.querySelector("#signin-password")).not.toBeNull();
		expect(screen.getByRole("switch", { name: "Giao diện tối" })).toBeDefined();

		fireEvent.click(signUpTab);
		expect(signUpTab.getAttribute("aria-selected")).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Tạo tài khoản học viên" }),
		).toBeDefined();
		expect(document.querySelector("#signup-name")).not.toBeNull();
		expect(document.querySelector("#signup-email")).not.toBeNull();
		expect(document.querySelector("#signup-password")).not.toBeNull();
	});

	it("auto-redirects already authenticated user to role home when blocked !== '1'", () => {
		authMock.session = {
			user: { id: "u1", email: "t@example.com", role: "teacher" },
		};
		routerState.search = { returnUrl: "/teacher/schedule" };

		render(<LoginPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith("/teacher/schedule");
	});

	it("blocks auto-redirect loop when blocked=1 and shows sign-out action for NOT_ADMIN", async () => {
		authMock.session = {
			user: { id: "u2", email: "student@example.com", role: "student" },
		};
		authMock.signOut.mockResolvedValue({
			data: { success: true },
			error: null,
		});
		routerState.search = {
			blocked: 1,
			error: "NOT_ADMIN",
			returnUrl: "/admin",
		};

		render(<LoginPage />);

		expect(navMock.redirectReplace).not.toHaveBeenCalled();
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain(
			"Tài khoản của bạn không có quyền quản trị.",
		);
		expect(alert.textContent).toContain("student@example.com");
		expect(
			screen.queryByRole("button", { name: /Gửi lại email xác thực/i }),
		).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /Đăng xuất để đổi tài khoản/i }),
		);
		await waitFor(() => {
			expect(authMock.signOut).toHaveBeenCalledTimes(1);
			expect(navMock.redirectAssign).toHaveBeenCalledWith("/login");
		});
	});

	it("shows resend verification button in blocked state for TEACHER_EMAIL_UNVERIFIED", async () => {
		authMock.session = {
			user: {
				id: "u3",
				email: "teacher@example.com",
				role: "teacher",
				emailVerified: false,
			},
		};
		authMock.sendVerificationEmail.mockResolvedValue({
			data: { status: true },
			error: null,
		});
		routerState.search = {
			blocked: 1,
			error: "TEACHER_EMAIL_UNVERIFIED",
		};

		render(<LoginPage />);

		expect(navMock.redirectReplace).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Email tài khoản giáo viên chưa được xác thực",
		);

		fireEvent.click(
			screen.getByRole("button", { name: /Gửi lại email xác thực/i }),
		);
		await waitFor(() => {
			expect(authMock.sendVerificationEmail).toHaveBeenCalledWith({
				email: "teacher@example.com",
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
		});
		expect(screen.getByText(/Đã gửi lại email xác thực/i)).toBeDefined();
	});

	it("exits blocked state to root / when resend reports EMAIL_ALREADY_VERIFIED", async () => {
		authMock.session = {
			user: {
				id: "u3b",
				email: "teacher@example.com",
				role: "teacher",
				emailVerified: false,
			},
		};
		authMock.sendVerificationEmail.mockResolvedValue({
			data: null,
			error: {
				code: "EMAIL_ALREADY_VERIFIED",
				message: "EMAIL_ALREADY_VERIFIED",
			},
		});
		routerState.search = {
			blocked: 1,
			error: "TEACHER_EMAIL_UNVERIFIED",
		};

		render(<LoginPage />);
		fireEvent.click(
			screen.getByRole("button", { name: /Gửi lại email xác thực/i }),
		);

		await waitFor(() => {
			expect(navMock.redirectReplace).toHaveBeenCalledWith("/");
		});
		expect(navMock.reloadPage).not.toHaveBeenCalled();
	});

	it("initiates Google OAuth with /?returnUrl=... callbackURL and /login errorCallbackURL", async () => {
		authMock.signInSocial.mockResolvedValue({ data: {}, error: null });
		routerState.search = { returnUrl: "/teacher/classes/c-1" };

		render(<LoginPage />);
		fireEvent.click(
			screen.getByRole("button", { name: /Tiếp tục với Google/i }),
		);

		await waitFor(() => {
			expect(authMock.signInSocial).toHaveBeenCalledWith({
				provider: "google",
				callbackURL: `${window.location.origin}/?returnUrl=%2Fteacher%2Fclasses%2Fc-1`,
				errorCallbackURL: `${window.location.origin}/login`,
			});
		});
	});

	it("redirects to role home after email/password sign-in when session cookie verifies", async () => {
		authMock.signInEmail.mockResolvedValue({
			data: { user: { id: "u4", role: "admin" } },
			error: null,
		});
		authMock.getSession.mockResolvedValue({
			data: { user: { id: "u4", role: "admin" } },
			error: null,
		});
		routerState.search = { returnUrl: "/admin/library" };

		render(<LoginPage />);
		fireEvent.change(requireElement("#signin-email"), {
			target: { value: "admin@example.com" },
		});
		fireEvent.change(requireElement("#signin-password"), {
			target: { value: "Password123!" },
		});
		fireEvent.submit(requireElement("#panel-signin"));

		await waitFor(() => {
			expect(authMock.signInEmail).toHaveBeenCalledWith({
				email: "admin@example.com",
				password: "Password123!",
			});
			expect(authMock.getSession).toHaveBeenCalledTimes(1);
			expect(navMock.redirectAssign).toHaveBeenCalledWith("/admin/library");
		});
	});

	it("surfaces a session error and does not redirect when sign-in returns role without a live session cookie", async () => {
		authMock.signInEmail.mockResolvedValue({
			data: { user: { id: "u4b", role: "teacher" } },
			error: null,
		});
		authMock.getSession.mockResolvedValue({ data: null, error: null });

		render(<LoginPage />);
		fireEvent.change(requireElement("#signin-email"), {
			target: { value: "teacher@example.com" },
		});
		fireEvent.change(requireElement("#signin-password"), {
			target: { value: "Password123!" },
		});
		fireEvent.submit(requireElement("#panel-signin"));

		await waitFor(() => {
			expect(authMock.getSession).toHaveBeenCalledTimes(1);
		});
		expect(navMock.redirectAssign).not.toHaveBeenCalled();
		expect(screen.queryByText("Đăng nhập thành công")).toBeNull();
	});

	it("surfaces a session error and does not redirect when sign-up returns role without a live session cookie", async () => {
		authMock.signUpEmail.mockResolvedValue({
			data: { user: { id: "u5b", role: "student" } },
			error: null,
		});
		authMock.getSession.mockResolvedValue({ data: null, error: null });
		routerState.search = { tab: "signup" };

		render(<LoginPage />);
		fireEvent.change(requireElement("#signup-name"), {
			target: { value: "Nguyễn Minh Anh" },
		});
		fireEvent.change(requireElement("#signup-email"), {
			target: { value: "student@example.com" },
		});
		fireEvent.change(requireElement("#signup-password"), {
			target: { value: "Password123!" },
		});
		fireEvent.submit(requireElement("#panel-signup"));

		await waitFor(() => {
			expect(authMock.getSession).toHaveBeenCalledTimes(1);
		});
		expect(navMock.redirectAssign).not.toHaveBeenCalled();
		expect(screen.queryByText("Tài khoản đã tạo")).toBeNull();
	});

	it("renders normal login form when ?blocked=1 is opened without an active session and does not strip blocked while session is pending", () => {
		authMock.isPending = true;
		authMock.session = null;
		routerState.search = { blocked: 1, error: "NOT_ADMIN" };

		const { rerender } = render(<LoginPage />);
		expect(routerState.navigate).not.toHaveBeenCalled();

		authMock.isPending = false;
		authMock.session = {
			user: { id: "u-blocked", email: "blocked@example.com", role: "admin" },
		};
		rerender(<LoginPage />);
		expect(routerState.navigate).not.toHaveBeenCalled();
		expect(navMock.redirectReplace).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Tài khoản của bạn không có quyền quản trị.",
		);

		authMock.session = null;
		rerender(<LoginPage />);
		expect(document.querySelector("#signin-email")).not.toBeNull();
		expect(screen.queryByText("Không thể truy cập trang này")).toBeNull();
	});

	it("verifies session cookie on email/password sign-up and redirects by assigned role", async () => {
		authMock.signUpEmail.mockResolvedValue({
			data: { user: { id: "u5" } },
			error: null,
		});
		authMock.getSession.mockResolvedValue({
			data: { user: { id: "u5", role: "student" } },
			error: null,
		});
		routerState.search = { tab: "signup" };

		render(<LoginPage />);
		fireEvent.change(requireElement("#signup-name"), {
			target: { value: "Nguyễn Minh Anh" },
		});
		fireEvent.change(requireElement("#signup-email"), {
			target: { value: "student@example.com" },
		});
		fireEvent.change(requireElement("#signup-password"), {
			target: { value: "Password123!" },
		});
		fireEvent.submit(requireElement("#panel-signup"));

		await waitFor(() => {
			expect(authMock.signUpEmail).toHaveBeenCalledWith({
				name: "Nguyễn Minh Anh",
				email: "student@example.com",
				password: "Password123!",
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
			expect(authMock.getSession).toHaveBeenCalledTimes(1);
			expect(navMock.redirectAssign).toHaveBeenCalledWith("/student");
		});
	});
});
