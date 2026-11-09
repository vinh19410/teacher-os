import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

const VIEWPORTS = [
	{ name: "desktop-1440x900", width: 1440, height: 900 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "mobile-375x812", width: 375, height: 812 },
];

test("Issue #649: Chụp screenshots 3 viewports light & dark cho tính năng thêm buổi học thủ công", async ({
	page,
}) => {
	const CLASS_NAME = `IELTS Manual Class ${Date.now()}`;
	await signUpViaApi(page);

	// Tạo lớp manual (không có syllabus)
	const classId = await seedDatedClass(page, {
		name: CLASS_NAME,
		schedule: { days: [1, 3], start: "19:00", end: "20:30" },
		startDate: "2026-11-10",
		sessionsTotal: 12,
		schedulingMode: "manual",
	});

	await page.goto(`/classes/${classId}`);
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText("Chưa có buổi học nào")).toBeVisible();

	// 1. Chụp Empty State ở 3 viewport (light)
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(300);
		await page.screenshot({
			path: resolve(REPORT_DIR, `649-empty-state-${vp.name}-light.png`),
			fullPage: true,
		});
	}

	// 2. Chụp Empty State desktop ở dark mode
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(300);
	await page.screenshot({
		path: resolve(REPORT_DIR, "649-empty-state-desktop-1440x900-dark.png"),
		fullPage: true,
	});
	await page.evaluate(() => document.documentElement.classList.remove("dark"));

	// 3. Mở modal "+ Thêm buổi học" và chụp
	await page.getByRole("button", { name: "+ Thêm buổi học" }).first().click();
	const addModal = page.getByRole("dialog", {
		name: "Thêm buổi học thủ công",
	});
	await expect(addModal).toBeVisible();
	await page.screenshot({
		path: resolve(
			REPORT_DIR,
			"649-add-session-modal-desktop-1440x900-light.png",
		),
	});

	// Điền chủ đề và submit
	await addModal
		.getByLabel(/Chủ đề buổi học/i)
		.fill("IELTS Writing Task 1: Line Chart");
	await addModal.getByRole("button", { name: "Thêm buổi học" }).click();
	await expect(addModal).toBeHidden();

	// 4. Chụp danh sách buổi học populated (desktop light)
	await expect(
		page.getByText("IELTS Writing Task 1: Line Chart"),
	).toBeVisible();
	await page.screenshot({
		path: resolve(
			REPORT_DIR,
			"649-populated-sessions-desktop-1440x900-light.png",
		),
		fullPage: true,
	});

	// 5. Mở modal Điều chỉnh buổi (có nút Xóa buổi học) và chụp
	await page.getByRole("button", { name: "Điều chỉnh" }).click();
	const adjustModal = page.getByRole("dialog", {
		name: /Điều chỉnh buổi/,
	});
	await expect(adjustModal).toBeVisible();
	await expect(
		adjustModal.getByRole("button", { name: "Xóa buổi học" }),
	).toBeVisible();
	await page.screenshot({
		path: resolve(
			REPORT_DIR,
			"649-adjust-modal-delete-desktop-1440x900-light.png",
		),
	});
});
