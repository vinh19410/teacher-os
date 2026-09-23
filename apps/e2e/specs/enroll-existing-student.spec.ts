import { expect, test } from "@playwright/test";
import { createStudentViaUi, signUpViaUi } from "./helpers";

/**
 * QC scenario for issue #122 (P1): from class detail, "+ Thêm học viên" used
 * to open the create-new form only — there was no way to enroll an EXISTING
 * student, so the class stayed at 0 students. After the fix the modal opens
 * in "Học viên có sẵn" mode (while unenrolled org students exist), enrolling
 * an existing student creates the enrollment + active package + the
 * schedule's lesson series, and the roster/KPI count rises.
 */
test("class detail → picker enroll học viên có sẵn → roster + KPI tăng", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 122 Lớp có sẵn";
	const STUDENT_NAME = "QC-122 E2E";

	// 1. Sign-up (org bootstrap happens on the first GET /api/kernel).
	await signUpViaUi(page);

	// 2. Create the student FIRST, from /students — exactly the QC steps.
	//    The /students modal must stay create-only (no mode toggle).
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const studentsDialog = page.getByRole("dialog");
	await expect(studentsDialog.getByText("Thêm học viên mới")).toBeVisible();
	await expect(
		studentsDialog.getByRole("button", { name: "Học viên có sẵn" }),
	).toHaveCount(0);
	await createStudentViaUi(page, STUDENT_NAME);
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 3. Create a scheduled class (defaults: T2+T4, 12 buổi).
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
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

	// 4. Class detail → + Thêm học viên opens in "Học viên có sẵn" mode
	//    (an unenrolled org student exists) with the picker visible.
	await page.getByText(CLASS_NAME).click();
	await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByText("Thêm học viên", { exact: true }),
	).toBeVisible();
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();

	// 5. Pick the existing student, keep default package fields, save.
	await option.click();
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// 6. Roster shows the student with badge "Đã mời"; KPI active count is 0 (with 1 chờ xác nhận).
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	await expect(page.getByText("Đã mời")).toBeVisible();
	await expect(page.getByText("chờ xác nhận")).toBeVisible();

	// 7. Click "Kích hoạt" on the roster row and confirm in modal.
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();

	// After activation: badge is "Đang học", KPI count is now 1.
	await expect(page.getByText("Đang học")).toBeVisible();
	const kpi = page
		.locator("div")
		.filter({ hasText: "học viên" })
		.filter({
			has: page.getByText("1", { exact: true }),
		});
	await expect(kpi.first()).toBeVisible();

	// 8. The schedule's lesson series was generated for the active enrollment.
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText("Sắp tới").first()).toBeVisible();
	await expect(page.getByText("0/12").first()).toBeVisible();

	// 9. Re-open the modal: with every org student enrolled the picker has
	//    no eligible rows, so the modal falls back to create-new mode.
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await expect(
		dialog.getByText("Thêm học viên mới", { exact: true }),
	).toBeVisible();
	await expect(dialog.getByRole("option", { name: STUDENT_NAME })).toHaveCount(
		0,
	);
});

test("class detail → hủy lời mời → row biến mất khỏi roster, có thể mời lại cùng học viên", async ({
	page,
}) => {
	const CLASS_NAME = "E2E Lớp Hủy Lời Mời";
	const STUDENT_NAME = "QC-Cancel E2E";

	await signUpViaUi(page);

	// 1. Tạo học viên trước
	await page.getByText("Học viên", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await createStudentViaUi(page, STUDENT_NAME);
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 2. Tạo lớp học
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 3. Mời học viên vào lớp
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await option.click();
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// 4. Roster hiển thị học viên với badge "Đã mời" và nút "Hủy lời mời"
	const row = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(row).toBeVisible();
	await expect(row.getByText("Đã mời")).toBeVisible();
	const cancelBtn = row.getByRole("button", { name: "Hủy lời mời" });
	await expect(cancelBtn).toBeVisible();

	// 5. Bấm Hủy lời mời và xác nhận
	await cancelBtn.click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Hủy lời mời tham gia lớp?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Hủy lời mời" }).click();
	await expect(confirmModal).toBeHidden();

	// 6. Row biến mất khỏi roster
	await expect(row).toHaveCount(0);

	// 7. Mời lại cùng học viên: mở lại modal, học viên lại xuất hiện trong picker và mời thành công
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const reEnrollDialog = page.getByRole("dialog");
	const reOption = reEnrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(reOption).toBeVisible();
	await reOption.click();
	await reEnrollDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(reEnrollDialog).toBeHidden();

	// 8. Học viên lại xuất hiện trên roster ở trạng thái Đã mời
	await expect(page.locator("tr", { hasText: STUDENT_NAME })).toBeVisible();
	await expect(
		page.locator("tr", { hasText: STUDENT_NAME }).getByText("Đã mời"),
	).toBeVisible();
});
