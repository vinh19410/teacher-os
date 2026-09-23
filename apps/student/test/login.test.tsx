import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/" }),
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
	it("renders both tabs with correct aria-selected", () => {
		const html = renderToStaticMarkup(
			<AuthTabs mode="signin" onChange={() => {}} />,
		);
		expect(html).toContain('id="tab-signin"');
		expect(html).toContain('aria-selected="true"');
		expect(html).toContain("Đăng nhập");
		expect(html).toContain('id="tab-signup"');
		expect(html).toContain('aria-selected="false"');
		expect(html).toContain("Đăng ký");
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
	});
});
