import { expect, type Page, type Route, test } from "@playwright/test";
import { LMS_ORIGIN } from "./origins";

/**
 * Auth failures must be loud: a rejected fetch or a 2xx sign-up without a
 * session cookie must surface an explicit error toast and stay on `/login`
 * instead of silently resetting or redirecting.
 */

const CORS_BASE = {
	"access-control-allow-origin": LMS_ORIGIN,
	"access-control-allow-credentials": "true",
};

const SIGNUP_FAILED =
	"Không thể tạo tài khoản. Vui lòng kiểm tra kết nối và thử lại.";
const SIGNIN_FAILED =
	"Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu rồi thử lại.";
const SIGNUP_NO_SESSION =
	"Tài khoản đã tạo nhưng chưa thể bắt đầu phiên đăng nhập. Vui lòng đăng nhập lại.";
const SIGNIN_NO_SESSION =
	"Không thể khởi tạo phiên đăng nhập. Vui lòng thử lại.";

/** Fulfill an intercepted auth request with a JSON body, handling CORS preflight. */
function fulfillJson(route: Route, body: string) {
	if (route.request().method() === "OPTIONS") {
		return route.fulfill({
			status: 204,
			headers: {
				...CORS_BASE,
				"access-control-allow-headers": "content-type",
				"access-control-allow-methods": "GET, POST",
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
	await page.goto("/login?tab=signup");
	await page.locator("#signup-name").fill("Loud Failure");
	await page.locator("#signup-email").fill("auth-fail-loudly@test.local");
	await page.locator("#signup-password").fill("password-8chars");
}

async function fillSignIn(page: Page) {
	await page.goto("/login");
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill("auth-fail-loudly@test.local");
	await page.locator("#signin-password").fill("password-8chars");
}

test("sign-up network failure shows an error toast and stays on /login", async ({
	page,
}) => {
	await page.route("**/api/auth/sign-up/email", (route) => route.abort());
	await fillSignUp(page);
	await page.locator("#panel-signup button[type='submit']").click();
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
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNIN_FAILED }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
});

test("sign-up 2xx without a session shows the session toast, no success banner", async ({
	page,
}) => {
	// Better Auth returns user.role in the 200 payload, yet a blocked/missing
	// cross-subdomain cookie makes get-session return null. Layer 2 must still
	// run unconditionally and surface the session error toast instead of
	// redirecting or showing the success notice.
	const signupBody = JSON.stringify({
		token: "fake-token",
		user: {
			id: "smoke-user",
			name: "Loud Failure",
			email: "auth-fail-loudly@test.local",
			role: "student",
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
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNUP_NO_SESSION }),
	).toBeVisible();
	// The green "Tài khoản đã tạo" success notice must never show on a failure.
	await expect(page.getByText("Tài khoản đã tạo")).toHaveCount(0);
	await expect(page).toHaveURL(/\/login/);
});

test("sign-in 2xx without a session shows the session toast, no success banner", async ({
	page,
}) => {
	const signinBody = JSON.stringify({
		token: "fake-token",
		user: {
			id: "smoke-teacher",
			name: "Loud Teacher",
			email: "auth-fail-loudly@test.local",
			role: "teacher",
			emailVerified: true,
			image: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	});
	await page.route("**/api/auth/sign-in/email", (route) =>
		fulfillJson(route, signinBody),
	);
	await page.route("**/api/auth/get-session", (route) =>
		fulfillJson(route, JSON.stringify(null)),
	);
	await fillSignIn(page);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(
		page.locator("[data-sonner-toast]").filter({ hasText: SIGNIN_NO_SESSION }),
	).toBeVisible();
	await expect(page.getByText("Đăng nhập thành công")).toHaveCount(0);
	await expect(page).toHaveURL(/\/login/);
});
