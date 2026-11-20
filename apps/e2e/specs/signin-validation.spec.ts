import { expect, type Route, test } from "@playwright/test";
import { WEB_ORIGIN } from "./origins";

/**
 * Sign-in validation semantics (issue #114): empty fields must say
 * "required" (not sign-up format/length copy), and a short password must NOT
 * be client-blocked on sign-in — the client sends the request and the server
 * (better-auth) verifies credentials. The sign-up min-8 rule stays (case c).
 *
 * Each case is its own test() with a fresh page: after a failed submit,
 * TanStack Form keeps canSubmit=false until the next submit event (onSubmit
 * validators only run on submit), so a follow-up submit on the same page
 * would be silently dropped.
 *
 * Cross-origin fidelity (web :8001 → api :8000): every fulfilled route needs
 * CORS headers and an OPTIONS preflight answer — same contract as
 * auth-fail-loudly.spec.ts.
 */

const CORS_BASE = {
	"access-control-allow-origin": WEB_ORIGIN,
	"access-control-allow-credentials": "true",
};

function fulfillJson(route: Route, status: number, body: string) {
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
		status,
		headers: { "content-type": "application/json", ...CORS_BASE },
		body,
	});
}

async function openSignInTab(page: import("@playwright/test").Page) {
	await page.goto("/login");
	await page.getByRole("tab", { name: "Đăng nhập" }).click();
	await expect(page.locator("#panel-signin")).toBeVisible();
}

test("empty submit reports required fields, not sign-up copy (#114)", async ({
	page,
}) => {
	await openSignInTab(page);
	await page.locator("#panel-signin button[type='submit']").click();

	await expect(page.locator("#signin-email-error")).toHaveText(
		"Vui lòng nhập email",
	);
	await expect(page.locator("#signin-password-error")).toHaveText(
		"Vui lòng nhập mật khẩu",
	);
	await expect(page.locator("#signin-password-error")).not.toContainText(
		"8 ký tự",
	);
});

test("short password is not client-blocked; client sends the sign-in request with a trimmed email (#114)", async ({
	page,
}) => {
	let capturedPayload: { email?: string; password?: string } | null = null;
	await page.route("**/api/auth/sign-in/email", async (route) => {
		capturedPayload = route.request().postDataJSON();
		// 401 with a body lacking `message` so the toast falls back to the
		// generic copy — the assertion is toast presence, never its text.
		await fulfillJson(route, 401, '{"code":"INVALID_EMAIL_OR_PASSWORD"}');
	});

	await openSignInTab(page);
	await page.locator("#signin-email").fill("  signin-validation@test.local ");
	await page.locator("#signin-password").fill("abc");
	await page.locator("#panel-signin button[type='submit']").click();

	await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
	expect(capturedPayload).toEqual({
		email: "signin-validation@test.local",
		password: "abc",
	});
});

test("sign-up still enforces min 8 characters client-side (regression guard)", async ({
	page,
}) => {
	await page.goto("/login?tab=signup");
	await page.locator("#signup-name").fill("Validation Guard");
	await page.locator("#signup-email").fill("signup-guard@test.local");
	await page.locator("#signup-password").fill("abc");
	await page.locator("#panel-signup button[type='submit']").click();

	await expect(page.locator("#signup-password-error")).toHaveText(
		"Mật khẩu phải có ít nhất 8 ký tự",
	);
	await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});
