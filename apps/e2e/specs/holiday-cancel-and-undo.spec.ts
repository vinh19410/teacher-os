import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	gotoWeek,
	mondayWeekStartISO,
	signUpViaApi,
	vietnamTodayISO,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

/**
 * TOS-13 / issue #448 — AC-003: Phương thức Hủy buổi (không bù) và Xóa kỳ
 * nghỉ tương lai (Hoàn tác).
 *
 * Kịch bản:
 * 1. Hủy buổi (1440×900): mở /schedule → + Tạo lịch nghỉ → chọn "Hủy buổi
 *    (không bù)" → bảng xem trước ghi "→ Hủy buổi (không bù)" → xác nhận →
 *    buổi trong tuần nghỉ hiện "Đã hủy — «tên kỳ nghỉ»", tuần sau buổi cuối
 *    của lớp không có buổi mới.
 * 2. Hoàn tác (1440×900): tạo kỳ nghỉ tương lai phương thức Dời lịch → thấy
 *    buổi bù ở cuối khóa → bấm "Xóa kỳ nghỉ (Hoàn tác)" → xác nhận → buổi gốc
 *    hiện lại như buổi thường, tuần chứa ngày bù không còn buổi bù, thẻ kỳ
 *    nghỉ biến mất.
 * 3. Kỳ nghỉ đã bắt đầu (fromDate = hôm nay): không có nút hoàn tác.
 * 4. Kịch bản 2 lặp ở 768×1024 và 375×812.
 */

const TODAY = vietnamTodayISO();

/** Thứ Sáu đầu tiên strictly sau hôm nay (mọi buổi đều ở tương lai). */
function firstUpcomingFridayISO(todayISO: string): string {
	let d = addDaysISO(todayISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 5) {
		d = addDaysISO(d, 1);
	}
	return d;
}

function formatDayMonth(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

async function openHolidayDialog(page: Page): Promise<Locator> {
	await page.getByTestId("holiday-open").click();
	const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
	await expect(dialog).toBeVisible();
	return dialog;
}

test("AC-003 (1440×900): phương thức Hủy buổi (không bù) chuyển buổi thành Đã hủy, không sinh buổi bù cuối khóa", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const teacherEmail = await signUpViaApi(page);

	const f1 = firstUpcomingFridayISO(TODAY);
	// Lớp T6 4 buổi: f1, f2=f1+7, f3=f1+14, f4=f1+21; tuần sau buổi cuối là f5=f1+28.
	const f2 = addDaysISO(f1, 7);
	const f5 = addDaysISO(f1, 28);

	await seedDatedClass(page, {
		name: "IELTS Cancel T6",
		startDate: f1,
		schedule: { days: [4], start: "19:00", end: "20:30" },
		sessionsTotal: 4,
		students: {
			teacherEmail,
			names: ["An Nguyễn", "Bình Trần"],
		},
	});

	await gotoWeek(page, mondayWeekStartISO(f2));
	const dialog = await openHolidayDialog(page);

	await dialog.getByTestId("holiday-name").fill("Nghỉ bảo trì cơ sở");
	await dialog.getByTestId("holiday-from").fill(f2);
	await dialog.getByTestId("holiday-to").fill(f2);
	await dialog.getByTestId("holiday-mode-cancel").check();

	const preview = dialog.getByTestId("holiday-preview");
	await expect(preview).toBeVisible({ timeout: 10_000 });
	await expect(preview).toContainText("IELTS Cancel T6");
	await expect(preview).toContainText(`${formatDayMonth(f2)} · Buổi 2`);
	await expect(preview).toContainText("→ Hủy buổi (không bù)");

	const confirmBtn = dialog.getByRole("button", {
		name: "Xác nhận áp dụng & Hủy buổi",
	});
	await expect(confirmBtn).toBeEnabled();
	await confirmBtn.click();

	await expect(page.getByText(/Đã hủy 1 buổi/)).toBeVisible();
	await expect(dialog).toBeHidden();

	// Buổi trong tuần nghỉ f2 hiện "Đã hủy — Nghỉ bảo trì cơ sở".
	const lessonBlock = page.locator(".lesson-block", {
		hasText: "IELTS Cancel T6",
	});
	await expect(lessonBlock).toContainText("Đã hủy — Nghỉ bảo trì cơ sở");

	// Tuần sau buổi cuối (f5) KHÔNG có buổi bù mới.
	await gotoWeek(page, mondayWeekStartISO(f5));
	await expect(
		page.locator(".lesson-block", { hasText: "IELTS Cancel T6" }),
	).toHaveCount(0);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 375, height: 812 },
] as const) {
	test(`AC-003 (${viewport.width}×${viewport.height}): hoàn tác kỳ nghỉ tương lai thu hồi buổi bù và khôi phục buổi gốc`, async ({
		page,
	}) => {
		await page.setViewportSize({
			width: viewport.width,
			height: viewport.height,
		});
		const teacherEmail = await signUpViaApi(page);

		const f1 = firstUpcomingFridayISO(TODAY);
		const f2 = addDaysISO(f1, 7);
		const f5 = addDaysISO(f1, 28);

		await seedDatedClass(page, {
			name: "IELTS Undo T6",
			startDate: f1,
			schedule: { days: [4], start: "19:00", end: "20:30" },
			sessionsTotal: 4,
			students: {
				teacherEmail,
				names: ["Minh Học Viên"],
			},
		});

		await gotoWeek(page, mondayWeekStartISO(f2));
		const dialog = await openHolidayDialog(page);
		await dialog.getByTestId("holiday-name").fill("Nghỉ lễ 20/11");
		await dialog.getByTestId("holiday-from").fill(f2);
		await dialog.getByTestId("holiday-to").fill(f2);

		const preview = dialog.getByTestId("holiday-preview");
		await expect(preview).toBeVisible({ timeout: 10_000 });
		await dialog
			.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
			.click();
		await expect(dialog).toBeHidden();

		// Thấy buổi bù ở cuối khóa (tuần f5).
		await gotoWeek(page, mondayWeekStartISO(f5));
		await expect(
			page.locator(".lesson-block", { hasText: "IELTS Undo T6" }),
		).toBeVisible();

		// Quay lại tuần nghỉ f2: thấy thẻ kỳ nghỉ và nút "Xóa kỳ nghỉ (Hoàn tác)".
		await gotoWeek(page, mondayWeekStartISO(f2));
		const holidayCard = page.getByTestId("holiday-calendar-card");
		await expect(holidayCard).toBeVisible();
		await expect(holidayCard).toContainText("Nghỉ lễ 20/11");

		const undoTrigger = holidayCard.getByTestId("holiday-undo-trigger");
		await expect(undoTrigger).toBeVisible();
		await undoTrigger.click();

		const undoDialog = page.getByRole("dialog", {
			name: "Xóa kỳ nghỉ (Hoàn tác)",
		});
		await expect(undoDialog).toBeVisible();
		await expect(undoDialog.getByTestId("holiday-undo-summary")).toHaveText(
			"Khôi phục 1 buổi gốc · Thu hồi 1 buổi bù",
		);

		await undoDialog.getByTestId("holiday-undo-confirm").click();
		await expect(
			page.getByText(/Đã xóa kỳ nghỉ «Nghỉ lễ 20\/11»: khôi phục 1 buổi/),
		).toBeVisible();
		await expect(undoDialog).toBeHidden();

		// Thẻ kỳ nghỉ biến mất, buổi gốc tại f2 hiện lại như buổi thường (không còn nhãn Nghỉ lễ).
		await expect(page.getByTestId("holiday-calendar-card")).toHaveCount(0);
		const restoredBlock = page.locator(".lesson-block", {
			hasText: "IELTS Undo T6",
		});
		await expect(restoredBlock).toBeVisible();
		await expect(restoredBlock).not.toContainText("Nghỉ lễ — Đã dời lịch");

		// Tuần chứa ngày bù f5 không còn buổi bù.
		await gotoWeek(page, mondayWeekStartISO(f5));
		await expect(
			page.locator(".lesson-block", { hasText: "IELTS Undo T6" }),
		).toHaveCount(0);
	});
}

test("AC-003 (1440×900): kỳ nghỉ đã bắt đầu (fromDate = hôm nay) không có nút hoàn tác", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const teacherEmail = await signUpViaApi(page);

	const todayDow = (new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 6) % 7;
	await seedDatedClass(page, {
		name: "IELTS Today",
		startDate: TODAY,
		schedule: { days: [todayDow], start: "19:00", end: "20:30" },
		sessionsTotal: 4,
		students: {
			teacherEmail,
			names: ["Lan Học Viên"],
		},
	});

	await gotoWeek(page, mondayWeekStartISO(TODAY));
	const dialog = await openHolidayDialog(page);
	await dialog.getByTestId("holiday-name").fill("Nghỉ bắt đầu hôm nay");
	await dialog.getByTestId("holiday-from").fill(TODAY);
	await dialog.getByTestId("holiday-to").fill(TODAY);

	await expect(dialog.getByTestId("holiday-preview")).toBeVisible({
		timeout: 10_000,
	});
	await dialog
		.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
		.click();
	await expect(dialog).toBeHidden();

	const holidayCard = page.getByTestId("holiday-calendar-card");
	await expect(holidayCard).toBeVisible();
	await expect(holidayCard).toContainText("Nghỉ bắt đầu hôm nay");
	await expect(holidayCard.getByTestId("holiday-undo-trigger")).toHaveCount(0);
});
