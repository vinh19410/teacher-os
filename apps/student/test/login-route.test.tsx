// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
	useSearch: () => router.search,
	Link: ({ to, children }: { to: string; children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signIn: { email: vi.fn(), social: vi.fn() },
		signUp: { email: vi.fn() },
		getSession: vi.fn(),
		useSession: () => ({ data: null, isPending: false }),
	},
}));

import { Route as LoginRoute } from "@/routes/login";

type RouteWithComponent = { component: () => ReactNode };
const LoginPage = (LoginRoute as unknown as RouteWithComponent).component;

beforeEach(() => {
	router.search = {};
	router.navigate = vi.fn();
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
});
