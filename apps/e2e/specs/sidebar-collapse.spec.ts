import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * Collapsible sidebar e2e (issue #97, shell v2) — desktop toggle to a 64px
 * icon-rail, persistence via localStorage, and the mobile drawer invariant:
 * below 1024px the drawer must stay full-label regardless of the collapsed
 * pref. Drawer mở bằng nút `button[aria-label='Open navigation']` (shell v2).
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
		.poll(async () => Math.abs((await sidebarWidth(page)) - px), {
			timeout: 5_000,
		})
		.toBeLessThanOrEqual(2);
}

test("desktop: toggle co rail còn 56px (4rem ở root 14px) và mở lại đúng 224px = 16rem ở root 14px (track 16rem của shell v2)", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);
	await expectSidebarWidth(page, 224);

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
	await expectSidebarWidth(page, 56);

	// Expand back to the original geometry.
	await toggle.click();
	await expect(toggle).toHaveAttribute(
		"aria-label",
		"Thu gọn thanh điều hướng",
	);
	await expectSidebarWidth(page, 224);
});

test("persistence: reload giữ trạng thái collapsed/expanded qua localStorage", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);

	await page.getByTestId("sidebar-toggle").click();
	await expectSidebarWidth(page, 56);
	await page.reload();
	await expect(page.getByTestId("sidebar-toggle")).toBeVisible();
	await expect(
		page.evaluate(
			(key) => window.localStorage.getItem(key),
			SIDEBAR_COLLAPSED_KEY,
		),
	).resolves.toBe("true");
	await expectSidebarWidth(page, 56);

	await page.getByTestId("sidebar-toggle").click();
	await page.reload();
	await expectSidebarWidth(page, 224);
});

test("mobile <1024px với collapsed=true: drawer vẫn full-label 252px", async ({
	page,
}) => {
	await page.setViewportSize(MOBILE);
	// Seed BEFORE load: the pref is read by useState lazy-init on first render,
	// so a post-goto evaluate would be too late.
	await page.addInitScript(
		([key]) => window.localStorage.setItem(key as string, "true"),
		[SIDEBAR_COLLAPSED_KEY],
	);
	await signUpViaApi(page);

	// Shell v2: drawer ẩn dưới lg — phải mở bằng nút menu trước.
	await page.locator("button[aria-label='Open navigation']").click();
	const drawer = page.locator("aside.sidebar");
	await expect(drawer).toBeVisible();

	// Full-width drawer keeps visible labels: neither nav text nor group
	// labels may be hidden or sr-only when collapsed leaks through CSS
	// (nhãn ẩn chỉ áp dụng từ lg trở lên).
	await expect(drawer.getByText("Tổng quan", { exact: true })).toBeVisible();
	await expect(drawer.getByText("Giảng dạy")).toBeVisible();
	await expect(drawer.getByTestId("sidebar-user-email")).toBeAttached();

	const box = await drawer.boundingBox();
	expect(Math.round(box?.width ?? 0)).toBe(252); // w-72 = 18rem ở root 14px
});

test("điều hướng từ rail: click icon Học viên tới /students và testid email còn DOM", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);
	await page.getByTestId("sidebar-toggle").click();
	await expectSidebarWidth(page, 56);

	// Icon-only item still navigates; the accessible name (sr-only label)
	// is what makes this role-based locator resolvable at all.
	await page
		.locator("aside.sidebar")
		.getByRole("link", { name: "Học viên" })
		.click();
	await expect(page).toHaveURL(/\/students$/);
	await expect(page.getByTestId("sidebar-user-email")).toBeAttached();

	// Rail footer geometry (v2, rail 56px): avatar link and logout must stack
	// vertically and stay inside the rail, not overflow horizontally.
	const railFooter = await page.evaluate(() => {
		const aside = document.querySelector("aside.sidebar");
		const avatarLink =
			aside?.querySelector<HTMLAnchorElement>('a[href="/profile"]');
		const btns = aside?.querySelectorAll("button");
		const logout = btns?.[btns.length - 1];
		if (!aside || !avatarLink || !logout) return null;
		const a = aside.getBoundingClientRect();
		const av = avatarLink.getBoundingClientRect();
		const l = logout.getBoundingClientRect();
		return {
			asideRight: a.right,
			logoutRight: l.right,
			stacked: l.top > av.top,
		};
	});
	expect(railFooter).not.toBeNull();
	expect(railFooter?.logoutRight).toBeLessThanOrEqual(
		(railFooter?.asideRight ?? 0) + 1,
	);
	expect(railFooter?.stacked).toBe(true);
});
