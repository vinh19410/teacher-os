import { expect, test } from "@playwright/test";
import { createStudentViaUi, signUpViaUi } from "./helpers";

/**
 * Scenario for D2: creating a student outside a class (no classId) produces
 * NO session package row. The UI renders "Chưa có gói" across list and
 * tuition pages, with dashes for counts/prices, tuition never badges
 * "Sắp hết", and student detail shows the empty class card.
 */
test("thêm học viên không lớp → hiển thị 'Chưa có gói', không tạo package (D2)", async ({
	page,
}) => {
	const STUDENT_NAME = "QC-240 No Class";
	const STUDENT_EMAIL = "noclass@e2e.test";

	// 1. Sign-up
	await signUpViaUi(page);

	// 2. Create student without class
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await createStudentViaUi(page, STUDENT_NAME, {
		email: STUDENT_EMAIL,
	});

	// 3. Students list: row shows "Chưa có gói" and dashes
	const studentRow = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(studentRow).toBeVisible();
	await expect(studentRow.getByText("Chưa có gói")).toBeVisible();
	await expect(studentRow.getByText("0 buổi · Online")).toHaveCount(0);
	await expect(studentRow.getByText("0 / 0")).toHaveCount(0);

	// 4. Student detail: shows Email and the empty class card
	await studentRow.getByText(STUDENT_NAME).click();
	await expect(page.getByText(`Email: ${STUDENT_EMAIL}`)).toBeVisible();
	// "Lớp học" exact trùng nav sidebar — assert qua empty state (duy nhất)
	await expect(page.getByText("Chưa tham gia lớp học nào.")).toBeVisible();

	// 5. Tuition page: row shows "Chưa có gói", no "Sắp hết" badge, dashes for counts
	await page.getByText("Học phí", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	const tuitionRow = page.getByRole("row").filter({ hasText: STUDENT_NAME });
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("Chưa có gói")).toBeVisible();
	await expect(tuitionRow.getByText("Sắp hết")).toHaveCount(0);
});
