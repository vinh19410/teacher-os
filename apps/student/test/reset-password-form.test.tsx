import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
		resetPassword: vi.fn(),
	},
}));

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

const INVALID_LINK = "Liên kết đặt lại không hợp lệ hoặc đã hết hạn.";

describe("ResetPasswordForm", () => {
	it("shows the invalid-link view when there is no token", () => {
		const html = renderToStaticMarkup(
			<ResetPasswordForm token={null} linkError={false} />,
		);
		expect(html).toContain(INVALID_LINK);
		expect(html).toMatch(/<a [^>]*href="\/forgot-password"/);
		expect(html).not.toContain("<form");
	});

	it("shows the invalid-link view when the link carried an error", () => {
		const html = renderToStaticMarkup(
			<ResetPasswordForm token="abc" linkError />,
		);
		expect(html).toContain(INVALID_LINK);
		expect(html).not.toContain("<form");
	});

	it("renders the new-password form when a token is present", () => {
		const html = renderToStaticMarkup(
			<ResetPasswordForm token="abc" linkError={false} />,
		);
		expect(html).not.toContain(INVALID_LINK);
		expect(html).toContain('id="reset-password"');
		expect(html).toContain('id="reset-confirm"');
		expect(html).toMatch(
			/id="reset-password"[^>]*autoComplete="new-password"/i,
		);
		expect(html).toMatch(/id="reset-confirm"[^>]*autoComplete="new-password"/i);
		const buttonMatch = html.match(/<button[^>]*>Đổi mật khẩu<\/button>/);
		expect(buttonMatch?.[0]).toBeDefined();
		expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=/);
	});

	it("never renders the token into the markup", () => {
		const html = renderToStaticMarkup(
			<ResetPasswordForm token="secret-token-value" linkError={false} />,
		);
		expect(html).not.toContain("secret-token-value");
	});
});

describe("reset page routes", () => {
	const read = (file: string) =>
		readFileSync(resolve(import.meta.dirname, "../src/routes", file), "utf-8");

	it.each(["forgot-password.tsx", "reset-password.tsx"])(
		"%s does not depend on the session",
		(file) => {
			const source = read(file);
			expect(source).not.toContain("useSession");
			expect(source).not.toContain("Loader");
		},
	);

	it("reset-password.tsx strips the token from the address bar", () => {
		const source = read("reset-password.tsx");
		expect(source).toMatch(/search:\s*\{\}/);
		expect(source).toContain("replace: true");
	});
});
