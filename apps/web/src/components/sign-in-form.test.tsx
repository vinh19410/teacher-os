import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/" }),
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
	});

	it("keeps the sign-in panel markup intact", () => {
		const html = renderToStaticMarkup(<SignInForm hidden={false} />);
		expect(html).toContain('id="panel-signin"');
		expect(html).toContain('id="si-email"');
		expect(html).toContain('id="si-password"');
	});
});
