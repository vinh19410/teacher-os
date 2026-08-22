import { expect, test } from "@playwright/test";

/**
 * Login smoke (issue #59, plan phase 2): proves the riskiest integration —
 * a Secure/SameSite=None better-auth session cookie flowing cross-origin
 * localhost:8001 (web) → localhost:8000 (api) — before the full
 * class-operations spec is written.
 */
test("sign-up dẫn tới dashboard với org bootstrap", async ({ page }) => {
	await page.goto("/login");
	// A fresh context lands on the default "Create account" tab
	// (apps/web/src/routes/login.tsx) — deterministic, no tab click needed.
	await page.locator("#su-name").fill("E2E Teacher");
	await page
		.locator("#su-email")
		.fill(
			`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
		);
	await page.locator("#su-password").fill("password-8chars");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/dashboard/);
	// Sidebar nav visible => GET /api/kernel succeeded => org bootstrapped.
	await expect(page.getByText("Lớp học").first()).toBeVisible();
	await expect(page.getByText("Lịch dạy").first()).toBeVisible();
});
