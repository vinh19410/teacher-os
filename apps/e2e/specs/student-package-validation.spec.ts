import { expect, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * E2E scenarios for student package and enrollment validation:
 * - Enroll existing student has no package inputs (derived by server) (D4)
 * - Enrolled student derives package from class on activation, detail displays class (D1)
 */

test("class detail → enroll học viên có sẵn KHÔNG có input gói, chọn học viên là enroll được (D4)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 240 Lớp enroll";
	const STUDENT_NAME = "QC-240 Enrollable";

	const teacherEmail = await signUpViaUi(page);

	// Tạo học viên trước bằng helper seed
	await seedStudent({ teacherEmail, name: STUDENT_NAME });

	// Tạo lớp học
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
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

	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByText("Thêm học viên vào lớp", { exact: true }),
	).toBeVisible();

	// Modal enroll KHÔNG có 3 input gói (D4)
	await expect(dialog.getByLabel("Số buổi gói")).not.toBeVisible();
	await expect(dialog.getByLabel("Đơn giá (VND)")).not.toBeVisible();
	await expect(dialog.getByLabel("Hình thức")).not.toBeVisible();

	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();

	// Chọn học viên → click Lưu → enroll thành công, dialog đóng
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(
		page.locator("tbody tr", { hasText: STUDENT_NAME }),
	).toBeVisible();
});

test("enroll học viên vào lớp → kích hoạt derive gói từ lớp, detail hiển thị lớp học (D1)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 240 Lớp Derive";
	const STUDENT_NAME = "QC-240 Student Derive";
	const STUDENT_EMAIL = "derive@e2e.test";

	const teacherEmail2 = await signUpViaUi(page);

	// Seed học viên vào org của teacher 2
	await seedStudent({
		teacherEmail: teacherEmail2,
		name: STUDENT_NAME,
		email: STUDENT_EMAIL,
		phone: "0908888999",
	});

	// Tạo lớp có Học phí = 500.000đ và 12 buổi
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByLabel("Học phí / học viên (VND)").fill("500000");
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// Vào lớp -> "+ Thêm học viên vào lớp"
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const dialog = page.getByRole("dialog");
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// Roster hiện học viên và kích hoạt
	await expect(
		page.locator("tbody tr", { hasText: STUDENT_NAME }),
	).toBeVisible();
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();

	// List học viên: hàng hiển thị lớp đã enroll
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	const row = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(row.getByText(CLASS_NAME)).toBeVisible();

	// Vào detail học viên -> card "Lớp học" hiện lớp vừa tạo
	await row.getByText(STUDENT_NAME).click();
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText(`Email: ${STUDENT_EMAIL}`)).toBeVisible();

	// Trang Doanh thu (#343 — menu /tuition đổi tên): derive gói từ lớp
	// (12 buổi, trạng thái Đang học)
	await page.getByText("Doanh thu", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	const tuitionRow = page.getByRole("row").filter({ hasText: STUDENT_NAME });
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("0/12")).toBeVisible();
	await expect(tuitionRow.getByText("Đang học")).toBeVisible();
});
