import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * Login smoke (issue #59): proves the riskiest integration —
 * a Secure/SameSite=None better-auth session cookie flowing cross-origin
 * localhost:8001 (lms) → localhost:8000 (api) — before feature specs run.
 */
test("sign-up dẫn tới dashboard với org bootstrap", async ({ page }) => {
	await signUpViaApi(page);
	await expect(page).toHaveURL(/\/teacher\/dashboard/);
	// Sidebar nav visible => GET /api/kernel succeeded => org bootstrapped.
	await expect(page.getByText("Lớp học").first()).toBeVisible();
	await expect(page.getByText("Lịch dạy").first()).toBeVisible();
});
