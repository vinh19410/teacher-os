import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	gotoWeek,
	mondayWeekStartISO,
	signUpViaUi,
	vietnamTodayISO,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-11 / issue #445 — Tạo lịch nghỉ chung, xem trước và dời buổi (+1 buổi cuối khóa).
 *
 * Kịch bản AC-001 (lưu ý M1: vế thông báo ở ticket này tạo dòng `notif` tổ chức;
 * Email/In-app học viên thuộc TOS-19):
 * 1. Đăng nhập GV, mở `/schedule`, bấm `+ Tạo lịch nghỉ`.
 * 2. Nhập tên 1 ký tự → thấy lỗi inline, nút xác nhận khóa. Sửa thành "Nghỉ lễ 20/11".
 * 3. Chọn khoảng ngày trúng 1 buổi của mỗi lớp (Lớp T6 2 học viên active, Lớp T3-T7),
 *    phạm vi toàn tổ chức, phương thức Dời lịch.
 * 4. Bảng xem trước có 2 dòng với ngày gốc và ngày bù đúng thứ + giờ chuẩn.
 * 5. Bấm `Xác nhận áp dụng & Dời buổi` → Toast thành công.
 * 6. Lịch tuần chứa ngày nghỉ hiện nhãn "Nghỉ lễ — Đã dời lịch"; tuần chứa ngày bù có buổi mới.
 * 7. `/attendance?date=<ngày nghỉ>` không còn ca của 2 lớp đó.
 * 8. Qua `/api/kernel`: số buổi `completed` và không-`holiday` từng enrollment giữ nguyên (BR-003);
 *    có 1 dòng `notif` mới của tổ chức.
 * 9. Kiểm tra ở 3 viewport (1440×900, 768×1024, 375×812) và bảng dạng thẻ ở 375px.
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

interface SnapshotShape {
	lessons: Array<{ enrollmentId: string; status: string }>;
	notifs: Array<{ text: string }>;
}

async function fetchKernelSnapshot(page: Page): Promise<SnapshotShape> {
	const res = await page.request.get(`${API_ORIGIN}/api/kernel`, {
		headers: { Origin: WEB_ORIGIN },
	});
	expect(res.status()).toBe(200);
	return (await res.json()) as SnapshotShape;
}

function countsByEnrollment(snapshot: SnapshotShape) {
	const map = new Map<string, { completed: number; nonHoliday: number }>();
	for (const row of snapshot.lessons) {
		const cur = map.get(row.enrollmentId) ?? { completed: 0, nonHoliday: 0 };
		if (row.status === "completed") cur.completed += 1;
		if (row.status !== "holiday") cur.nonHoliday += 1;
		map.set(row.enrollmentId, cur);
	}
	return map;
}

test("AC-001 (1440×900): tạo lịch nghỉ chung, xem trước, dời buổi (+1 buổi cuối khóa), BR-003 và /attendance", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const teacherEmail = await signUpViaUi(page);

	const f1 = firstUpcomingFridayISO(TODAY);
	// Lớp T6 (days: [4], 4 buổi: f1, f2=f1+7, f3=f1+14, f4=f1+21) -> bù f5=f1+28
	const f2 = addDaysISO(f1, 7);
	const f5 = addDaysISO(f1, 28);
	// Lớp T3 & T7 (days: [1, 5], startDate f1, 4 buổi: s1=f1+1, t2=f1+4, s2=f1+8, t3=f1+11) -> bù s3=f1+15
	const s2 = addDaysISO(f1, 8);
	const s3 = addDaysISO(f1, 15);

	await seedDatedClass(page, {
		name: "IELTS T6 19h",
		startDate: f1,
		schedule: { days: [4], start: "19:00", end: "20:30" },
		sessionsTotal: 4,
		students: {
			teacherEmail,
			names: ["An Nguyễn", "Bình Trần"],
		},
	});
	await seedDatedClass(page, {
		name: "IELTS T3-T7 18h",
		startDate: f1,
		schedule: { days: [1, 5], start: "18:00", end: "19:30" },
		sessionsTotal: 4,
		students: {
			teacherEmail,
			names: ["Cường Lê"],
		},
	});

	const snapBefore = await fetchKernelSnapshot(page);
	const countsBefore = countsByEnrollment(snapBefore);
	const notifsBefore = snapBefore.notifs.length;

	// 1. Mở /schedule tại tuần chứa ngày nghỉ f2, bấm + Tạo lịch nghỉ.
	await gotoWeek(page, mondayWeekStartISO(f2));
	await page.getByTestId("holiday-open").click();

	const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("holiday-name")).toBeFocused();

	// Keyboard: Esc đóng hộp thoại, mở lại focus vào ô Tên.
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await page.getByTestId("holiday-open").click();
	await expect(dialog).toBeVisible();
	await expect(dialog.getByTestId("holiday-name")).toBeFocused();

	const confirmBtn = dialog.getByRole("button", {
		name: "Xác nhận áp dụng & Dời buổi",
	});
	// 2. Nhập tên 1 ký tự -> lỗi inline, nút xác nhận khóa. Sửa thành "Nghỉ lễ 20/11".
	await dialog.getByTestId("holiday-name").fill("N");
	await expect(dialog.getByText(/Tên từ 2–100 ký tự/)).toBeVisible();
	await expect(confirmBtn).toBeDisabled();

	await dialog.getByTestId("holiday-name").fill("Nghỉ lễ 20/11");

	// 3. Chọn khoảng ngày [f2, s2] trúng 1 buổi mỗi lớp, phạm vi toàn tổ chức, phương thức Dời lịch.
	await dialog.getByTestId("holiday-from").fill(f2);
	await dialog.getByTestId("holiday-to").fill(s2);

	// 4. Bảng xem trước có 2 dòng với ngày gốc và ngày bù đúng thứ + giờ chuẩn.
	const preview = dialog.getByTestId("holiday-preview");
	await expect(preview).toBeVisible({ timeout: 10_000 });
	const desktopTable = preview.locator("table");
	await expect(desktopTable).toBeVisible();
	const rows = desktopTable.locator("tbody tr");
	await expect(rows).toHaveCount(2);

	await expect(desktopTable).toContainText("IELTS T3-T7 18h");
	await expect(desktopTable).toContainText(`${formatDayMonth(s2)} · Buổi 3`);
	await expect(desktopTable).toContainText(
		`Dời sang Thứ 7, ${formatDayMonth(s3)} · 18:00`,
	);

	await expect(desktopTable).toContainText("IELTS T6 19h");
	await expect(desktopTable).toContainText(`${formatDayMonth(f2)} · Buổi 2`);
	await expect(desktopTable).toContainText(
		`Dời sang Thứ 6, ${formatDayMonth(f5)} · 19:00`,
	);

	// 5. Bấm Xác nhận áp dụng & Dời buổi -> Toast thành công, hộp thoại đóng.
	await expect(confirmBtn).toBeEnabled();
	await confirmBtn.click();
	await expect(page.getByText(/Đã dời 2 buổi của 2 lớp/)).toBeVisible();
	await expect(dialog).toBeHidden();

	// 6. Lịch tuần chứa ngày nghỉ hiện nhãn "Nghỉ lễ — Đã dời lịch" + "Đã dời sang dd/MM".
	await expect(
		page.locator(".lesson-block", { hasText: "IELTS T6 19h" }),
	).toContainText(
		`Nghỉ lễ — Đã dời lịch · Nghỉ lễ 20/11 · Đã dời sang ${formatDayMonth(f5)}`,
	);

	// Tuần chứa ngày bù f5 có buổi mới của IELTS T6 19h.
	await gotoWeek(page, mondayWeekStartISO(f5));
	await expect(
		page.locator(".lesson-block", { hasText: "IELTS T6 19h" }),
	).toBeVisible();

	// 7. /attendance?date=<ngày nghỉ> không còn ca của 2 lớp đó.
	await page.goto(`/attendance?date=${f2}`);
	await expect(page.getByText("IELTS T6 19h")).toHaveCount(0);
	await page.goto(`/attendance?date=${s2}`);
	await expect(page.getByText("IELTS T3-T7 18h")).toHaveCount(0);

	// 8. Qua API kernel: BR-003 (số buổi completed và không-holiday giữ nguyên) + 1 notif mới.
	const snapAfter = await fetchKernelSnapshot(page);
	const countsAfter = countsByEnrollment(snapAfter);
	for (const [enrId, before] of countsBefore.entries()) {
		expect(countsAfter.get(enrId)).toEqual(before);
	}
	expect(snapAfter.notifs.length).toBe(notifsBefore + 1);
	expect(
		snapAfter.notifs.some((n) =>
			n.text.includes("Lịch nghỉ «Nghỉ lễ 20/11»: dời 2 buổi của 2 lớp"),
		),
	).toBe(true);
});

for (const viewport of [
	{ width: 768, height: 1024, isMobileCard: false },
	{ width: 375, height: 812, isMobileCard: true },
] as const) {
	test(`AC-001 (${viewport.width}×${viewport.height}): tạo lịch nghỉ và xem trước responsive`, async ({
		page,
	}) => {
		await page.setViewportSize({
			width: viewport.width,
			height: viewport.height,
		});
		const teacherEmail = await signUpViaUi(page);

		const f1 = firstUpcomingFridayISO(TODAY);
		const f2 = addDaysISO(f1, 7);
		const f5 = addDaysISO(f1, 28);

		await seedDatedClass(page, {
			name: "IELTS Responsive T6",
			startDate: f1,
			schedule: { days: [4], start: "19:00", end: "20:30" },
			sessionsTotal: 4,
			students: {
				teacherEmail,
				names: ["Minh Học Viên"],
			},
		});

		await gotoWeek(page, mondayWeekStartISO(f2));
		await page.getByTestId("holiday-open").click();

		const dialog = page.getByRole("dialog", { name: "Tạo lịch nghỉ" });
		await expect(dialog).toBeVisible();

		await dialog.getByTestId("holiday-name").fill("N");
		await expect(dialog.getByText(/Tên từ 2–100 ký tự/)).toBeVisible();
		const confirmBtn = dialog.getByRole("button", {
			name: "Xác nhận áp dụng & Dời buổi",
		});
		await expect(confirmBtn).toBeDisabled();

		await dialog.getByTestId("holiday-name").fill("Nghỉ lễ 20/11");
		await dialog.getByTestId("holiday-from").fill(f2);
		await dialog.getByTestId("holiday-to").fill(f2);

		const preview = dialog.getByTestId("holiday-preview");
		await expect(preview).toBeVisible({ timeout: 10_000 });

		if (viewport.isMobileCard) {
			const cardList = preview.locator("ul");
			await expect(cardList).toBeVisible();
			await expect(cardList.locator("li")).toHaveCount(1);
			await expect(cardList).toContainText(
				`Dời sang Thứ 6, ${formatDayMonth(f5)} · 19:00`,
			);
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow).toBe(false);
		} else {
			const table = preview.locator("table");
			await expect(table).toBeVisible();
			await expect(table).toContainText(
				`Dời sang Thứ 6, ${formatDayMonth(f5)} · 19:00`,
			);
		}

		await confirmBtn.click();
		await expect(page.getByText(/Đã dời 1 buổi của 1 lớp/)).toBeVisible();
		await expect(dialog).toBeHidden();
	});
}
