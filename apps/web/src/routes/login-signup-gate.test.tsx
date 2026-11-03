// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = vi.hoisted(() => ({
	signIn: { email: vi.fn(), social: vi.fn() },
	signUp: { email: vi.fn() },
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { ...auth, useSession: () => ({ isPending: false }) },
}));

const features = vi.hoisted(() => ({ TEACHER_SIGNUP_ENABLED: true }));
vi.mock("@/lib/features", () => ({
	get TEACHER_SIGNUP_ENABLED() {
		return features.TEACHER_SIGNUP_ENABLED;
	},
}));

import { Route as LoginRoute } from "./login";

// Route builder type của @tanstack/react-router không expose .component;
// runtime mock gắn component vào options (xem login-return-url.test.tsx).
const Login = (LoginRoute as unknown as { component: () => ReactNode })
	.component;

beforeEach(() => {
	resetRouterState();
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("/login khi cờ đăng ký TẮT (mặc định single-org)", () => {
	beforeEach(() => {
		features.TEACHER_SIGNUP_ENABLED = false;
	});

	it("chỉ còn đăng nhập: không tab, không panel, không form #su-*", () => {
		render(<Login />);
		expect(screen.queryByRole("tablist")).toBeNull();
		expect(document.querySelector("#tab-signup")).toBeNull();
		expect(document.querySelector("#panel-signup")).toBeNull();
		expect(document.querySelector("#su-name")).toBeNull();
		// Form đăng nhập và Google vẫn có mặt.
		expect(document.querySelector("#si-email")).not.toBeNull();
		expect(
			screen.getByRole("button", { name: "Continue with Google" }),
		).toBeDefined();
		expect(screen.getByText("Welcome back")).toBeDefined();
	});

	it("không còn chữ mời tạo tài khoản và link đổi tab", () => {
		render(<Login />);
		expect(screen.queryByText("Create account")).toBeNull();
		expect(screen.queryByText("Create an account")).toBeNull();
		expect(screen.queryByText("Create your account")).toBeNull();
		expect(screen.queryByText("New to Teacher OS?")).toBeNull();
	});

	it("localStorage cũ giá trị signup vẫn rơi về màn đăng nhập", () => {
		localStorage.setItem("teacher-os-auth-tab", "signup");
		render(<Login />);
		expect(document.querySelector("#si-email")).not.toBeNull();
		expect(screen.queryByRole("tablist")).toBeNull();
	});
});

describe("/login khi cờ đăng ký BẬT (VITE_TEACHER_SIGNUP_ENABLED=true)", () => {
	beforeEach(() => {
		features.TEACHER_SIGNUP_ENABLED = true;
	});

	it("giữ nguyên hiện trạng: mặc định tab signup, có tab và form đăng ký", () => {
		render(<Login />);
		expect(screen.getByRole("tablist")).toBeDefined();
		const signupTab = document.querySelector("#tab-signup");
		expect(signupTab?.getAttribute("aria-selected")).toBe("true");
		expect(document.querySelector("#su-name")).not.toBeNull();
		expect(screen.getByText("Create your account")).toBeDefined();
		expect(screen.getByText("Already have an account?")).toBeDefined();
	});
});
