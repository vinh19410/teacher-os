import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/" }),
	Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signIn: { email: vi.fn(), social: vi.fn() },
		signUp: { email: vi.fn() },
		getSession: vi.fn(),
		useSession: () => ({ data: null, isPending: false }),
	},
}));

import { AuthTabs } from "@/components/auth/auth-tabs";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { authErrorMessage } from "@/lib/auth-error";
import { validateReturnUrl } from "@/lib/validate-return-url";

describe("validateReturnUrl", () => {
	it("allows safe internal paths", () => {
		expect(validateReturnUrl("/")).toBe("/");
		expect(validateReturnUrl("/overview")).toBe("/overview");
		expect(validateReturnUrl("/classes?tab=active")).toBe(
			"/classes?tab=active",
		);
	});

	it("rejects open-redirect attack vectors", () => {
		expect(validateReturnUrl("//evil.com")).toBe("/");
		expect(validateReturnUrl("/\\evil.com")).toBe("/");
		expect(validateReturnUrl("https://evil.com")).toBe("/");
		expect(validateReturnUrl("javascript:alert(1)")).toBe("/");
		expect(validateReturnUrl("/\t/evil.com")).toBe("/");
		expect(validateReturnUrl(null)).toBe("/");
		expect(validateReturnUrl("")).toBe("/");
	});
});

describe("AuthTabs", () => {
	it("renders only Đăng nhập and Đăng ký tabs in a 2-column grid with correct aria-selected", () => {
		const html = renderToStaticMarkup(
			<AuthTabs mode="signin" onChange={() => {}} />,
		);
		expect(html).toContain("grid-cols-2");
		expect(html).toMatch(
			/<button[^>]*id="tab-signin"[^>]*aria-selected="true"[^>]*>Đăng nhập<\/button>/,
		);
		expect(html).toMatch(
			/<button[^>]*id="tab-signup"[^>]*aria-selected="false"[^>]*>Đăng ký<\/button>/,
		);
		expect(html).not.toContain("tab-otp");
		expect(html).not.toContain("Mã email");
		expect(html).not.toContain("Mật khẩu");
	});
});

describe("authErrorMessage", () => {
	it("maps USER_ALREADY_EXISTS and USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL to Vietnamese guidance", () => {
		const expected =
			"Email này đã có tài khoản. Vui lòng chuyển sang tab Đăng nhập hoặc dùng Quên mật khẩu? để đặt mật khẩu.";
		expect(
			authErrorMessage(
				{
					code: "USER_ALREADY_EXISTS",
					message: "User already exists.",
				},
				"fallback",
			),
		).toBe(expected);
		expect(
			authErrorMessage(
				{
					code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
					message: "User already exists. Use another email.",
				},
				"fallback",
			),
		).toBe(expected);
	});

	it("maps INVALID_EMAIL_OR_PASSWORD to Vietnamese guidance", () => {
		expect(
			authErrorMessage(
				{
					code: "INVALID_EMAIL_OR_PASSWORD",
					message: "Invalid email or password",
				},
				"fallback",
			),
		).toBe(
			"Email hoặc mật khẩu chưa đúng. Nếu trước đây bạn đăng nhập bằng mã email, hãy chọn Quên mật khẩu? để đặt mật khẩu.",
		);
	});
});

describe("GoogleOAuthButton", () => {
	it("renders Google continue button", () => {
		const html = renderToStaticMarkup(<GoogleOAuthButton />);
		expect(html).toContain("Tiếp tục với Google");
	});
});

describe("SignInForm", () => {
	it("renders submit button and accessible inputs", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toContain('id="panel-signin"');
		expect(html).toContain('id="signin-email"');
		expect(html).toContain('id="signin-password"');
		expect(html).toMatch(/id="signin-email"[^>]*type="email"/);
		expect(html).toMatch(/id="signin-password"[^>]*type="password"/);
		const buttonMatch = html.match(/<button[^>]*>Đăng nhập<\/button>/);
		expect(buttonMatch?.[0]).toBeDefined();
		expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgrid\b[^"]*"/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgap-4\b[^"]*"/);
	});

	it("links to the forgot-password page next to the password field", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toMatch(
			/<a [^>]*href="\/forgot-password"[^>]*>Quên mật khẩu\?<\/a>/,
		);
	});
});

describe("SignUpForm", () => {
	it("renders submit button and accessible inputs", () => {
		const html = renderToStaticMarkup(<SignUpForm hidden={false} />);
		expect(html).toContain('id="panel-signup"');
		expect(html).toContain('id="signup-name"');
		expect(html).toContain('id="signup-email"');
		expect(html).toContain('id="signup-password"');
		const buttonMatch = html.match(/<button[^>]*>Tạo tài khoản<\/button>/);
		expect(buttonMatch?.[0]).toBeDefined();
		expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgrid\b[^"]*"/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgap-4\b[^"]*"/);
	});
});
