import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * Issue #315: modal Tạo lớp cảnh báo realtime (không chặn) khi lịch chọn
 * trùng thứ + giao giờ + giao khoảng ngày với lớp đang chạy.
 *
 * Load-bearing facts:
 * - Default draft là 19:00–20:30, 12 buổi, bắt đầu ngày mai — tạo lớp
 *   T2&T4 19:00–20:30 xong rồi mở lại modal, chọn T2 là trùng đủ 3 điều kiện.
 * - Warning là role="status" + data-testid="schedule-conflict-warning";
 *   nút Tạo lớp vẫn bấm được (cảnh báo, không chặn).
 * - Đổi giờ sang mép chạm (20:30–22:00 vs 19:00–20:30) → warning biến mất.
 */
test("create-class warns on schedule conflict without blocking (issue #315)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E CONFLICT Foundation";

	await signUpViaApi(page);
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);

	// Lớp đang chạy: T2 & T4 19:00–20:30 (mặc định giờ + tổng buổi).
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	let dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();
	await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	await dialog.getByRole("button", { name: "T4", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText(CLASS_NAME)).toBeVisible();

	// Mở lại modal: draft T2 19:00–20:30 → warning tên lớp vừa tạo.
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();
	await dialog.getByLabel("Tên lớp *").fill("E2E CONFLICT Second");
	await dialog.getByRole("button", { name: "T2", exact: true }).click();

	const warning = dialog.getByTestId("schedule-conflict-warning");
	await expect(warning).toBeVisible();
	await expect(warning).toContainText("Lịch bị trùng với lớp đang học");
	await expect(warning).toContainText(CLASS_NAME);
	await expect(warning).toContainText("19:00–20:30");
	// Không chặn: submit vẫn enabled.
	await expect(
		dialog.getByRole("button", { name: "Tạo lớp", exact: true }),
	).toBeEnabled();

	// Dời giờ sang mép chạm (20:30–22:00) → không còn giao giờ → warning mất.
	await dialog.getByLabel("Giờ bắt đầu").fill("20:30");
	await expect(warning).toHaveCount(0);
	await expect(
		dialog.getByRole("button", { name: "Tạo lớp", exact: true }),
	).toBeEnabled();
});
