import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { addDaysISO, signUpViaUi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

/**
 * TOS-14 / issue #447 — Lịch dạy Tháng / Tuần / Ngày, màu ca học theo lớp,
 * sự kiện vận hành ngoài lịch lớp (≤ 2 giây).
 *
 * Follow-up #453 (TOS-14b): kịch bản 3 — validation hộp thoại Lịch nghỉ chung
 * (AC-004 mục 2) và thẻ kỳ nghỉ trong cả 3 view — cùng nằm trong file này.
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
	// Khi chuyển qua tab Tuần, URL neo về Thứ Hai đầu tuần; nếu TODAY không phải
	// Thứ Hai thì bấm "Hôm nay" để xem đúng ngày TODAY đã seed buổi học.
	const todayBtn = page.getByRole("button", { name: "Hôm nay" });
	if (await todayBtn.isEnabled()) {
		await todayBtn.click();
		await expect(page).toHaveURL(new RegExp(`date=${TODAY}`));
	}
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

// #453 (TOS-14b) — AC-004 mục 2: hộp thoại Lịch nghỉ chung khóa validation.
test("AC-004 mục 2: hộp thoại Lịch nghỉ chung — tên 1 ký tự hoặc 35 ngày khóa nút xác nhận, hợp lệ thì mở khóa", async ({
	page,
}) => {
	const teacherEmail = await signUpViaUi(page);
	// Cần ít nhất 1 buổi trong khoảng nghỉ để preview.shifts.length > 0 khi hợp lệ.
	await seedDatedClass(page, {
		name: "IELTS Kiểm tra Nghỉ",
		startDate: TODAY,
		schedule: { start: "09:00", end: "10:30" },
		sessionsTotal: 2,
		students: { teacherEmail, names: ["An Nguyễn"] },
	});
	await page.goto("/schedule");
	await expect(page.getByText("IELTS Kiểm tra Nghỉ")).toBeVisible();
	await page.getByTestId("holiday-open").click();

	const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
	await expect(dialog).toBeVisible();
	const confirmBtn = dialog.getByRole("button", {
		name: "Xác nhận áp dụng & Dời buổi",
	});

	// Tên 1 ký tự → cảnh báo inline + nút xác nhận khóa.
	await dialog.getByTestId("holiday-name").fill("N");
	await expect(dialog.getByText(/Tên từ 2–100 ký tự/)).toBeVisible();
	await expect(confirmBtn).toBeDisabled();

	// Khoảng 35 ngày (tính cả hai đầu) → cảnh báo "tối đa 30 ngày" + vẫn khóa.
	await dialog.getByTestId("holiday-name").fill("Nghỉ đông E2E");
	await dialog.getByTestId("holiday-from").fill(TODAY);
	await dialog.getByTestId("holiday-to").fill(addDaysISO(TODAY, 34));
	await expect(dialog.getByText(/tối đa 30 ngày/).first()).toBeVisible();
	await expect(confirmBtn).toBeDisabled();

	// Sửa về đúng 30 ngày → nút mở khóa + bảng xem trước chạy (debounce 300ms).
	await dialog.getByTestId("holiday-to").fill(addDaysISO(TODAY, 29));
	await expect(confirmBtn).toBeEnabled({ timeout: 5000 });
	await expect(dialog.getByTestId("holiday-preview")).toBeVisible({
		timeout: 5000,
	});
});

// #453 (TOS-14b) — AC-004 mục 1: thẻ kỳ nghỉ hiển thị cả 3 view, ổn định
// giữa các lần tải (dữ liệu thật qua snapshot kernel sau khi apply).
test("AC-004: thẻ kỳ nghỉ hiển thị trong cả 3 view Tháng/Tuần/Ngày và ổn định giữa các lần tải", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const teacherEmail = await signUpViaUi(page);
	// Lớp có buổi đúng hôm nay → holiday 1 ngày TODAY trúng buổi, apply thành công.
	await seedDatedClass(page, {
		name: "IELTS Kỳ nghỉ",
		startDate: TODAY,
		schedule: { start: "09:00", end: "10:30" },
		sessionsTotal: 2,
		students: { teacherEmail, names: ["An Nguyễn"] },
	});
	await page.goto("/schedule");
	await expect(page.getByText("IELTS Kỳ nghỉ")).toBeVisible();

	// Tạo holiday 1 ngày hôm nay qua hộp thoại (preview → apply thật).
	await page.getByTestId("holiday-open").click();
	const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
	await expect(dialog).toBeVisible();
	await dialog.getByTestId("holiday-name").fill("Nghỉ lễ E2E");
	await dialog.getByTestId("holiday-from").fill(TODAY);
	await dialog.getByTestId("holiday-to").fill(TODAY);
	await expect(dialog.getByTestId("holiday-preview")).toBeVisible({
		timeout: 10_000,
	});
	await dialog
		.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
		.click();
	await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
	await expect(dialog).toBeHidden();

	const card = page
		.getByTestId("holiday-calendar-card")
		.filter({ hasText: "Nghỉ lễ E2E" });

	// View Ngày TODAY (anchor mặc định sau khi mở /schedule là hôm nay).
	await page.getByRole("tab", { name: "Ngày" }).click();
	await expect(page.getByTestId("schedule-day-agenda")).toBeVisible();
	await expect(card).toBeVisible();

	// View Tuần: thẻ nằm trong cột ngày TODAY.
	await page.getByRole("tab", { name: "Tuần" }).click();
	await expect(page.locator(".week-cal")).toBeVisible();
	await expect(
		page
			.locator(`.day-col[data-date="${TODAY}"]`)
			.getByTestId("holiday-calendar-card")
			.filter({ hasText: "Nghỉ lễ E2E" }),
	).toBeVisible();

	// View Tháng: thẻ nằm trong ô ngày TODAY.
	await page.getByRole("tab", { name: "Tháng" }).click();
	await expect(page.getByTestId("schedule-month-grid")).toBeVisible();
	await expect(
		page
			.locator(`.month-cell[data-date="${TODAY}"]`)
			.getByTestId("holiday-calendar-card")
			.filter({ hasText: "Nghỉ lễ E2E" }),
	).toBeVisible();

	// Ổn định giữa các lần tải: reload → vẫn thấy thẻ ở ô TODAY.
	await page.reload();
	await expect(page.getByTestId("schedule-month-grid")).toBeVisible();
	await expect(
		page
			.locator(`.month-cell[data-date="${TODAY}"]`)
			.getByTestId("holiday-calendar-card")
			.filter({ hasText: "Nghỉ lễ E2E" }),
	).toBeVisible();
});
