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
 * TOS-12 / issue #446 — AC-002: buổi bù nhảy qua kỳ nghỉ khác và bảo vệ ca
 * đã điểm danh.
 *
 * Ngày động (red-team C1/C2): server chặn điểm danh buổi tương lai và apply
 * chặn khoảng quá khứ, nên "buổi đã điểm danh nằm trong kỳ nghỉ" chỉ xảy ra
 * với buổi HÔM NAY; kỳ nghỉ không trúng buổi nào không tạo được qua UI vì
 * nút xác nhận khóa khi shifts rỗng — kỳ nghỉ thứ nhất phải trúng buổi thật
 * của một lớp phụ.
 *
 * 1. Nhảy qua kỳ nghỉ khác: kỳ nghỉ #1 phủ đúng ngày bù tự nhiên M của lớp
 *    chính (trúng buổi của lớp phụ); kỳ nghỉ #2 dời 1 buổi của lớp chính →
 *    bảng xem trước hiện ngày bù mới có `*` + ghi chú tên kỳ nghỉ #1;
 *    xác nhận → tuần chứa ngày bù mới có buổi bù, ngày M không có.
 * 2. Bảo vệ ca đã điểm danh: điểm danh buổi hôm nay của "Giao tiếp 1", tạo
 *    kỳ nghỉ TODAY→TODAY+7 → dòng "Giữ nguyên — Đã diễn ra", buổi còn lại
 *    được dời; sau apply buổi hôm nay vẫn giữ điểm danh cũ.
 * 3. Kịch bản 2 chạy lại ở 768×1024 và 375×812 (thẻ dọc giữ nguyên 2 nhãn).
 */

const TODAY = vietnamTodayISO();

/** Ngày đầu tiên strictly sau `fromISO` rơi vào `utcDay` (0 = CN). */
function nextDowISO(fromISO: string, utcDay: number): string {
	let d = addDaysISO(fromISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== utcDay) {
		d = addDaysISO(d, 1);
	}
	return d;
}

function formatDayMonth(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const VI_WEEKDAYS: Record<number, string> = {
	1: "Thứ 2",
	2: "Thứ 3",
	3: "Thứ 4",
	4: "Thứ 5",
	5: "Thứ 6",
	6: "Thứ 7",
	0: "Chủ nhật",
};

function weekdayLabel(iso: string): string {
	return VI_WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
}

async function openHolidayDialog(page: Page) {
	await page.getByTestId("holiday-open").click();
	const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
	await expect(dialog).toBeVisible();
	return dialog;
}

async function fillHoliday(
	dialog: Locator,
	name: string,
	fromDate: string,
	toDate: string,
) {
	await dialog.getByTestId("holiday-name").fill(name);
	await dialog.getByTestId("holiday-from").fill(fromDate);
	await dialog.getByTestId("holiday-to").fill(toDate);
}

test("AC-002 (1440×900): ngày bù nhảy qua kỳ nghỉ đã khai báo → (*) + ghi chú, sau apply đúng như preview", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const teacherEmail = await signUpViaApi(page);

	// Lớp chính T3 & T7: 4 buổi s0 (T3), s0+4 (T7), s0+7 (T3), s0+11 (T7);
	// ngày bù tự nhiên cho buổi s0+7 là M = s0+14 (T3 đầu tiên sau buổi cuối
	// s0+11); sau khi nhảy qua M, ngày học hợp lệ kế tiếp là T7 = s0+18.
	const s0 = nextDowISO(TODAY, 2); // Thứ Ba đầu tiên sau hôm nay
	const M = addDaysISO(s0, 14);
	const makeupNew = addDaysISO(s0, 18); // Thứ 7 kế sau khi nhảy qua M
	await seedDatedClass(page, {
		name: "IELTS T3-T7 18h",
		startDate: s0,
		schedule: { days: [1, 5], start: "18:00", end: "19:30" },
		sessionsTotal: 4,
		students: { teacherEmail, names: ["Cường Lê"] },
	});
	// Lớp phụ có buổi đúng ngày M — để kỳ nghỉ #1 tạo được qua UI (phải trúng
	// ít nhất 1 buổi thì nút xác nhận mới mở).
	await seedDatedClass(page, {
		name: "Lớp phụ T3",
		startDate: M,
		schedule: { days: [1], start: "19:00", end: "20:30" },
		sessionsTotal: 1,
		students: { teacherEmail, names: ["Dũng Phạm"] },
	});

	// Kỳ nghỉ #1 phủ đúng ngày bù tự nhiên M của lớp chính.
	await gotoWeek(page, mondayWeekStartISO(M));
	const dialog1 = await openHolidayDialog(page);
	await fillHoliday(dialog1, "Nghỉ Tết Dương lịch", M, M);
	const preview1 = dialog1.getByTestId("holiday-preview");
	await expect(preview1).toBeVisible({ timeout: 10_000 });
	await expect(dialog1.getByTestId("holiday-preview-title")).toHaveText(
		"1 buổi sẽ được xử lý",
	);
	await dialog1
		.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
		.click();
	await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
	await expect(dialog1).toBeHidden();

	// Kỳ nghỉ #2 trúng buổi s0+7 của lớp chính → ngày bù tự nhiên M trùng kỳ
	// nghỉ #1 đã lưu → nhảy sang makeupNew với (*) và ghi chú tên kỳ nghỉ.
	await gotoWeek(page, mondayWeekStartISO(addDaysISO(s0, 7)));
	const dialog2 = await openHolidayDialog(page);
	await fillHoliday(
		dialog2,
		"Nghỉ lễ giữa khóa",
		addDaysISO(s0, 7),
		addDaysISO(s0, 7),
	);
	const preview2 = dialog2.getByTestId("holiday-preview");
	await expect(preview2).toBeVisible({ timeout: 10_000 });
	await expect(dialog2.getByTestId("holiday-preview-title")).toHaveText(
		"1 buổi sẽ được xử lý",
	);
	const table2 = preview2.locator("table");
	await expect(table2).toBeVisible();
	await expect(table2).toContainText(
		`Dời sang ${weekdayLabel(makeupNew)}, ${formatDayMonth(makeupNew)}*`,
	);
	await expect(dialog2.getByTestId("holiday-preview-notes")).toContainText(
		`*Lớp IELTS T3-T7 18h: ngày dự kiến ${formatDayMonth(M)} trùng «Nghỉ Tết Dương lịch» nên tự nhảy sang ${weekdayLabel(makeupNew)}, ${formatDayMonth(makeupNew)}/${makeupNew.slice(0, 4)}`,
	);
	await dialog2
		.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
		.click();
	await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
	await expect(dialog2).toBeHidden();

	// Tuần chứa buổi gốc s0+7: nhãn nghỉ lễ + "Đã dời sang" ngày bù mới
	// (tuần này còn có buổi thường s0+11 → lọc đúng block nghỉ lễ).
	await gotoWeek(page, mondayWeekStartISO(addDaysISO(s0, 7)));
	await expect(
		page
			.locator(".lesson-block", { hasText: "IELTS T3-T7 18h" })
			.filter({ hasText: "Nghỉ lễ — Đã dời lịch" }),
	).toContainText(
		`Nghỉ lễ — Đã dời lịch · Nghỉ lễ giữa khóa · Đã dời sang ${formatDayMonth(makeupNew)}`,
	);

	// Tuần chứa M (ngày bị nhảy qua): lớp chính đúng 1 buổi — buổi bù tại
	// makeupNew, không có buổi nào tại M.
	await gotoWeek(page, mondayWeekStartISO(M));
	await expect(
		page.locator(".lesson-block", { hasText: "IELTS T3-T7 18h" }),
	).toHaveCount(1);
});

async function seedClassWithAttendanceToday(page: Page): Promise<string> {
	const teacherEmail = await signUpViaApi(page);
	const dowMon0 = (new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 6) % 7;
	await seedDatedClass(page, {
		name: "Giao tiếp 1",
		startDate: TODAY,
		schedule: { days: [dowMon0], start: "19:00", end: "20:30" },
		sessionsTotal: 4,
		students: { teacherEmail, names: ["Hằng Nguyễn", "Kiệt Trần"] },
	});

	// Điểm danh buổi hôm nay qua /attendance.
	await page.goto(`/attendance?date=${TODAY}`);
	await page.getByRole("button", { name: /Giao tiếp 1/ }).click();
	const groupA = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Hằng Nguyễn",
	});
	await groupA.getByRole("radio", { name: "Có mặt" }).click();
	const groupB = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Kiệt Trần",
	});
	await groupB.getByRole("radio", { name: "Có mặt" }).click();
	await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
	await expect(page.getByText("Đã lưu điểm danh")).toBeVisible();
	return teacherEmail;
}

test("AC-002 (1440×900): buổi đã điểm danh trong khoảng nghỉ → Giữ nguyên — Đã diễn ra, không bị dời", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await seedClassWithAttendanceToday(page);

	await gotoWeek(page, mondayWeekStartISO(TODAY));
	const dialog = await openHolidayDialog(page);
	await fillHoliday(dialog, "Nghỉ lễ 20/11", TODAY, addDaysISO(TODAY, 7));
	const preview = dialog.getByTestId("holiday-preview");
	await expect(preview).toBeVisible({ timeout: 10_000 });

	// Chỉ buổi tuần sau được dời; buổi đã điểm danh KHÔNG đếm vào tiêu đề.
	await expect(dialog.getByTestId("holiday-preview-title")).toHaveText(
		"1 buổi sẽ được xử lý",
	);
	const table = preview.locator("table");
	await expect(table).toBeVisible();
	const makeup = addDaysISO(TODAY, 28);
	await expect(table).toContainText(
		`Dời sang ${weekdayLabel(makeup)}, ${formatDayMonth(makeup)} · 19:00`,
	);
	await expect(table).toContainText("Đã điểm danh");
	await expect(table).toContainText("Giữ nguyên — Đã diễn ra");

	const confirmBtn = dialog.getByRole("button", {
		name: "Xác nhận áp dụng & Dời buổi",
	});
	await expect(confirmBtn).toBeEnabled();
	await confirmBtn.click();
	await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
	await expect(dialog).toBeHidden();

	// Buổi hôm nay vẫn hiện ca đã điểm danh, nguyên trạng.
	await page.goto(`/attendance?date=${TODAY}`);
	await expect(page.getByText("Giao tiếp 1")).toBeVisible();
	await expect(page.getByText("Đã điểm danh (2/2 có mặt)")).toBeVisible();
});

for (const viewport of [
	{ width: 768, height: 1024, isMobileCard: false },
	{ width: 375, height: 812, isMobileCard: true },
] as const) {
	test(`AC-002 bảo vệ ca đã điểm danh (${viewport.width}×${viewport.height}): nhãn giữ nguyên ở dạng ${viewport.isMobileCard ? "thẻ" : "bảng"}`, async ({
		page,
	}) => {
		await page.setViewportSize({
			width: viewport.width,
			height: viewport.height,
		});
		await seedClassWithAttendanceToday(page);

		await gotoWeek(page, mondayWeekStartISO(TODAY));
		const dialog = await openHolidayDialog(page);
		await fillHoliday(dialog, "Nghỉ lễ 20/11", TODAY, addDaysISO(TODAY, 7));
		const preview = dialog.getByTestId("holiday-preview");
		await expect(preview).toBeVisible({ timeout: 10_000 });

		if (viewport.isMobileCard) {
			const cardList = preview.locator("ul");
			await expect(cardList).toBeVisible();
			// 1 thẻ shift + 1 thẻ kept — thẻ kept giữ nguyên cả 2 nhãn (D4).
			await expect(cardList.locator("li")).toHaveCount(2);
			const keptCard = cardList.locator("li").filter({
				hasText: "Giữ nguyên — Đã diễn ra",
			});
			await expect(keptCard).toContainText("Đã điểm danh");
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow).toBe(false);
		} else {
			const table = preview.locator("table");
			await expect(table).toBeVisible();
			await expect(table).toContainText("Đã điểm danh");
			await expect(table).toContainText("Giữ nguyên — Đã diễn ra");
		}

		await dialog
			.getByRole("button", { name: "Xác nhận áp dụng & Dời buổi" })
			.click();
		await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
		await expect(dialog).toBeHidden();
		await page.goto(`/attendance?date=${TODAY}`);
		await expect(page.getByText("Đã điểm danh (2/2 có mặt)")).toBeVisible();
	});
}
