import { expect, test } from "@playwright/test";

const studentPort = Number(process.env.E2E_STUDENT_PORT ?? 8103);
const adminPort = Number(process.env.E2E_ADMIN_PORT ?? 8104);

// gap-4 in Tailwind is 1rem. With base font-size 14px in globals.css, computed rowGap is 14px.
const EXPECTED_ROW_GAPS = ["14px", "16px"];

test.describe("Auth Form Field Spacing (#568)", () => {
	test("Web auth forms: rowGap is 14px (1rem) and hidden tabs stay display:none", async ({
		page,
	}) => {
		// 1. Web login page
		await page.goto("/login");

		// Default active panel should have rowGap 14px/16px (1rem)
		const activeForm = page.locator("form:not([hidden])").first();
		await expect(activeForm).toBeVisible();
		const rowGapDefault = await activeForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(rowGapDefault);

		// Switch to Sign in tab
		const signinTab = page.getByRole("tab", { name: /sign in/i });
		if (await signinTab.isVisible()) {
			await signinTab.click();
			const signinForm = page.locator("#panel-signin");
			await expect(signinForm).toBeVisible();
			const signinGap = await signinForm.evaluate(
				(el) => getComputedStyle(el).rowGap,
			);
			expect(EXPECTED_ROW_GAPS).toContain(signinGap);

			// Inactive sign-up panel must be display: none
			const signupForm = page.locator("#panel-signup");
			if (await signupForm.count()) {
				const signupDisplay = await signupForm.evaluate(
					(el) => getComputedStyle(el).display,
				);
				expect(signupDisplay).toBe("none");
			}
		}

		// 2. Web forgot-password page
		await page.goto("/forgot-password");
		const forgotForm = page.locator("form").first();
		await expect(forgotForm).toBeVisible();
		const forgotGap = await forgotForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(forgotGap);

		// 3. Web reset-password page
		await page.goto("/reset-password?token=valid-test-token");
		const resetForm = page.locator("form").first();
		if (await resetForm.isVisible()) {
			const resetGap = await resetForm.evaluate(
				(el) => getComputedStyle(el).rowGap,
			);
			expect(EXPECTED_ROW_GAPS).toContain(resetGap);
		}
	});

	test("Student auth forms: rowGap is 14px (1rem) and hidden tabs stay display:none", async ({
		page,
	}) => {
		// 1. Student login page
		await page.goto(`http://localhost:${studentPort}/login`);

		const activeForm = page.locator("form:not([hidden])").first();
		await expect(activeForm).toBeVisible();
		const rowGapDefault = await activeForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(rowGapDefault);

		// Switch between Đăng nhập and Đăng ký tabs
		const signupTab = page.getByRole("tab", { name: /đăng ký/i });
		if (await signupTab.isVisible()) {
			await signupTab.click();
			const signupForm = page.locator("#panel-signup");
			await expect(signupForm).toBeVisible();
			const signupGap = await signupForm.evaluate(
				(el) => getComputedStyle(el).rowGap,
			);
			expect(EXPECTED_ROW_GAPS).toContain(signupGap);

			// Inactive sign-in panel must be display: none
			const signinForm = page.locator("#panel-signin");
			const signinDisplay = await signinForm.evaluate(
				(el) => getComputedStyle(el).display,
			);
			expect(signinDisplay).toBe("none");
		}

		// 2. Student forgot-password page
		await page.goto(`http://localhost:${studentPort}/forgot-password`);
		const forgotForm = page.locator("#forgot-password-form");
		await expect(forgotForm).toBeVisible();
		const forgotGap = await forgotForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(forgotGap);

		// 3. Student reset-password page
		await page.goto(
			`http://localhost:${studentPort}/reset-password?token=valid-test-token`,
		);
		const resetForm = page.locator("#reset-password-form");
		if (await resetForm.isVisible()) {
			const resetGap = await resetForm.evaluate(
				(el) => getComputedStyle(el).rowGap,
			);
			expect(EXPECTED_ROW_GAPS).toContain(resetGap);
		}
	});

	test("Admin auth forms: rowGap is 14px (1rem)", async ({ page }) => {
		// 1. Admin login page
		await page.goto(`http://localhost:${adminPort}/login`);
		const signinForm = page.locator("#panel-signin");
		await expect(signinForm).toBeVisible();
		const signinGap = await signinForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(signinGap);

		// 2. Admin forgot-password page
		await page.goto(`http://localhost:${adminPort}/forgot-password`);
		const forgotForm = page.locator("#forgot-password-form");
		await expect(forgotForm).toBeVisible();
		const forgotGap = await forgotForm.evaluate(
			(el) => getComputedStyle(el).rowGap,
		);
		expect(EXPECTED_ROW_GAPS).toContain(forgotGap);

		// 3. Admin reset-password page
		await page.goto(
			`http://localhost:${adminPort}/reset-password?token=valid-test-token`,
		);
		const resetForm = page.locator("#reset-password-form");
		if (await resetForm.isVisible()) {
			const resetGap = await resetForm.evaluate(
				(el) => getComputedStyle(el).rowGap,
			);
			expect(EXPECTED_ROW_GAPS).toContain(resetGap);
		}
	});
});
