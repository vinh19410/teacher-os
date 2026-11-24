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

const authState = vi.hoisted(() => ({
	session: null as { user?: Record<string, unknown> } | null,
	isPending: false,
	signInEmail: vi.fn(),
	signUpEmail: vi.fn(),
	getSession: vi.fn(),
	clearSessionCache: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
	error: vi.fn(),
	success: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) =>
		Object.assign(options, {
			useSearch: () => router.search,
			useNavigate: () => router.navigate,
		}),
	useSearch: () => router.search,
	Link: ({ to, children }: { to: string; children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("sonner", () => ({
	toast: toastMock,
}));

vi.mock("@/lib/auth-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth-client")>();
	return {
		...actual,
		authClient: {
			signIn: { email: authState.signInEmail, social: vi.fn() },
			signUp: { email: authState.signUpEmail },
			getSession: authState.getSession,
			clearSessionCache: authState.clearSessionCache,
			useSession: () => ({
				data: authState.session,
				isPending: authState.isPending,
			}),
		},
	};
});

import { Route as LoginRoute } from "@/routes/login";

type RouteWithComponent = { component: () => ReactNode };
const LoginPage = (LoginRoute as unknown as RouteWithComponent).component;

beforeEach(() => {
	router.search = {};
	router.navigate = vi.fn();
	authState.session = null;
	authState.isPending = false;
	authState.signInEmail.mockReset();
	authState.signUpEmail.mockReset();
	authState.getSession.mockReset();
	authState.clearSessionCache.mockReset();
	toastMock.error.mockReset();
	toastMock.success.mockReset();
	localStorage.clear();
});

afterEach(cleanup);

describe("/login route", () => {
	it("defaults to Đăng nhập tab and renders only 2 tabs (Đăng nhập / Đăng ký)", () => {
		render(<LoginPage />);

		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(2);
		expect(screen.getByRole("tab", { name: "Đăng nhập" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "Đăng ký" })).toBeTruthy();
		expect(screen.queryByRole("tab", { name: "Mã email" })).toBeNull();
		expect(screen.queryByRole("tab", { name: "Mật khẩu" })).toBeNull();

		expect(
			screen
				.getByRole("tab", { name: "Đăng nhập" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Chào mừng trở lại" }),
		).toBeTruthy();
		expect(document.querySelector("#panel-otp")).toBeNull();
	});

	it("falls back to Đăng nhập tab when localStorage holds legacy 'otp' value", () => {
		localStorage.setItem("teacher-os-student-auth-tab", "otp");
		render(<LoginPage />);

		expect(
			screen
				.getByRole("tab", { name: "Đăng nhập" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Chào mừng trở lại" }),
		).toBeTruthy();
	});

	it("switches between Đăng nhập and Đăng ký tabs via tab click and footer toggle", () => {
		render(<LoginPage />);

		fireEvent.click(screen.getByRole("tab", { name: "Đăng ký" }));
		expect(
			screen
				.getByRole("tab", { name: "Đăng ký" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Tạo tài khoản học viên" }),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
		expect(
			screen
				.getByRole("tab", { name: "Đăng nhập" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(
			screen.getByRole("heading", { name: "Chào mừng trở lại" }),
		).toBeTruthy();
	});

	it("stays on /login without navigating or toasting when session belongs to a teacher", () => {
		authState.session = {
			user: { id: "u-teacher", email: "t@test.local", role: "teacher" },
		};
		render(<LoginPage />);

		expect(router.navigate).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
		expect(
			screen.getByRole("heading", { name: "Chào mừng trở lại" }),
		).toBeTruthy();
	});

	it("stays on /login without navigating or toasting when session belongs to an admin", () => {
		authState.session = {
			user: { id: "u-admin", email: "a@test.local", role: "admin" },
		};
		render(<LoginPage />);

		expect(router.navigate).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
		expect(
			screen.getByRole("heading", { name: "Chào mừng trở lại" }),
		).toBeTruthy();
	});

	it("stays on /login when session user has no role (fail-closed)", () => {
		authState.session = {
			user: { id: "u-unknown", email: "x@test.local" },
		};
		render(<LoginPage />);

		expect(router.navigate).not.toHaveBeenCalled();
		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("auto-redirects to validated returnUrl when session has student role and clears session cache first", () => {
		const callOrder: string[] = [];
		authState.clearSessionCache.mockImplementation(() => {
			callOrder.push("clearSessionCache");
		});
		router.navigate.mockImplementation(() => {
			callOrder.push("navigate");
		});
		authState.session = {
			user: { id: "u-student", email: "s@test.local", role: "student" },
		};
		router.search = { returnUrl: "/student/classes" };
		render(<LoginPage />);

		expect(router.navigate).toHaveBeenCalledWith({ to: "/classes" });
		expect(callOrder).toEqual(["clearSessionCache", "navigate"]);
	});

	it("falls back to root path for unsafe returnUrl when session has student role", () => {
		authState.session = {
			user: { id: "u-student", email: "s@test.local", role: "student" },
		};
		router.search = { returnUrl: "//evil.example/phish" };
		render(<LoginPage />);

		expect(router.navigate).toHaveBeenCalledWith({ to: "/" });
	});

	it("preserves ROLE_MISMATCH toast for Google OAuth error callbacks", () => {
		router.search = {
			error: "ROLE_MISMATCH",
			error_description: "Email này thuộc tài khoản giáo viên.",
			returnUrl: "/student/classes",
		};
		render(<LoginPage />);

		expect(toastMock.error).toHaveBeenCalledWith(
			"Email này thuộc tài khoản giáo viên.",
		);
		expect(router.navigate).toHaveBeenCalledWith({
			search: { returnUrl: "/student/classes" },
			replace: true,
		});
	});

	it("clears session cache before navigating after successful email sign-in", async () => {
		const callOrder: string[] = [];
		const assignSpy = vi.fn(() => {
			callOrder.push("assign");
		});
		vi.stubGlobal("location", {
			origin: "http://localhost:8003",
			assign: assignSpy,
		});
		authState.clearSessionCache.mockImplementation(() => {
			callOrder.push("clearSessionCache");
		});
		authState.signInEmail.mockResolvedValue({ error: null });
		authState.getSession.mockResolvedValue({
			data: {
				user: {
					id: "u-student",
					email: "hocvien@example.com",
					role: "student",
				},
			},
		});
		router.search = { returnUrl: "/student/classes" };

		try {
			render(<LoginPage />);
			fireEvent.change(document.getElementById("signin-email") as Element, {
				target: { value: "hocvien@example.com" },
			});
			fireEvent.change(document.getElementById("signin-password") as Element, {
				target: { value: "password123" },
			});
			fireEvent.submit(document.getElementById("panel-signin") as Element);

			await waitFor(() => {
				expect(assignSpy).toHaveBeenCalledWith("/student/classes");
			});
			expect(callOrder).toEqual(["clearSessionCache", "assign"]);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("clears session cache before navigating after successful email sign-up", async () => {
		const callOrder: string[] = [];
		const assignSpy = vi.fn(() => {
			callOrder.push("assign");
		});
		vi.stubGlobal("location", {
			origin: "http://localhost:8003",
			assign: assignSpy,
		});
		authState.clearSessionCache.mockImplementation(() => {
			callOrder.push("clearSessionCache");
		});
		authState.signUpEmail.mockResolvedValue({ error: null });
		authState.getSession.mockResolvedValue({
			data: {
				user: { id: "u-student", email: "new@example.com", role: "student" },
			},
		});
		router.search = { returnUrl: "/student/onboarding" };

		try {
			render(<LoginPage />);
			fireEvent.click(screen.getByRole("tab", { name: "Đăng ký" }));
			fireEvent.change(document.getElementById("signup-name") as Element, {
				target: { value: "Nguyen Van A" },
			});
			fireEvent.change(document.getElementById("signup-email") as Element, {
				target: { value: "new@example.com" },
			});
			fireEvent.change(document.getElementById("signup-password") as Element, {
				target: { value: "password123" },
			});
			fireEvent.submit(document.getElementById("panel-signup") as Element);

			await waitFor(() => {
				expect(assignSpy).toHaveBeenCalledWith("/student/onboarding");
			});
			expect(callOrder).toEqual(["clearSessionCache", "assign"]);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
