import { expect, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * Scenario for D2 & Issue #253:
 * A student seeded without class has no package row.
 * The UI renders "Chưa có lớp" on /students and "Chưa có gói" on /tuition.
 * When enrolled into a class, enrollment starts as 'invited' (still no package).
 * Once teacher activates the enrollment via 'Kích hoạt', the session package is generated.
 */
test("học viên chưa lớp: 'Chưa có lớp' → enroll lớp 'Đã mời' → kích hoạt 'Đang học' tạo package", async ({
	page,
}) => {
	const STUDENT_NAME = "QC-240 No Class";
	const STUDENT_EMAIL = `noclass.${Date.now()}@e2e.test`;
	const CLASS_NAME = "E2E Class for No-Class Student";

	// 1. Sign-up teacher
	const teacherEmail = await signUpViaUi(page);

	// 2. Seed student without class
	await seedStudent({ teacherEmail, name: STUDENT_NAME, email: STUDENT_EMAIL });

	// 3. Students list: row shows "Chưa có lớp"
	await page.goto("/students");
	const studentRow = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(studentRow).toBeVisible();
	await expect(studentRow.getByText("Chưa có lớp")).toBeVisible();

	// 4. Student detail: shows Email and the empty class card
	await studentRow.getByText(STUDENT_NAME).click();
	await expect(page.getByText(`Email: ${STUDENT_EMAIL}`)).toBeVisible();
	await expect(page.getByText("Chưa tham gia lớp học nào.")).toBeVisible();

	// 5. Tuition page: row shows "Chưa có gói", no "Sắp hết" badge
	await page.goto("/tuition");
	const tuitionRow = page.getByRole("row").filter({ hasText: STUDENT_NAME });
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("Chưa có gói")).toBeVisible();
	await expect(tuitionRow.getByText("Sắp hết")).toHaveCount(0);

	// 6. Create a class
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

	// 7. Enroll student into class: starts as 'Đã mời'
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	await expect(page.getByText("Đã mời")).toBeVisible();

	// 8. Activate student via "Kích hoạt"
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();

	// 9. Tuition page: package now generated and visible
	await page.goto("/tuition");
	const activeTuitionRow = page
		.getByRole("row")
		.filter({ hasText: STUDENT_NAME });
	await expect(activeTuitionRow).toBeVisible();
	await expect(activeTuitionRow.getByText("Chưa có gói")).toHaveCount(0);
});
