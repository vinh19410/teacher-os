import { expect, test } from "@playwright/test";
import { LMS_ORIGIN } from "./origins";

// gap-4 in Tailwind is 1rem. With base font-size 16px in globals.css, computed rowGap is 16px.
const EXPECTED_ROW_GAPS = ["16px"];

test.describe("Auth Form Field Spacing (#568)", () => {
	test("Unified LMS auth forms: rowGap is 16px (1rem) and hidden tabs stay display:none", async ({
		page,
	}) => {
		// 1. Unified login page (defaults to sign-in tab)
		await page.goto(`${LMS_ORIGIN}/login`);

		const signinForm = page.locator("#panel-signin");
		const signupForm = page.locator("#panel-signup");
		await expect(signinForm).toBeVisible();
		const signinGap = await signinForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(signinGap);

		// Inactive sign-up panel must be display: none
		await expect(signupForm).toBeHidden();
		const signupDisplay = await signupForm.evaluate(
			(el) => getComputedStyle(el).display,
		);
		expect(signupDisplay).toBe("none");

		// Switch to Đăng ký tab
		const signupTab = page.getByRole("tab", { name: "Đăng ký" });
		await expect(signupTab).toBeVisible();
		await signupTab.click();
		await expect(signupForm).toBeVisible();
		const signupGap = await signupForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(signupGap);

		// Inactive sign-in panel must be display: none
		await expect(signinForm).toBeHidden();
		const signinDisplay = await signinForm.evaluate(
			(el) => getComputedStyle(el).display,
		);
		expect(signinDisplay).toBe("none");

		// Switch back to Đăng nhập tab
		const signinTab = page.getByRole("tab", { name: "Đăng nhập" });
		await expect(signinTab).toBeVisible();
		await signinTab.click();
		await expect(signinForm).toBeVisible();
		await expect(signupForm).toBeHidden();

		// 2. Unified forgot-password page
		await page.goto(`${LMS_ORIGIN}/forgot-password`);
		const forgotForm = page.locator("#forgot-password-form");
		await expect(forgotForm).toBeVisible();
		const forgotGap = await forgotForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(forgotGap);

		// 3. Unified reset-password page
		await page.goto(`${LMS_ORIGIN}/reset-password?token=valid-test-token`);
		const resetForm = page.locator("#reset-password-form");
		await expect(resetForm).toBeVisible();
		const resetGap = await resetForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(resetGap);
	});
});
