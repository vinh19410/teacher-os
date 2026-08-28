import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Auth failures must be loud (issue #125): the QC P0 was invisible because the
 * forms awaited the auth client with only onSuccess/onError + finally — a
 * rejected fetch fired neither callback and the form "reset" with no toast.
 * Cross-origin detail: the app fetches http://localhost:8000 from
 * http://localhost:8001, so every fulfilled route MUST carry CORS headers AND
 * answer the OPTIONS preflight with allow-headers/allow-methods — a real
 * browser enforces both (Playwright is lenient about fabricated responses, so
 * the extra fidelity is for future readers, not for this suite alone).
 */

const CORS_BASE = {
	"access-control-allow-origin": "http://localhost:8001",
	"access-control-allow-credentials": "true",
};

const SIGNUP_FAILED =
	"Couldn't create your account. Check your connection and try again.";
const SIGNIN_FAILED =
	"Couldn't sign you in. Check your email and password, then try again.";
const SIGNUP_NO_SESSION =
	"Your account is ready, but we couldn't start your session. Please sign in.";

/** Fulfill an intercepted auth POST with a JSON body, handling the CORS
 * preflight the browser sends first. */
function fulfillJson(route: Route, body: string) {
	if (route.request().method() === "OPTIONS") {
		return route.fulfill({
			status: 204,
			headers: {
				...CORS_BASE,
				"access-control-allow-headers": "content-type",
				"access-control-allow-methods": "POST",
			},
		});
	}
	return route.fulfill({
		status: 200,
		headers: { "content-type": "application/json", ...CORS_BASE },
		body,
	});
}

async function fillSignUp(page: Page) {
	await page.goto("/login");
	await page.locator("#su-name").fill("Loud Failure");
	await page.locator("#su-email").fill("auth-fail-loudly@test.local");
	await page.locator("#su-password").fill("password-8chars");
}

async function fillSignIn(page: Page) {
	await page.goto("/login");
	await page.getByRole("tab", { name: "Sign in" }).click();
	await page.locator("#si-email").fill("auth-fail-loudly@test.local");
	await page.locator("#si-password").fill("password-8chars");
}

test("sign-up network failure shows an error toast and stays on /login", async ({
	page,
}) => {
	await page.route("**/api/auth/sign-up/email", (route) => route.abort());
	await fillSignUp(page);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNUP_FAILED }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
});

test("sign-in network failure shows an error toast and stays on /login", async ({
	page,
}) => {
	await page.route("**/api/auth/sign-in/email", (route) => route.abort());
	await fillSignIn(page);
	// Scoped: the page footer has a second "Sign in" button (tab switcher).
	await page
		.locator("#panel-signin")
		.getByRole("button", { name: "Sign in" })
		.click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNIN_FAILED }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
});

test("sign-up 2xx without a session shows the session toast, no success banner", async ({
	page,
}) => {
	// The auth call "succeeds" but the cookie is lost (the QC #125 shape):
	// get-session must reveal it and the form must say so — not redirect into
	// a /dashboard bounce, not claim the signup failed.
	const signupBody = JSON.stringify({
		token: "fake-token",
		user: {
			id: "smoke-user",
			name: "Loud Failure",
			email: "auth-fail-loudly@test.local",
			emailVerified: false,
			image: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	});
	await page.route("**/api/auth/sign-up/email", (route) =>
		fulfillJson(route, signupBody),
	);
	await page.route("**/api/auth/get-session", (route) =>
		fulfillJson(route, JSON.stringify(null)),
	);
	await fillSignUp(page);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNUP_NO_SESSION }),
	).toBeVisible();
	// The green "Account created" success notice must never show on a failure.
	await expect(page.getByText("Account created")).toHaveCount(0);
	await expect(page).toHaveURL(/\/login/);
});
