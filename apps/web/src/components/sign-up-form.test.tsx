import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ returnUrl: "/" }),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signUp: { email: vi.fn() },
		getSession: vi.fn(),
	},
}));

import SignUpForm from "./sign-up-form";

describe("SignUpForm (issue #165)", () => {
	it("renders the submit button enabled on a fresh form", () => {
		const html = renderToStaticMarkup(<SignUpForm hidden={false} />);
		const button = html.match(/<button[^>]*>Create account<\/button>/);
		expect(button?.[0]).toBeDefined();
		// disabled:… utility classes are legal; the attribute is not
		expect(button?.[0]).not.toMatch(/\sdisabled=/);
	});

	it("keeps the sign-up panel markup intact", () => {
		const html = renderToStaticMarkup(<SignUpForm hidden={false} />);
		expect(html).toContain('id="panel-signup"');
		expect(html).toContain('id="su-name"');
		expect(html).toContain('id="su-email"');
		expect(html).toContain('id="su-password"');
		expect(html).toMatch(/<form[^>]*class="[^"]*grid gap-4[^"]*"/);
	});
});
