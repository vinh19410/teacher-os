/**
 * Occurrence identity flows (issue #98): a future occurrence can be CANCELLED
 * outright from the Buổi học tab, and the settled state survives a reload.
 * Topic-on-occurrence-k renders the edited topic on ITS row right away and
 * after reload — the mis-fan regression that motivated option 3 of #93.
 *
 * Flow notes:
 * - class seeded with startDate = today via seedDatedClass (session cookies
 *   ride on page.request; Origin must be the Vite origin or CSRF fails).
 * - "Điều chỉnh" entries exist on FUTURE occurrences too (entry gate is
 *   target-based, C5) — the first future Friday slot is the cancel victim;
 * - after cancelling, aggregate badge flips to "Đã hủy" and persists reload.
 */
import { expect, test } from "@playwright/test";
import { signUpViaUi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

test("hủy buổi tương lai từ modal Điều chỉnh → persist sau reload", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Occurrence Cancel ${Date.now()}`;
	const STUDENT_NAME = "Lê Hủy Tươnglai E2E";

	await signUpViaUi(page);

	// Tue+Fri starting today ⇒ two distinct slots; 4 occurrences each week
	// family kept small: total 8 (4 Tue + 4 Fri).
	await seedDatedClass(page, {
		name: CLASS_NAME,
		schedule: { days: [1, 4] },
		startDate: vietnamTodayISO(),
		sessionsTotal: 8,
	});
	await page.reload();
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();

	// Student joins ⇒ lessons exist ⇒ rows become addressable occurrences.
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await page.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await page.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	// Fully-upcoming class: every row offers Điều chỉnh; nothing settled yet.
	const adjustButtons = page.getByRole("button", { name: "Điều chỉnh" });
	await expect(adjustButtons.first()).toBeVisible();

	// Open the modal on a FUTURE row: the LAST occurrence (never today).
	const lastRow = page.locator("tbody tr").last();
	await lastRow.getByRole("button", { name: "Điều chỉnh" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("Hành động cả lớp")).toBeVisible();
	await expect(dialog.getByText(STUDENT_NAME)).toBeVisible();

	// Cancel needs an explicit 2-step confirm listing the affected student.
	await dialog.getByRole("button", { name: "Hủy buổi" }).click();
	const confirmBox = dialog.locator('[role="alertdialog"]');
	await expect(confirmBox.getByText(STUDENT_NAME)).toBeVisible();
	await confirmBox.getByRole("button", { name: "Xác nhận" }).click();

	// ONE toast summary, then badge flip on the same row.
	await expect(page.getByText(/Đã hủy buổi(\.|\s\()/)).toBeVisible();
	await expect(lastRow.getByText("Đã hủy")).toBeVisible();
	// Modal renders BOTH an ✕ (aria-label) and a footer Đóng button.
	await dialog.getByText("Đóng", { exact: true }).click();

	// Persisted server-side across a full reload.
	await page.reload();
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText("Đã hủy", { exact: true })).toHaveCount(1);
});

test("edit topic trên occurrence k hiển thị đúng row k (ngay + sau reload)", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Occurrence Topic ${Date.now()}`;

	await signUpViaUi(page);
	await seedDatedClass(page, {
		name: CLASS_NAME,
		schedule: { days: [1] }, // one weekly slot → k indexes cleanly
		startDate: vietnamTodayISO(),
		sessionsTotal: 4,
	});
	await page.reload();
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await page.getByLabel("Họ tên học viên *").fill("Phạm Topic E2E");
	await page.getByRole("button", { name: "Lưu", exact: true }).click();

	await page.getByRole("button", { name: "Buổi học", exact: true }).click();

	// Edit occurrence #3 (0-based row index 2) with a distinctive topic.
	const targetRow = page.locator("tbody tr").nth(2);
	await targetRow.getByRole("button", { name: "Điều chỉnh" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Chủ đề").fill("Occurrence số ba — chủ đề riêng");
	await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
	await expect(page.getByText("Đã cập nhật buổi.")).toBeVisible();
	// Modal renders BOTH an ✕ (aria-label) and a footer Đóng button.
	await dialog.getByText("Đóng", { exact: true }).click();

	// Row k shows it immediately; other rows keep their default topic view.
	await expect(
		targetRow.getByText("Occurrence số ba — chủ đề riêng"),
	).toBeVisible();
	await expect(page.getByText("Occurrence số ba — chủ đề riêng")).toHaveCount(
		1,
	);

	// Reload persistence: the topic lives on THIS occurrence only.
	await page.reload();
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(
		page
			.locator("tbody tr")
			.nth(2)
			.getByText("Occurrence số ba — chủ đề riêng"),
	).toBeVisible();
});
