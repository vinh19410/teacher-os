import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * QC scenario for issue #104 (P0): creating a student from the /students
 * list (no classId) used to silently drop total/price/mode — the list showed
 * "0 buổi · Online" · "0 / 0" · "0đ" and /tuition showed a 0/0 package with a
 * red "Sắp hết" badge. After the fix the package parks on the student
 * (enrollmentId null) and renders everywhere. This is the only spec covering
 * the no-class creation path; class specs cover the with-classId path.
 */
test("thêm học viên từ list (không lớp) → gói giữ số buổi + đơn giá", async ({
	page,
}) => {
	const STUDENT_NAME = "QC-104 E2E";

	// 1. Sign-up (org bootstrap happens on the first GET /api/kernel).
	await signUpViaUi(page);

	// 2. Create a classless student from the list — exactly the QC steps.
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Thêm học viên mới")).toBeVisible();
	await dialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await dialog.getByLabel("Số buổi gói").fill("10");
	await dialog.getByLabel("Đơn giá (VND)").fill("400000");
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// 3. The row must show the entered package, never the zero package.
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	await expect(page.getByText("10 buổi · Online")).toBeVisible();
	await expect(page.getByText("10 / 10")).toBeVisible();
	await expect(page.getByText("400.000đ")).toBeVisible();

	// 4. /tuition renders the same parked package: 0/10 done (nothing can be
	// checked in without a class), remaining 10 — never the red "Sắp hết"
	// badge that the broken 0/0 state produced. Scope to the student's row:
	// the page's KPI band carries a hardcoded "Gói sắp hết" counter (issue
	// #106) that would otherwise match the badge text.
	await page.getByText("Học phí", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	const tuitionRow = page.getByRole("row").filter({ hasText: STUDENT_NAME });
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("0/10")).toBeVisible();
	await expect(tuitionRow.getByText("Sắp hết")).toHaveCount(0);
	await expect(tuitionRow.getByText("Đang học")).toBeVisible();
});
