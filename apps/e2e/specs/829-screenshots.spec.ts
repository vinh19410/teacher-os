import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

const VIEWPORTS = [
	{ name: "desktop-1440x900", width: 1440, height: 900 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "mobile-375x812", width: 375, height: 812 },
];

test("Issue #829: Chụp screenshots 3 viewports light & dark cho danh sách gộp Bộ đề tự học", async ({
	page,
}) => {
	await signUpViaApi(page);

	await page.goto("/teacher/assignments/packs");
	await expect(
		page.getByRole("heading", { name: "Bộ đề tự học" }),
	).toBeVisible();

	// Verify ChipFilter for scope is visible with all 3 options
	await expect(
		page.getByRole("button", { name: /^Tất cả/ }).first(),
	).toBeVisible();
	await expect(page.getByRole("button", { name: /^Trung tâm/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /^Hệ thống/ })).toBeVisible();

	// Chụp trang danh sách ở 3 viewports (light & dark)
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(250);
		await page.screenshot({
			path: resolve(REPORT_DIR, `829-study-packs-unified-${vp.name}-light.png`),
			fullPage: true,
		});

		await page.evaluate(() => document.documentElement.classList.add("dark"));
		await page.waitForTimeout(250);
		await page.screenshot({
			path: resolve(REPORT_DIR, `829-study-packs-unified-${vp.name}-dark.png`),
			fullPage: true,
		});
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
	}
});
