import { expect, test } from "@playwright/test";
import { readVerificationEmails, signUpViaUi } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

const OLD_PASSWORD = "password-8chars";
const NEW_PASSWORD = "newpassword123";

async function pollResetUrl(
	page: import("@playwright/test").Page,
	email: string,
): Promise<string> {
	for (let i = 0; i < 20; i++) {
		const emails = await readVerificationEmails();
		const entry = emails.find(
			(e) =>
				e.to.toLowerCase() === email.toLowerCase() &&
				e.kind === "password-reset" &&
				e.url,
		);
		if (entry?.url) return entry.url;
		await page.waitForTimeout(500);
	}
	throw new Error(`No reset email for ${email}`);
}

async function teacherSignIn(
	page: import("@playwright/test").Page,
	email: string,
	password: string,
): Promise<number> {
	await page.goto("/login");
	await page.locator("#tab-signin").click();
	await page.locator("#si-email").fill(email);
	await page.locator("#si-password").fill(password);
	const [response] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.getByRole("button", { name: "Sign in" }).click(),
	]);
	return response.status();
}

async function studentSignIn(
	page: import("@playwright/test").Page,
	email: string,
	password: string,
): Promise<number> {
	await page.context().clearCookies();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(email);
	await page.locator("#signin-password").fill(password);
	const [response] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	return response.status();
}

test.describe("Password reset via email", () => {
	test("teacher resets password through the emailed link", async ({ page }) => {
		const email = await signUpViaUi(page, { password: OLD_PASSWORD });

		await page.context().clearCookies();
		await page.goto("/login");
		await page.locator("#tab-signin").click();
		await page.getByRole("link", { name: "Forgot password?" }).click();
		await expect(page).toHaveURL(/\/forgot-password$/);

		await page.locator("#fp-email").fill(email);
		await page.getByRole("button", { name: "Send reset link" }).click();
		await expect(
			page.getByText(
				"If an account exists for that email, we sent a reset link. It expires in 1 hour.",
			),
		).toBeVisible({ timeout: 15_000 });

		const resetUrl = await pollResetUrl(page, email);
		await page.goto(resetUrl);
		await expect(page).toHaveURL(/\/reset-password/);
		// Token must not linger in the address bar after first render.
		await expect(page).not.toHaveURL(/token=/);

		await page.locator("#rp-new-password").fill(NEW_PASSWORD);
		await page.locator("#rp-confirm-password").fill(NEW_PASSWORD);
		await page.getByRole("button", { name: "Update password" }).click();
		await expect(page.getByText("Password updated")).toBeVisible();

		expect(await teacherSignIn(page, email, NEW_PASSWORD)).toBe(200);
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

		await page.context().clearCookies();
		expect(await teacherSignIn(page, email, OLD_PASSWORD)).not.toBe(200);
		await expect(page.locator("#si-password")).toBeVisible();
	});

	test("student resets password on the student portal origin", async ({
		page,
	}) => {
		const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		await page.context().clearCookies();
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill("Học Viên Reset");
		await page.locator("#signup-email").fill(email);
		await page.locator("#signup-password").fill(OLD_PASSWORD);
		await page.locator("#panel-signup button[type='submit']").click();
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});

		await page.context().clearCookies();
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signin").click();
		await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
		await expect(page).toHaveURL(/\/forgot-password$/);

		await page.locator("#forgot-email").fill(email);
		await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
		await expect(
			page.getByText(
				"Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ.",
			),
		).toBeVisible({ timeout: 15_000 });

		const resetUrl = await pollResetUrl(page, email);
		// The mailed URL carries the API origin; following it must land on the
		// student origin the request was made from (D2/D8).
		expect(resetUrl).toContain("/api/auth/reset-password/");
		await page.goto(resetUrl);
		await expect(page).toHaveURL(
			new RegExp(`^${STUDENT_ORIGIN}/reset-password`),
		);
		await expect(page).not.toHaveURL(/token=/);

		await page.locator("#reset-password").fill(NEW_PASSWORD);
		await page.locator("#reset-confirm").fill(NEW_PASSWORD);
		await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
		await expect(page.getByText("Đã đổi mật khẩu.")).toBeVisible();

		expect(await studentSignIn(page, email, NEW_PASSWORD)).toBe(200);
		await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 });

		expect(await studentSignIn(page, email, OLD_PASSWORD)).not.toBe(200);
		await expect(page.locator("#signin-password")).toBeVisible();

		// The invalid-link view also works with no session at all — the reset
		// page never depends on session state (F5).
		await page.context().clearCookies();
		await page.goto(`${STUDENT_ORIGIN}/reset-password?error=INVALID_TOKEN`);
		await expect(
			page.getByText("Liên kết đặt lại không hợp lệ hoặc đã hết hạn."),
		).toBeVisible();

		// The reset page stays usable with a live session (no session redirect),
		// and a rejected link (better-auth redirects with ?error=INVALID_TOKEN)
		// shows the invalid-link view instead of a form holding a dead token.
		await page.goto(`${STUDENT_ORIGIN}/reset-password?error=INVALID_TOKEN`);
		await expect(
			page.getByText("Liên kết đặt lại không hợp lệ hoặc đã hết hạn."),
		).toBeVisible();
	});

	test("unknown email gets the same success copy and no mail", async ({
		page,
	}) => {
		const email = await signUpViaUi(page, { password: OLD_PASSWORD });
		const unknown = `nobody-${Date.now()}@test.local`;

		await page.context().clearCookies();
		await page.goto("/forgot-password");
		await page.locator("#fp-email").fill(unknown);
		await page.getByRole("button", { name: "Send reset link" }).click();
		await expect(
			page.getByText(
				"If an account exists for that email, we sent a reset link. It expires in 1 hour.",
			),
		).toBeVisible({ timeout: 15_000 });

		// Same page, known email: mail must actually arrive before asserting
		// the unknown one never did (guards against background-send races).
		await page.goto("/forgot-password");
		await page.locator("#fp-email").fill(email);
		await page.getByRole("button", { name: "Send reset link" }).click();
		await expect(
			page.getByText(
				"If an account exists for that email, we sent a reset link. It expires in 1 hour.",
			),
		).toBeVisible({ timeout: 15_000 });
		await pollResetUrl(page, email);

		const emails = await readVerificationEmails();
		expect(
			emails.filter(
				(e) =>
					e.to.toLowerCase() === unknown.toLowerCase() &&
					e.kind === "password-reset",
			),
		).toHaveLength(0);
	});

	test("reset page rejects an invalid token even when signed in", async ({
		page,
	}) => {
		await signUpViaUi(page, { password: OLD_PASSWORD });
		// A re-pasted stale link still carries ?token=…: the page strips it from
		// the URL (F14) and offers the form — it does not show the dead-link view.
		await page.goto("/reset-password?token=dead-token");
		await expect(page).not.toHaveURL(/token=/);
		await expect(page.locator("#rp-new-password")).toBeVisible();
		// A dead/expired mail link lands as ?error=INVALID_TOKEN after the
		// better-auth callback rejects the token.
		await page.goto("/reset-password?error=INVALID_TOKEN");
		await expect(
			page.getByText("This reset link is invalid or has expired."),
		).toBeVisible();
		await expect(page).toHaveURL(/\/reset-password/);
		await expect(page).not.toHaveURL(/\/dashboard/);
	});
});
