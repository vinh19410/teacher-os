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
	await expect(page).toHaveURL(/\/dashboard/);
}

/** Navigate to a class's "Lịch học" tab — the only page rendering the
 * "Đã học"/"Sắp tới" badges ($classId.tsx); /schedule never shows them. */
export async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className).click();
	await page.getByRole("button", { name: "Lịch học", exact: true }).click();
}
