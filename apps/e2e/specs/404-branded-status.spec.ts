import { expect, test } from "@playwright/test";

/**
 * Regression spec for issue #113 (QC P1):
 * 1. Non-existent pages (/this-page-does-not-exist-qc-test, /help, /about, /signup, /register, /payments)
 *    must render the branded TeacherOS 404 UI (never plain 12px "Not Found").
 * 2. HTTP status code must be 404 (never 200).
 * 3. Dotfiles (/.env, /.git) must return 404 plain text (never SPA HTML).
 * 4. Valid routes (/login, /dashboard) must return HTTP 200.
 */
test.describe("Issue #113: Branded 404 UI and HTTP 404 status", () => {
	test("browser navigation to unknown route receives HTTP 404 and renders branded 404 UI", async ({
		page,
	}) => {
		const response = await page.goto("/this-page-does-not-exist-qc-test");
		expect(response?.status()).toBe(404);

		// Branded header
		await expect(page.locator("header")).toBeVisible();
		await expect(page.getByText("Cô Mỹ Dạy Tiếng Anh").first()).toBeVisible();

		// Branded 404 content
		await expect(
			page.getByText("Lỗi 404 · Không tìm thấy trang"),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Trang không tồn tại" }),
		).toBeVisible();
		await expect(
			page.getByText("Đường dẫn bạn truy cập không tồn tại"),
		).toBeVisible();

		// Action buttons
		const dashboardLink = page.getByRole("link", {
			name: "Về bảng điều khiển",
		});
		await expect(dashboardLink).toBeVisible();
		await expect(dashboardLink).toHaveAttribute("href", "/dashboard");

		const loginLink = page.getByRole("link", { name: "Đăng nhập" });
		await expect(loginLink).toBeVisible();
		await expect(loginLink).toHaveAttribute("href", "/login");

		// Clicking login link navigates to /login
		await loginLink.click();
		await expect(page).toHaveURL(/\/login$/);
	});

	// /payments gỡ theo #338 (panel dời về /profile) — xử lý như path lạ.
	for (const path of ["/help", "/about", "/signup", "/register", "/payments"]) {
		test(`direct navigation to ${path} returns HTTP 404 and renders branded 404 UI`, async ({
			page,
		}) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(404);

			await expect(
				page.getByRole("heading", { name: "Trang không tồn tại" }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: "Về bảng điều khiển" }),
			).toBeVisible();
		});
	}

	test("HTTP API/curl request to unknown route returns HTTP 404", async ({
		request,
	}) => {
		const res = await request.get("/this-page-does-not-exist-qc-test");
		expect(res.status()).toBe(404);
	});

	test("HTTP request to /.env and /.git returns 404 and never SPA HTML", async ({
		request,
	}) => {
		for (const dotfile of ["/.env", "/.env.local", "/.git", "/.git/config"]) {
			const res = await request.get(dotfile);
			expect(res.status()).toBe(404);
			const body = await res.text();
			expect(body).not.toContain("<!doctype html");
			expect(body).toContain("Not Found");
		}
	});

	test("direct navigation to valid route /login returns HTTP 200", async ({
		page,
	}) => {
		const response = await page.goto("/login");
		expect(response?.status()).toBe(200);
		await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
	});
});
