import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #202 — bank-first assignment prompt creation: compose → save to the
 * bank → see it listed → survive a reload. Both statuses (ready + draft)
 * must create real kernel rows.
 */
test("create a ready prompt, list it, and survive reload", async ({ page }) => {
	const TITLE = "QC-202 Discuss both views";

	await signUpViaUi(page);
	await page.goto("/assignments");
	await page.getByRole("button", { name: "+ Tạo bài tập" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);

	// Design v3 defaults: Task 2 · Discuss both views pre-filled.
	await expect(page.getByRole("heading", { name: TITLE })).toBeHidden();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }),
	).toBeEnabled();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Nội dung đề")
		.fill(
			"Some people think that all university students should study whatever they like.\n\nDiscuss both these views and give your own opinion.",
		);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();

	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// "Tạo đề khác" returns to the form; the new prompt shows in "Đề đã có".
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	const bankItem = page.getByText(TITLE).first();
	await expect(bankItem).toBeVisible();
	await expect(page.getByText("Sẵn sàng").first()).toBeVisible();

	// Persist for real: a full reload keeps the prompt in the bank.
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a draft prompt with the draft tag", async ({ page }) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-202 Bản nháp");
	await page
		.getByLabel("Nội dung đề")
		.fill("Some people believe that unpaid community service…");
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();

	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await expect(page.getByText("QC-202 Bản nháp").first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();
});
