import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Collapsible sidebar e2e (issue #97) — desktop toggle to a 64px icon-rail,
 * persistence via localStorage, and the mobile drawer invariant: below 921px
 * the drawer must stay full-label regardless of the collapsed pref.
 */

const SIDEBAR_COLLAPSED_KEY = "teacher-os.sidebar.collapsed";
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

async function sidebarWidth(page: Page): Promise<number> {
	const box = await page.locator("aside.sidebar").boundingBox();
	expect(box).not.toBeNull();
	return box?.width ?? 0;
}

/** Width assertion with ±2px tolerance, polling past the 220ms transition. */
async function expectSidebarWidth(page: Page, px: number) {
	await expect
		.poll(() => sidebarWidth(page), { timeout: 5_000 })
		.toBeCloseTo(px, 1);
}

test("desktop: toggle co rail còn 64px và mở lại đúng 248px", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaUi(page);
	await expectSidebarWidth(page, 248);

	const toggle = page.getByTestId("sidebar-toggle");
	await expect(toggle).toHaveAttribute(
		"aria-label",
		"Thu gọn thanh điều hướng",
	);
	await toggle.click();
	await expect(toggle).toHaveAttribute(
		"aria-label",
		"Mở rộng thanh điều hướng",
	);
	await expectSidebarWidth(page, 64);

	// Expand back to the original geometry.
	await toggle.click();
	await expect(toggle).toHaveAttribute(
		"aria-label",
		"Thu gọn thanh điều hướng",
	);
	await expectSidebarWidth(page, 248);
});

test("persistence: reload giữ trạng thái collapsed/expanded qua localStorage", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaUi(page);

	await page.getByTestId("sidebar-toggle").click();
	await expectSidebarWidth(page, 64);
	await page.reload();
	await expect(page.getByTestId("sidebar-toggle")).toBeVisible();
	await expect(
		page.evaluate(
			(key) => window.localStorage.getItem(key),
			SIDEBAR_COLLAPSED_KEY,
		),
	).resolves.toBe("true");
	await expectSidebarWidth(page, 64);

	await page.getByTestId("sidebar-toggle").click();
	await page.reload();
	await expectSidebarWidth(page, 248);
});

test("mobile <921px với collapsed=true: drawer vẫn full-label 280px", async ({
	page,
}) => {
	await page.setViewportSize(MOBILE);
	// Seed BEFORE load: the pref is read by useState lazy-init on first render,
	// so a post-goto evaluate would be too late.
	await page.addInitScript(
		([key]) => window.localStorage.setItem(key as string, "true"),
		[SIDEBAR_COLLAPSED_KEY],
	);
	await signUpViaUi(page);

	await page.getByRole("button", { name: "Menu" }).click();
	const drawer = page.locator("aside.sidebar");
	await expect(drawer).toBeVisible();

	// Full-width drawer keeps visible labels: neither nav text nor section
	// headers may be hidden or sr-only when collapsed leaks through CSS.
	await expect(drawer.getByText("Tổng quan", { exact: true })).toBeVisible();
	await expect(drawer.getByText("Giảng dạy")).toBeVisible();
	await expect(drawer.getByTestId("sidebar-user-email")).toBeAttached();

	const box = await drawer.boundingBox();
	expect(Math.round(box?.width ?? 0)).toBe(280);
});

test("điều hướng từ rail: click icon Học viên tới /students và testid email còn DOM", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaUi(page);
	await page.getByTestId("sidebar-toggle").click();
	await expectSidebarWidth(page, 64);

	// Icon-only item still navigates; accessible name survives via sr-only label.
	await page.locator("aside.sidebar").getByText("Học viên").click();
	await expect(page).toHaveURL(/\/students$/);
	await expect(page.getByTestId("sidebar-user-email")).toBeAttached();
});
