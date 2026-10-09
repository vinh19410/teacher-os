// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const auth = vi.hoisted(() => ({
	signIn: { email: vi.fn(), social: vi.fn() },
	signUp: { email: vi.fn() },
	getSession: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: auth }));

import { Route as AuthRoute } from "@/routes/_auth/route";
import { Route as LoginRoute } from "@/routes/login";
import GoogleOAuthButton from "./google-oauth-button";
import SignInForm from "./sign-in-form";
import SignUpForm from "./sign-up-form";

const ORIGIN = "http://localhost:3000";
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
	assign = vi.fn();
	vi.stubGlobal("location", { ...window.location, origin: ORIGIN, assign });
	auth.signIn.email.mockResolvedValue({ error: null });
	auth.signUp.email.mockResolvedValue({ error: null });
	auth.signIn.social.mockResolvedValue({ error: null });
	auth.getSession.mockResolvedValue({ data: { user: { id: "u-1" } } });
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function type(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function signInWith(returnUrl: string | undefined) {
	routerState.search = { returnUrl };
	render(<SignInForm hidden={false} />);
	type("Email", "co.lan@example.com");
	type("Password", "password123");
	fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
	await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
	return assign.mock.calls[0][0] as string;
}

async function signUpWith(returnUrl: string | undefined) {
	routerState.search = { returnUrl };
	render(<SignUpForm hidden={false} />);
	type("Name", "Cô Lan");
	type("Email", "co.lan@example.com");
	type("Password", "password123");
	fireEvent.click(screen.getByRole("button", { name: "Create account" }));
	await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
	return assign.mock.calls[0][0] as string;
}

async function googleWith(returnUrl: string | undefined) {
	routerState.search = { returnUrl };
	render(<GoogleOAuthButton />);
	fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
	await waitFor(() => expect(auth.signIn.social).toHaveBeenCalledTimes(1));
	return auth.signIn.social.mock.calls[0][0].callbackURL as string;
}

const SAFE = "/classes/cl-1?tab=sessions";
const HOSTILE = [
	"https://evil.example/phish",
	"//evil.example",
	"/%2F%2Fevil.example",
];

describe("sign-in returns to where the teacher was", () => {
	it("lands on a same-site return URL", async () => {
		expect(await signInWith(SAFE)).toBe(SAFE);
	});

	it.each(HOSTILE)("refuses the off-site return URL %s", async (url) => {
		expect(await signInWith(url)).toBe("/dashboard");
	});
});

describe("sign-up returns to where the teacher was", () => {
	it("lands on a same-site return URL", async () => {
		expect(await signUpWith(SAFE)).toBe(SAFE);
	});

	it.each(HOSTILE)("refuses the off-site return URL %s", async (url) => {
		expect(await signUpWith(url)).toBe("/dashboard");
	});
});

describe("Google sign-in returns to where the teacher was", () => {
	it("sends Google back to this app at the return URL", async () => {
		expect(await googleWith(SAFE)).toBe(`${ORIGIN}${SAFE}`);
	});

	it.each(HOSTILE)("never sends Google back off-site for %s", async (url) => {
		expect(await googleWith(url)).toBe(`${ORIGIN}/dashboard`);
	});
});

describe("login URL", () => {
	const validateSearch = (
		LoginRoute as unknown as {
			validateSearch: (s: Record<string, unknown>) => { returnUrl?: string };
		}
	).validateSearch;

	it("passes the raw returnUrl through for the forms to validate", () => {
		expect(
			validateSearch({ returnUrl: "/schedule?week=2026-10-12" }).returnUrl,
		).toBe("/schedule?week=2026-10-12");
		expect(validateSearch({ returnUrl: 42 }).returnUrl).toBeUndefined();
	});
});

describe("signed-out visit to a workspace page", () => {
	const beforeLoad = (
		AuthRoute as unknown as {
			beforeLoad: (ctx: { location: unknown }) => Promise<unknown>;
		}
	).beforeLoad;

	it("goes to login carrying the full current path as returnUrl", async () => {
		auth.getSession.mockResolvedValue({ data: null });
		await expect(
			beforeLoad({
				location: {
					href: "/schedule?week=2026-10-12#today",
					pathname: "/schedule",
					search: { week: "2026-10-12" },
				},
			}),
		).rejects.toEqual({
			to: "/login",
			search: { returnUrl: "/schedule?week=2026-10-12#today" },
		});
	});

	it("lets a signed-in teacher through with the session", async () => {
		const session = { data: { user: { id: "u-1" } } };
		auth.getSession.mockResolvedValue(session);
		await expect(
			beforeLoad({ location: { href: "/dashboard" } }),
		).resolves.toEqual({ session });
	});
});
