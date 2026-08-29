import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #105 [QC][P1]: create-class must reject end-before-start times and
 * a sessions total of 0 (the old `parseInt(total) || 12` coercion silently
 * turned 0 into 12).
 *
 * Load-bearing facts (verified against the DOM):
 * - Field injects label→input association, so getByLabel targets each input.
 * - Default form state is 19:00–20:30 and 12 buổi, start tomorrow.
 * - The modal stays open with a role="alert" error when validation blocks;
 *   it only closes after the kernel refresh applies a successful create.
 */
test("create-class blocks end ≤ start and sessions 0 (issue #105)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E QC-TEST-CLASS";

	await signUpViaUi(page);

	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();
	await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();

	// QC repro 1: end BEFORE start (21:00 → 08:00) must be blocked.
	await dialog.getByLabel("Giờ bắt đầu").fill("21:00");
	await dialog.getByLabel("Giờ kết thúc").fill("08:00");
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Giờ kết thúc phải sau giờ bắt đầu.",
	);
	await expect(dialog).toBeVisible();

	// QC repro 2: sessions 0 must be blocked — never coerced to 12.
	await dialog.getByLabel("Giờ kết thúc").fill("22:00");
	await dialog.getByLabel("Tổng số buổi").fill("0");
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog.getByRole("alert")).toHaveText(
		"Tổng số buổi phải từ 1 đến 52.",
	);
	await expect(dialog).toBeVisible();
	// The rejected submits must not have created anything server-side.
	await expect(page.getByText("0/12 buổi")).toHaveCount(0);

	// Valid input recovers: the class is created with the requested total.
	await dialog.getByLabel("Tổng số buổi").fill("12");
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText("0/12 buổi")).toBeVisible();
});
