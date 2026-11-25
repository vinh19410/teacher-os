import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { seedStudent, signUpViaApi } from "./helpers";
import { API_ORIGIN, LMS_ORIGIN } from "./origins";

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

test("desktop: toggle co rail còn 64px (4rem ở root 16px) và mở lại đúng 256px = 16rem ở root 16px (track 16rem của shell v2)", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);
	await expectSidebarWidth(page, 256);

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
	await expectSidebarWidth(page, 256);
});

test("persistence: reload giữ trạng thái collapsed/expanded qua localStorage", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);

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
	await expectSidebarWidth(page, 256);
});

test("mobile <1024px với collapsed=true: drawer vẫn full-label 288px", async ({
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
	expect(Math.round(box?.width ?? 0)).toBe(288); // w-72 = 18rem ở root 16px
});

test("điều hướng từ rail: click icon Học viên tới /students và testid email còn DOM", async ({
	page,
}) => {
	await page.setViewportSize(DESKTOP);
	await signUpViaApi(page);
	await page.getByTestId("sidebar-toggle").click();
	await expectSidebarWidth(page, 64);

	// Icon-only item still navigates; the accessible name (sr-only label)
	// is what makes this role-based locator resolvable at all.
	await page
		.locator("aside.sidebar")
		.getByRole("link", { name: "Học viên" })
		.click();
	await expect(page).toHaveURL(/\/students$/);
	await expect(page.getByTestId("sidebar-user-email")).toBeAttached();

	// Rail footer geometry (v2, rail 64px): avatar link and logout must stack
	// vertically and stay inside the rail, not overflow horizontally.
	const railFooter = await page.evaluate(() => {
		const aside = document.querySelector("aside.sidebar");
		const avatarLink = aside?.querySelector<HTMLAnchorElement>(
			'a[href="/teacher/profile"][aria-label="Hồ sơ cá nhân"]',
		);
		const logout = aside?.querySelector<HTMLButtonElement>(
			'button[aria-label="Đăng xuất"]',
		);
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

test("footer tên/email dài: không ló rìa trái hay nhận Tab ở <=768px và truncate gọn không đè nút Đăng xuất", async ({
	page,
}) => {
	const longName = "Trung tâm Tài Liệu Tiếng Anh 1795543335456";
	await page.setViewportSize({ width: 1440, height: 900 });
	await signUpViaApi(page, { name: longName });

	const measureFooterGeometry = async () =>
		page.evaluate(() => {
			const aside = document.querySelector<HTMLElement>("aside.sidebar");
			const profileLink = aside?.querySelector<HTMLAnchorElement>(
				'a[aria-label="Hồ sơ cá nhân"]',
			);
			const emailEl = aside?.querySelector<HTMLElement>(
				'[data-testid="sidebar-user-email"]',
			);
			const logoutBtn = aside?.querySelector<HTMLButtonElement>(
				'button[aria-label="Đăng xuất"]',
			);
			const nameEl = profileLink?.querySelector<HTMLElement>(
				'span.truncate:not([data-testid="sidebar-user-email"])',
			);
			if (!aside || !profileLink || !emailEl || !logoutBtn || !nameEl) {
				return null;
			}
			const asideRect = aside.getBoundingClientRect();
			const nameRect = nameEl.getBoundingClientRect();
			const emailRect = emailEl.getBoundingClientRect();
			const logoutRect = logoutBtn.getBoundingClientRect();
			return {
				asideRight: asideRect.right,
				asideScrollWidth: aside.scrollWidth,
				asideClientWidth: aside.clientWidth,
				nameScrollWidth: nameEl.scrollWidth,
				nameClientWidth: nameEl.clientWidth,
				nameRight: nameRect.right,
				emailRight: emailRect.right,
				logoutLeft: logoutRect.left,
				logoutRight: logoutRect.right,
			};
		});

	// Desktop 1440×900: tên dài kích hoạt ellipsis, không đè nút Đăng xuất và không tràn khỏi aside.
	const desktop = await measureFooterGeometry();
	expect(desktop).not.toBeNull();
	expect(desktop?.nameScrollWidth).toBeGreaterThan(
		desktop?.nameClientWidth ?? 0,
	);
	expect(desktop?.nameRight).toBeLessThanOrEqual(
		(desktop?.logoutLeft ?? 0) + 1,
	);
	expect(desktop?.emailRight).toBeLessThanOrEqual(
		(desktop?.logoutLeft ?? 0) + 1,
	);
	expect(desktop?.logoutRight).toBeLessThanOrEqual(
		(desktop?.asideRight ?? 0) + 1,
	);
	expect(desktop?.asideScrollWidth).toBeLessThanOrEqual(
		(desktop?.asideClientWidth ?? 0) + 1,
	);

	// Tablet 768×1024 & Mobile 375×812: kiểm tra trạng thái đóng, bỏ qua Tab, mở drawer, truncate và Escape.
	const drawer = page.locator("aside.sidebar");
	const menuBtn = page.locator("button[aria-label='Open navigation']");
	for (const vp of [
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await page.setViewportSize(vp);
		await page.reload();
		await expect(menuBtn).toBeVisible();
		await expect(menuBtn).toHaveAttribute("aria-expanded", "false");
		await expect(drawer).toBeHidden();

		const closedState = await page.evaluate(() => {
			const aside = document.querySelector<HTMLElement>("aside.sidebar");
			if (!aside) return null;
			return {
				visibility: getComputedStyle(aside).visibility,
				right: aside.getBoundingClientRect().right,
				docScrollWidth: document.documentElement.scrollWidth,
				docClientWidth: document.documentElement.clientWidth,
			};
		});
		expect(closedState).not.toBeNull();
		expect(closedState?.visibility).toBe("hidden");
		expect(closedState?.right).toBeLessThanOrEqual(0.5);
		expect(closedState?.docScrollWidth).toBeLessThanOrEqual(
			(closedState?.docClientWidth ?? 0) + 1,
		);

		// Tab đầu tiên sau reload phải đi thẳng vào nút mở nav, bỏ qua <aside> đóng đứng trước trong DOM.
		await page.keyboard.press("Tab");
		await expect(menuBtn).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		const focusInsideClosedAside = await page.evaluate(() => {
			const aside = document.querySelector("aside.sidebar");
			return Boolean(aside?.contains(document.activeElement));
		});
		expect(focusInsideClosedAside).toBe(false);

		// Mở drawer và chờ slide-in (Tailwind v4 translate) ổn định tại x ≈ 0; focus phải chuyển ngay vào aside.
		await menuBtn.click();
		await expect(menuBtn).toHaveAttribute("aria-expanded", "true");
		await expect(drawer).toBeVisible();
		await expect(drawer).toBeFocused();
		await expect
			.poll(
				async () => {
					const box = await drawer.boundingBox();
					return box ? Math.abs(box.x) : 999;
				},
				{ timeout: 5_000 },
			)
			.toBeLessThanOrEqual(1);

		const openGeom = await measureFooterGeometry();
		expect(openGeom).not.toBeNull();
		expect(openGeom?.nameScrollWidth).toBeGreaterThan(
			openGeom?.nameClientWidth ?? 0,
		);
		expect(openGeom?.nameRight).toBeLessThanOrEqual(
			(openGeom?.logoutLeft ?? 0) + 1,
		);
		expect(openGeom?.emailRight).toBeLessThanOrEqual(
			(openGeom?.logoutLeft ?? 0) + 1,
		);
		expect(openGeom?.logoutRight).toBeLessThanOrEqual(
			(openGeom?.asideRight ?? 0) + 1,
		);
		expect(openGeom?.asideScrollWidth).toBeLessThanOrEqual(
			(openGeom?.asideClientWidth ?? 0) + 1,
		);

		// Escape đóng drawer (đợi kết thúc transition 200ms) và trả focus về nút mở nav.
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();
		await expect(menuBtn).toHaveAttribute("aria-expanded", "false");
		await expect(menuBtn).toBeFocused();
	}

	// Reflow 320×568: không tràn ngang, drawer ẩn hoàn toàn.
	await page.setViewportSize({ width: 320, height: 568 });
	await expect(drawer).toBeHidden();
	const reflowOverflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	);
	expect(reflowOverflow).toBeLessThanOrEqual(1);
});

test("student mobile 375x812: mở AvatarMenuContent không đóng drawer, Đăng xuất tương tác được và Escape đóng theo tầng", async ({
	browser,
}) => {
	// Bảo đảm có ít nhất 1 organization trong local.db qua một teacher bootstrap sạch.
	const teacherCtx = await browser.newContext({ baseURL: LMS_ORIGIN });
	const teacherPage = await teacherCtx.newPage();
	let teacherEmail: string;
	try {
		teacherEmail = await signUpViaApi(teacherPage);
	} finally {
		await teacherCtx.close();
	}

	const studentCtx = await browser.newContext({
		baseURL: LMS_ORIGIN,
		viewport: { width: 375, height: 812 },
	});
	const page = await studentCtx.newPage();
	try {
		const studentName = "Học viên Trung tâm Tài Liệu 1795543335456";
		const studentEmail = `student-drawer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
		const res = await page.request.post(
			`${API_ORIGIN}/api/auth/sign-up/email`,
			{
				data: {
					name: studentName,
					email: studentEmail,
					password: "password-8chars",
				},
				headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN },
			},
		);
		expect(res.status()).toBe(200);

		const dbPath = fileURLToPath(new URL("../local.db", import.meta.url).href);
		const client = createClient({ url: `file:${dbPath}` });
		try {
			await client.execute("PRAGMA busy_timeout = 5000;");
			await client.execute({
				sql: "UPDATE user SET role = 'student', email_verified = 1 WHERE lower(email) = lower(?)",
				args: [studentEmail],
			});
		} finally {
			client.close();
		}

		await seedStudent({
			teacherEmail,
			name: studentName,
			email: studentEmail,
			onboarded: true,
		});

		await page.goto("/student/");
		const menuBtn = page.locator("button[aria-label='Open navigation']");
		const drawer = page.locator("aside.sidebar");
		await expect(menuBtn).toBeVisible({ timeout: 30_000 });
		await expect(drawer).toBeHidden();

		const closedRight = await page.evaluate(
			() =>
				document
					.querySelector<HTMLElement>("aside.sidebar")
					?.getBoundingClientRect().right ?? 999,
		);
		expect(closedRight).toBeLessThanOrEqual(0.5);

		// Mở drawer, chờ slide-in hoàn tất.
		await menuBtn.click();
		await expect(drawer).toBeVisible();
		await expect
			.poll(
				async () => {
					const box = await drawer.boundingBox();
					return box ? Math.abs(box.x) : 999;
				},
				{ timeout: 5_000 },
			)
			.toBeLessThanOrEqual(1);

		// Bấm nút tài khoản học viên: drawer phải giữ mở, menu tài khoản hiện gọn bên trong aside.
		const accountBtn = drawer.getByRole("button", {
			name: "Tài khoản học viên",
		});
		await accountBtn.click();
		await expect(drawer).toBeVisible();
		const accountMenu = drawer.getByRole("menu", { name: "Menu tài khoản" });
		await expect(accountMenu).toBeVisible();
		await expect(
			accountMenu.getByRole("menuitem", { name: "Đăng xuất" }),
		).toBeVisible();

		const menuBounds = await page.evaluate(() => {
			const aside = document.querySelector<HTMLElement>("aside.sidebar");
			const menu = aside?.querySelector<HTMLElement>(
				'[role="menu"][aria-label="Menu tài khoản"]',
			);
			if (!aside || !menu) return null;
			const a = aside.getBoundingClientRect();
			const m = menu.getBoundingClientRect();
			return {
				menuLeft: m.left,
				menuRight: m.right,
				asideLeft: a.left,
				asideRight: a.right,
			};
		});
		expect(menuBounds).not.toBeNull();
		expect(menuBounds?.menuLeft).toBeGreaterThanOrEqual(
			(menuBounds?.asideLeft ?? 0) - 1,
		);
		expect(menuBounds?.menuRight).toBeLessThanOrEqual(
			(menuBounds?.asideRight ?? 0) + 1,
		);

		// Escape lần 1 chỉ đóng popover tài khoản, giữ drawer mở.
		await page.keyboard.press("Escape");
		await expect(accountMenu).toBeHidden();
		await expect(drawer).toBeVisible();

		// Escape lần 2 mới đóng drawer.
		await page.keyboard.press("Escape");
		await expect(drawer).toBeHidden();
	} finally {
		await studentCtx.close();
	}
});
