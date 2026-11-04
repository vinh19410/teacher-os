import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		requestPasswordReset: vi.fn(),
	},
}));

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

describe("ForgotPasswordForm", () => {
	it("renders an accessible email field and an enabled Vietnamese submit button", () => {
		const html = renderToStaticMarkup(<ForgotPasswordForm />);
		expect(html).toContain('id="forgot-email"');
		expect(html).toMatch(/id="forgot-email"[^>]*type="email"/);
		expect(html).toContain("Email");
		const buttonMatch = html.match(
			/<button[^>]*>Gửi liên kết đặt lại<\/button>/,
		);
		expect(buttonMatch?.[0]).toBeDefined();
		expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=/);
		expect(html).toMatch(/<form[^>]*class="[^"]*grid gap-4[^"]*"/);
		expect(html).not.toContain("mt-[22px]");
	});

	it("does not show the success notice before submitting", () => {
		const html = renderToStaticMarkup(<ForgotPasswordForm />);
		expect(html).not.toContain("Nếu email này có tài khoản");
		expect(html).not.toContain("Gửi lại sau");
	});

	it("contains no English copy from the teacher flow", () => {
		const html = renderToStaticMarkup(<ForgotPasswordForm />);
		expect(html).not.toContain("If an account exists");
		expect(html).not.toContain("Resend in");
	});
});
