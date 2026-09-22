import { expect, test } from "@playwright/test";
import { createStudentViaUi, signUpViaUi } from "./helpers";

/**
 * Issue #208 — Giao bài trên lớp:
 * class detail → tab Bài tập → assign view → submit → success → list view with
 * derived submission status → reload → verify "Đã dùng 1 lớp" in bank → reassign
 * warning → verify "Đã dùng 1 lớp" stays distinct after reassign.
 */
test("class detail → assign prompt → verify list, bank tag, and reassign", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 208 Lớp Writing";
	const STUDENT_NAME = "QC-208 Học viên";
	const PROMPT_TITLE = "QC-208 Prompt Ready";

	// 1. Sign-up
	await signUpViaUi(page);

	// 2. Create student
	await page.getByText("Học viên", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await createStudentViaUi(page, STUDENT_NAME);

	// 3. Create class
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 4. Enroll student into class
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	// 5. Create 1 ready prompt and 1 draft prompt in the bank
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await page
		.getByLabel("Nội dung đề")
		.fill("Some people think that university education should be free...");
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-208 Draft Prompt");
	await page
		.getByLabel("Nội dung đề")
		.fill("Draft body not ready to assign...");
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();

	// 6. Go to class detail → tab Bài tập
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);

	// Initial stats: open assignments = 0
	await expect(page.getByText("bài đang mở")).toBeVisible();
	await expect(page.getByText("đã nộp trên bài mở")).toBeVisible();

	// Tab "Bài tập"
	await page.getByRole("tab", { name: "Bài tập", exact: true }).click();
	await expect(page.getByText("Chưa giao bài nào cho lớp này.")).toBeVisible();

	// 7. Click "Giao bài tập"
	await page.getByRole("button", { name: "Giao bài tập" }).first().click();

	// Picker shows ready prompt, but DOES NOT show draft prompt
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(page.getByText("QC-208 Draft Prompt")).toHaveCount(0);

	// Select ready prompt
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();

	// Action bar copy reflects selection
	await expect(page.getByText("Giao cho 1 học viên")).toBeVisible();

	// 8. Submit assignment
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();

	// 9. Success view
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await expect(page.getByText("0/1", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 10. Click "Xem bài đã giao" → List view
	await page.getByRole("button", { name: "Xem bài đã giao" }).click();
	await expect(page.getByText("Bài đã giao lớp này")).toBeVisible();
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(page.getByText("Đang mở").first()).toBeVisible();
	await expect(page.getByText("Chưa có bài nộp").first()).toBeVisible();
	await expect(page.getByText("Chưa nộp").first()).toBeVisible();

	// 11. Full reload keeps the assignment (tab resets to roster, switch to Bài tập)
	await page.reload();
	await page.getByRole("tab", { name: "Bài tập", exact: true }).click();
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(page.getByText("Đang mở").first()).toBeVisible();

	// 12. Go to /assignments/bank → prompt has tag "Đã dùng 1 lớp"
	await page.goto("/assignments/bank");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã dùng 1 lớp")).toBeVisible();

	// 13. Return to class → reassign the SAME prompt to the SAME class
	await page.goto("/classes");
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);
	await page.getByRole("tab", { name: "Bài tập", exact: true }).click();
	await page.getByRole("button", { name: "Giao thêm đề" }).click();

	// Pick same prompt → warning note appears
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await expect(page.getByText("Đề này đã giao lớp này, hạn")).toBeVisible();
	await expect(
		page.getByText("Giao lại sẽ thêm lượt mới cho học viên đã chọn."),
	).toBeVisible();

	// Submit reassign
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Xem bài đã giao" }).click();

	// Now there are 2 items in class assignments
	const items = page.locator(".assign-item");
	await expect(items).toHaveCount(2);

	// 14. Return to /assignments/bank: tag MUST STILL BE "Đã dùng 1 lớp" (distinct classId)
	await page.goto("/assignments/bank");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã dùng 1 lớp")).toBeVisible();
	await expect(page.getByText("Đã dùng 2 lớp")).toHaveCount(0);
});
