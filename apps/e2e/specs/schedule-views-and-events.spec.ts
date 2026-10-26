import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

/**
 * TOS-14 / issue #447 — Lịch dạy Tháng / Tuần / Ngày, màu ca học theo lớp,
 * sự kiện vận hành ngoài lịch lớp (≤ 2 giây).
 *
 * Kịch bản validation hộp thoại Lịch nghỉ chung (AC-004 mục 2) đã chuyển sang
 * follow-up #453 (blocked by #445) theo Scope split trong plan.
 */

const TODAY = vietnamTodayISO();
async function seedTwoDistinctColorClasses(page: Page) {
	const teacherEmail = await signUpViaUi(page);
	await seedDatedClass(page, {
		name: "IELTS 6.5A Sáng",
		startDate: TODAY,
		schedule: { start: "09:00", end: "10:30" },
		sessionsTotal: 2,
		students: { teacherEmail, names: ["An Nguyễn"] },
	});
	await seedDatedClass(page, {
		name: "Giao tiếp Tối",
		startDate: TODAY,
		schedule: { start: "19:00", end: "20:30" },
		sessionsTotal: 2,
		students: { teacherEmail, names: ["Bình Trần"] },
	});
	return teacherEmail;
}

test("AC-004: đổi view Tháng/Tuần/Ngày ≤ 2s, màu theo lớp, tạo sự kiện vận hành ≤ 2s, 3 viewport", async ({
	page,
}) => {
	const screenshotsDir = new URL(
		"../../../plans/261026-2018-tos-14-schedule-views-and-events/screenshots/",
		import.meta.url,
	).pathname;
	mkdirSync(screenshotsDir, { recursive: true });
	const teacherEmail = await seedTwoDistinctColorClasses(page);

	// Reload (không goto) sau seed để ['kernel'] lấy snapshot mới; rồi mở /schedule.
	await page.goto("/schedule");
	await expect(page.getByText("IELTS 6.5A Sáng")).toBeVisible();
	await expect(page.getByText("Giao tiếp Tối")).toBeVisible();

	// 1. Chuyển Tháng → Tuần → Ngày; mỗi lần đo click → phần tử đầu tiên của
	// view hiển thị < 2000ms (D6: chỉ tính toán client trên snapshot đã tải).
	const switchToMonthStart = Date.now();
	await page.getByRole("tab", { name: "Tháng" }).click();
	await expect(page.getByTestId("schedule-month-grid")).toBeVisible();
	expect(Date.now() - switchToMonthStart).toBeLessThan(2000);
	await expect(page).toHaveURL(/view=month/);

	const switchToWeekStart = Date.now();
	await page.getByRole("tab", { name: "Tuần" }).click();
	await expect(page.locator(".week-cal")).toBeVisible();
	expect(Date.now() - switchToWeekStart).toBeLessThan(2000);
	await expect(page).toHaveURL(/view=week/);

	const switchToDayStart = Date.now();
	await page.getByRole("tab", { name: "Ngày" }).click();
	await expect(page.getByTestId("schedule-day-agenda")).toBeVisible();
	expect(Date.now() - switchToDayStart).toBeLessThan(2000);
	await expect(page).toHaveURL(/view=day/);
	// Mỗi block ca học mang `data-class-color` ổn định (1..8); hai lớp khác màu.
	let colorsInDay = await page
		.locator("[data-class-color]")
		.evaluateAll((els) => els.map((e) => e.getAttribute("data-class-color")));
	for (let extra = 0; new Set(colorsInDay).size < 2 && extra < 5; extra++) {
		await seedDatedClass(page, {
			name: `Lớp phụ ${extra + 1}`,
			startDate: TODAY,
			schedule: { start: `1${extra + 1}:00`, end: `1${extra + 2}:00` },
			sessionsTotal: 1,
			students: { teacherEmail, names: [`Học viên Phụ ${extra + 1}`] },
		});
		await page.reload();
		await expect(page.getByTestId("schedule-day-agenda")).toBeVisible();
		colorsInDay = await page
			.locator("[data-class-color]")
			.evaluateAll((els) => els.map((e) => e.getAttribute("data-class-color")));
	}
	expect(new Set(colorsInDay).size).toBeGreaterThanOrEqual(2);
	for (const c of colorsInDay) {
		expect(c).toMatch(/^[1-8]$/);
	}

	// 2. Tạo sự kiện "Họp chuyên môn giáo viên" → hiện trong view đang mở
	// < 2000ms (từ lúc bấm Tạo sự kiện); chuyển sang view Tháng vẫn thấy.
	await page.getByTestId("schedule-add-event").click();
	await page.getByLabel("Tên sự kiện *").fill("Họp chuyên môn giáo viên");
	await page.getByLabel("Từ giờ *").fill("15:00");
	await page.getByLabel("Đến giờ *").fill("16:30");

	const createStart = Date.now();
	await page.getByTestId("org-event-submit").click();
	await expect(
		page.getByTestId("org-event-chip").filter({
			hasText: "Họp chuyên môn giáo viên",
		}),
	).toBeVisible();
	expect(Date.now() - createStart).toBeLessThan(2000);

	await page.getByRole("tab", { name: "Tháng" }).click();
	await expect(
		page.getByTestId("org-event-chip").filter({
			hasText: "Họp chuyên môn giáo viên",
		}),
	).toBeVisible();

	// 3. 3 viewport (1440×900, 768×1024, 375×812) + chụp baseline; ở 375px
	// không tràn ngang, bấm ngày mở view Ngày.
	for (const [w, h, label] of [
		[1440, 900, "tos14-month-1440"],
		[768, 1024, "tos14-month-768"],
		[375, 812, "tos14-month-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(200);
		if (w === 375) {
			const hasOverflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(hasOverflow).toBe(false);
		}
		await page.screenshot({
			path: `${screenshotsDir}${label}.png`,
			fullPage: true,
		});
	}

	// Ở 375px bấm ô ngày hôm nay → mở view Ngày.
	const todayCell = page.locator(`.month-cell[data-date="${TODAY}"]`);
	await todayCell.getByRole("button").first().click();
	await expect(page.getByTestId("schedule-day-agenda")).toBeVisible();
	await page.screenshot({
		path: `${screenshotsDir}tos14-day-375.png`,
		fullPage: true,
	});
});
