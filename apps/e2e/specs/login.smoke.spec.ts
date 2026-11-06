import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * Login smoke (issue #59, plan phase 2): proves the riskiest integration —
 * a Secure/SameSite=None better-auth session cookie flowing cross-origin
 * localhost:8001 (web) → localhost:8000 (api) — before the full
 * class-operations spec runs.
 */
test("sign-up dẫn tới dashboard với org bootstrap", async ({ page }) => {
	await signUpViaApi(page);
	// Sidebar nav visible => GET /api/kernel succeeded => org bootstrapped.
	await expect(page.getByText("Lớp học").first()).toBeVisible();
	await expect(page.getByText("Lịch dạy").first()).toBeVisible();
});
