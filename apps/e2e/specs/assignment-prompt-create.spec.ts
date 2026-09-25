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

	// "Tạo đề khác" returns to the form (#213: the create page no longer
	// shows the bank — persistence is asserted on the assignments page instead).
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.goto("/assignments");
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(page.getByText("Sẵn sàng").first()).toBeVisible();

	// Persist for real: a full reload keeps the prompt in the list.
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
	await page.goto("/assignments");
	await expect(page.getByText("QC-202 Bản nháp").first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();
});

test("preview as a student, return to the form without losing it, then save ready", async ({
	page,
}) => {
	const TITLE = "QC-202 Preview Flow";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Nội dung đề")
		.fill("Some people believe that preview should match the student view…");

	// Preview is a page handoff now, not an inline paper.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(
		page.getByText(/Some people believe that preview/).first(),
	).toBeVisible();
	await expect(
		page.getByText("Bản xem trước — bài làm không được lưu."),
	).toBeVisible();
	await expect(page.getByText("Bài làm của học viên (mô phỏng)")).toBeVisible();

	// readPreviewDraft must not clear: reload keeps the paper.
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();

	// Back to composing: the form survives the round trip.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await expect(page.getByLabel("Nội dung đề")).toHaveValue(
		/Some people believe that preview/,
	);

	// And the restored form still saves for real.
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await page.goto("/assignments");
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a ready reading prompt with answer key, survive reload", async ({
	page,
}) => {
	const TITLE = "QC-218 Reading TFNG";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	// Select Reading skill
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText("Reading Academic")).toBeVisible();

	// Title
	await page.getByLabel("Tiêu đề").fill(TITLE);

	// Submit ready prompt
	const submitBtn = page
		.getByRole("button", { name: "Lưu vào ngân hàng" })
		.first();
	await expect(submitBtn).toBeEnabled();
	await submitBtn.click();

	// Success card assertions
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 8/8 đáp án đã khóa")).toBeVisible();

	// Assert preview does not leak answers
	expect(await page.getByText("1 FALSE").count()).toBe(0);
	expect(
		await page.getByText("Đáp án đúng · học viên không thấy").count(),
	).toBe(0);

	// Navigate to assignments and filter by Reading
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();

	// Persist across reload
	await page.reload();
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a listening draft without audio; ready is blocked", async ({
	page,
}) => {
	const TITLE = "QC-218 Listening Draft";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	// Select Listening skill
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);

	// Ready mode is blocked because audio is missing
	await page.getByRole("button", { name: "Sẵn sàng giao" }).click();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu file nghe")).toBeVisible();

	// Use sample audio unlocks ready
	await page
		.getByRole("button", { name: "Dùng file mẫu Cambridge 10" })
		.click();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();

	// Clear first question answer blocks ready
	await page.getByLabel("Đáp án chấm tự động").first().fill("");
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu đáp án chấm tự động")).toBeVisible();

	// Restore answer and remove audio
	await page.getByLabel("Đáp án chấm tự động").first().fill("Clarke");
	await page.getByRole("button", { name: "Gỡ file" }).click();

	// Switch to draft mode allows saving without audio
	await page.getByRole("button", { name: "Bản nháp" }).click();
	const draftSubmit = page
		.getByRole("button", { name: "Lưu bản nháp" })
		.first();
	await expect(draftSubmit).toBeEnabled();
	await draftSubmit.click();

	// Success card assertions
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();
	await expect(page.getByText("Chưa đính file").first()).toBeVisible();
	await expect(page.getByText("Tự động · 6/6 đáp án đã khóa")).toBeVisible();

	// Check assignments page
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();
});
