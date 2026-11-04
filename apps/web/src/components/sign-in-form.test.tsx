import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/" }),
	Link: ({
		to,
		children,
		...rest
	}: {
		to: string;
		children?: React.ReactNode;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signIn: { email: vi.fn() },
		getSession: vi.fn(),
	},
}));

import SignInForm from "./sign-in-form";

describe("SignInForm (issue #165)", () => {
	it("renders the submit button enabled on a fresh form", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		const button = html.match(/<button[^>]*>Sign in<\/button>/);
		expect(button?.[0]).toBeDefined();
		// disabled:… utility classes are legal; the attribute is not
		expect(button?.[0]).not.toMatch(/\sdisabled=/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgrid\b[^"]*"/);
		expect(html).toMatch(/<form[^>]*class="[^"]*\bgap-4\b[^"]*"/);
	});

	it("keeps the sign-in panel markup intact with required accessible inputs (Issue #118)", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toContain('id="panel-signin"');
		expect(html).toContain('id="si-email"');
		expect(html).toContain('id="si-password"');
		expect(html).toMatch(/id="si-email"[^>]*required/);
		expect(html).toMatch(/id="si-email"[^>]*aria-required="true"/);
		expect(html).toMatch(/id="si-password"[^>]*required/);
		expect(html).toMatch(/id="si-password"[^>]*aria-required="true"/);
	});

	it("links Forgot password? to /forgot-password instead of the pilot notice", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toMatch(
			/<a href="\/forgot-password"[^>]*>Forgot password\?<\/a>/,
		);
		expect(html).not.toContain("isn't enabled");
	});
});
