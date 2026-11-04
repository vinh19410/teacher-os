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
		signIn: { email: vi.fn() },
		forgetPassword: vi.fn(),
		resetPassword: vi.fn(),
		getSession: vi.fn().mockResolvedValue({ data: null }),
	},
}));

import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";

describe("Admin Auth Forms Layout Spacing (#568)", () => {
	it("SignInForm renders with grid gap-4", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toContain('id="panel-signin"');
		expect(html).toMatch(/<form[^>]*class="[^"]*grid gap-4[^"]*"/);
	});

	it("ForgotPasswordForm renders with grid gap-4 and without redundant mt-[22px]", () => {
		const html = renderToStaticMarkup(<ForgotPasswordForm />);
		expect(html).toContain('id="forgot-password-form"');
		expect(html).toMatch(/<form[^>]*class="[^"]*grid gap-4[^"]*"/);
		expect(html).not.toContain("mt-[22px]");
	});

	it("ResetPasswordForm renders with grid gap-4", () => {
		const html = renderToStaticMarkup(
			<ResetPasswordForm token="mock-token" linkError={false} />,
		);
		expect(html).toContain('id="reset-password-form"');
		expect(html).toMatch(/<form[^>]*class="[^"]*grid gap-4[^"]*"/);
	});
});
