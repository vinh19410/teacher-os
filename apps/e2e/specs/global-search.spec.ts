import { expect, type Page, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * Hợp đồng tìm kiếm toàn cục sau phase 8: ô inline trên topbar đã thay bằng
 * command palette ⌘K (xem teacher-command-search.spec cho luồng phím tắt và
 * Enter → /students/$id). Spec này giữ các hành vi hợp đồng còn lại:
 *
 * - Org mới chưa có dữ liệu → gõ gì cũng ra empty state, không treo
 *   "Đang tải…" (palette đọc snapshot client, không gọi API mới).
 * - Không khớp → "Không tìm thấy" thay vì im lặng; assertion scope vào TEXT
 *   của item nên dropdown render-rỗng không thể pass.
 * - Click kết quả lớp → điều hướng /classes/$id bằng router thật.
 * - Escape đóng palette.
 *
 * Testid: item = command-search-item, empty = command-search-empty.
 */
const CLASS_NAME = "E2E Tìm Lớp";
const STUDENT_NAME = "Nguyễn Minh E2E";
let currentTeacherEmail = "";
test.beforeEach(async ({ page }) => {
	currentTeacherEmail = await signUpViaUi(page);
	// Fresh-org proof: query không khớp gì phải ra empty state trước khi tạo
	// dữ liệu — chứng tỏ không có row rác nào đáp ứng query bên dưới.
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("zzz-khong-co");
	await expect(page.getByTestId("command-search-empty")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();
});

test("không match → hiện 'Không tìm thấy' thay vì im lặng", async ({
	page,
}) => {
	await createClassAndStudent(page);
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("minh co lon");
	await expect(page.getByTestId("command-search-empty")).toBeVisible();
	await expect(page.getByTestId("command-search-item")).toHaveCount(0);
});

test("gõ tên lớp → click kết quả lớp điều hướng tới trang lớp", async ({
	page,
}) => {
	await createClassAndStudent(page);
	await page.keyboard.press("ControlOrMeta+k");
	const input = page.getByPlaceholder("Tìm học viên, lớp học…");
	await input.fill("tim lop");
	const item = page
		.getByTestId("command-search-item")
		.filter({ hasText: CLASS_NAME });
	await expect(item).toBeVisible();
	await item.click();
	await expect(page).toHaveURL(/\/classes\/[^/]+$/);
	await expect(page.getByText(CLASS_NAME).first()).toBeVisible();
});

test("Escape đóng palette", async ({ page }) => {
	await createClassAndStudent(page);
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByPlaceholder("Tìm học viên, lớp học…").fill("minh");
	await expect(page.getByTestId("command-search-item").first()).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();
});

/** Reuses the class-operations flow: create a scheduled class, then add a
 * student from the class detail — this generates the enrollments the
 * snapshot needs. Kept minimal: only the assertions the search spec needs. */
async function createClassAndStudent(page: Page) {
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
