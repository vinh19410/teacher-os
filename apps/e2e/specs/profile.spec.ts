import { Buffer } from "node:buffer";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";
import { expect, test } from "@playwright/test";
import { seedGoogleAccount } from "../src/account-seed";
import { signUpViaUi } from "./helpers";

/**
 * Profile page e2e (issue #94) — no auth mocking: signup runs through the
 * real UI, renames/uploads go through the real better-auth endpoints, and the
 * Google "connected" state is backed by a real seeded `account` row read via
 * the real /api/auth/list-accounts. The full OAuth round-trip itself cannot
 * be automated here (boot shim holds dummy Google creds) — it stays on the
 * phase-02 manual checklist.
 */

test("đổi tên hiển thị cập nhật sidebar ngay không cần reload", async ({
	page,
}) => {
	const email = await signUpViaUi(page);
	await page.goto("/profile");
	await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();

	await page.getByTestId("profile-name-input").fill("Trần Thị Bích Hòa");
	await page.getByTestId("profile-name-submit").click();
	await expect(
		page
			.locator("[data-sonner-toast]")
			.filter({ hasText: "Đã cập nhật tên hiển thị" }),
	).toBeVisible();

	// Sidebar reflects the rename without a full page reload.
	await expect(
		page.locator("aside").getByText("Trần Thị Bích Hòa", { exact: true }),
	).toBeVisible();
	// Sidebar subtitle shows the truthful email now (was a hardcoded "Google").
	await expect(page.getByTestId("sidebar-user-email")).toHaveText(email);
});

test("upload avatar nén về data URL JPEG ≤64KB và hiện ở cả sidebar", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/profile");

	// Draw a detailed ≥400px image in the browser — a tiny buffer would make
	// canvas upscale and skip the production downscale path entirely.
	const dataUrl = await page.evaluate(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 480;
		canvas.height = 480;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("no 2d context");
		const gradient = ctx.createLinearGradient(0, 0, 480, 480);
		gradient.addColorStop(0, "#4285f4");
		gradient.addColorStop(0.5, "#ea4335");
		gradient.addColorStop(1, "#34a853");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 480, 480);
		// Structured detail keeps JPEG busy so quality stepping gets exercised.
		for (let i = 0; i < 220; i += 1) {
			ctx.fillStyle = `rgba(255,255,255,${i % 7 === 0 ? 0.9 : 0.25})`;
			ctx.fillRect((i * 53) % 460, (i * 97) % 460, 8, 8);
		}
		return canvas.toDataURL("image/png");
	});
	const buffer = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
	expect(buffer.byteLength).toBeGreaterThan(10_000);

	await page
		.locator('[data-testid="avatar-input"]')
		.setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });

	const profileSrc =
		(await page
			.locator('[data-testid="profile-avatar"]')
			.getAttribute("src")) ?? "";
	expect(profileSrc).toMatch(/^data:image\/jpeg;base64,/);
	expect(profileSrc.length).toBeLessThanOrEqual(65_536);

	await expect(page.locator('[data-testid="sidebar-avatar"]')).toHaveAttribute(
		"src",
		/^data:image\/jpeg;base64,/,
	);
	await expect(page.getByText("Đã cập nhật ảnh đại diện")).toBeVisible();
});

test("user đã seed account google hiển thị badge Đã kết nối qua listAccounts thật", async ({
	page,
}) => {
	const email = await signUpViaUi(page);
	await page.goto("/profile");
	// Not connected yet → the connect button renders.
	await expect(
		page.getByRole("button", { name: "Kết nối Google" }),
	).toBeVisible();

	await seedGoogleAccount(email);
	await page.reload();
	await expect(page.getByText("Đã kết nối")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Kết nối Google" }),
	).toHaveCount(0);
});

test("guard server /update-user thật: tên quá ngắn nhận 400 tiếng Việt", async ({
	page,
}) => {
	await signUpViaUi(page);
	// POST straight to the auth endpoint with the browser session cookie —
	// this exercises the REAL server hook (the UI form would validate first),
	// so a silent wire-up regression of the validation guard fails here.
	const res = await page.request.post(
		`${API_ORIGIN}/api/auth/update-user`,
		{
			headers: { origin: WEB_ORIGIN },
			data: { name: "A" },
		},
	);
	expect(res.status()).toBe(400);
	const body = await res.json();
	expect(JSON.stringify(body)).toMatch(/Tên hiển thị/);
});

test("error-param branch từ OAuth callback hiện toast lỗi và tự clear URL", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/profile");
	// A cancelled/denied consent lands back with ?error=<code> appended by
	// better-auth; the route must toast (Vietnamese, mapped) and scrub the URL
	// while REMAINING on /profile (not falling into not-found).
	await page.goto("/profile?error=email_doesn%27t_match");

	await expect(
		page
			.locator("[data-sonner-toast]")
			.filter({ hasText: "Email Google không khớp" }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/profile$/);
	await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
});

test("nút Kết nối Google mở redirect sang Google khi cấu hình OAuth thật", async ({
	page,
}) => {
	test.skip(
		!process.env.E2E_GOOGLE_OAUTH,
		"boot shim dùng Google creds dummy — round-trip thật thuộc manual checklist",
	);
	const email = await signUpViaUi(page);
	await page.goto("/profile");
	await page.getByRole("button", { name: "Kết nối Google" }).click();
	await page.waitForURL(/accounts\.google\.com/, { timeout: 30_000 });
	expect(email).toBeTruthy();
});
