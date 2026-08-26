import { expect, type Page } from "@playwright/test";

/** Sign up through the real UI; a fresh context lands on the default
 * "Create account" tab (apps/web/src/routes/login.tsx), and the first
 * authenticated GET /api/kernel bootstraps the org server-side. */
export async function signUpViaUi(page: Page, name = "E2E Teacher") {
	await page.goto("/login");
	await page.locator("#su-name").fill(name);
	await page
		.locator("#su-email")
		.fill(
			`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
		);
	await page.locator("#su-password").fill("password-8chars");
	await page.getByRole("button", { name: "Create account" }).click();
	// Cold vite dev on CI can make the sign-up + bootstrap round-trip slow;
	// the default 5s expect timeout is too tight for this flow-critical wait.
	await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Navigate to a class's "Lịch học" tab — it renders the "Đã học"/"Sắp tới"
 * badges; the "Giáo trình" tab of $classId.tsx also renders "Đã dạy"/
 * "Đang học"/"Sắp tới" badges per lesson. The /schedule page itself never
 * shows them (only its opened lesson modal can show "Sắp tới"). Text
 * counts must scope to "Lịch học" while on it. */
export async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className).click();
	await page.getByRole("button", { name: "Lịch học", exact: true }).click();
}
