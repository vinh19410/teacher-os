import { expect, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * Global search on the topbar (issue #109) — P1: typing + Enter used to be a
 * silent no-op (no dropdown, no navigation, no empty state).
 *
 * Load-bearing facts:
 * - The dropdown matches client-side from the kernel snapshot, so results
 *   render synchronously from input state (no API round-trip to wait for).
 * - Each result row carries data-testid="global-search-result-item"; the
 *   empty state is data-testid="global-search-empty". Assertions scope to
 *   item TEXT, not just the container, so a rendered-but-empty dropdown
 *   cannot pass.
 * - signUpViaUi bootstraps a FRESH org — the initial search must show the
 *   empty state, proving no stray seeded rows can satisfy the queries below.
 */
const CLASS_NAME = "E2E Tìm Lớp";
const STUDENT_NAME = "Nguyễn Minh E2E";
let currentTeacherEmail = "";
test.beforeEach(async ({ page }) => {
	currentTeacherEmail = await signUpViaUi(page);
	// Fresh-org proof: an accented-free query that matches nothing must show
	// the empty state before we create any data.
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("zzz-khong-co");
	await expect(page.getByTestId("global-search-empty")).toBeVisible();
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("");
});

test("gõ 'minh' → dropdown hiện đúng học viên → Enter điều hướng tới trang học viên", async ({
	page,
}) => {
	await createClassAndStudent(page);

	const input = page.getByPlaceholder("Tìm học viên, lớp học…");
	await input.fill("minh");
	const item = page
		.getByTestId("global-search-result-item")
		.filter({ hasText: STUDENT_NAME });
	await expect(item).toBeVisible();
	await input.press("Enter");
	await expect(page).toHaveURL(/\/students\/[^/]+$/);
	await expect(page.getByText(STUDENT_NAME).first()).toBeVisible();
});

test("không match → hiện 'Không tìm thấy kết quả' thay vì im lặng", async ({
	page,
}) => {
	await createClassAndStudent(page);
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("minh co lon");
	await expect(page.getByTestId("global-search-empty")).toBeVisible();
	await expect(page.getByTestId("global-search-result-item")).toHaveCount(0);
});

test("gõ tên lớp → click kết quả lớp điều hướng tới trang lớp", async ({
	page,
}) => {
	await createClassAndStudent(page);
	const input = page.getByPlaceholder("Tìm học viên, lớp học…");
	await input.fill("tim lop");
	const item = page
		.getByTestId("global-search-result-item")
		.filter({ hasText: CLASS_NAME });
	await expect(item).toBeVisible();
	await item.click();
	await expect(page).toHaveURL(/\/classes\/[^/]+$/);
	await expect(page.getByText(CLASS_NAME).first()).toBeVisible();
});

test("Escape đóng dropdown", async ({ page }) => {
	await createClassAndStudent(page);
	const input = page.getByPlaceholder("Tìm học viên, lớp học…");
	await input.fill("minh");
	await expect(page.getByTestId("global-search-results")).toBeVisible();
	await input.press("Escape");
	await expect(page.getByTestId("global-search-results")).toBeHidden();
});

/** Reuses the class-operations flow: create a scheduled class, then add a
 * student from the class detail — this generates the enrollments the
 * snapshot needs. Kept minimal: only the assertions the search spec needs. */
async function createClassAndStudent(page: import("@playwright/test").Page) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();
	await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
	await seedStudent({ teacherEmail: currentTeacherEmail, name: STUDENT_NAME });
	await page.getByText(CLASS_NAME).click();
	await page.reload();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
}
