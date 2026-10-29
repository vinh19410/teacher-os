import { expect, type Page, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * Command palette ⌘K trên topbar (phase 8 redesign) — tính năng mới thay ô
 * tìm kiếm inline v1.
 *
 * Load-bearing facts:
 * - Palette đọc snapshot kernel đã có ở client (không gọi API mới), nên sau
 *   khi seed phải reload để snapshot mới hiện kết quả.
 * - ⌘K/Ctrl+K mở toàn cục (ControlOrMeta phủ cả macOS lẫn CI Linux); Enter
 *   chọn kết quả đang highlight và điều hướng bằng TanStack router tới
 *   /students/$id; Escape đóng qua Dialog của base-ui.
 * - Item mang data-testid="command-search-item", empty state là
 *   data-testid="command-search-empty" (spec global-search cùng dùng).
 */
const CLASS_NAME = "E2E Cmd Tìm Lớp";
const STUDENT_NAME = "Nguyễn Minh CmdK";
let currentTeacherEmail = "";

test.beforeEach(async ({ page }) => {
	currentTeacherEmail = await signUpViaUi(page);
});

test("trigger 'Tìm kiếm… ⌘K' trên header mở palette", async ({ page }) => {
	await page.getByTestId("command-search-trigger").click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(page.getByPlaceholder("Tìm học viên, lớp học…")).toBeVisible();
});

test("⌘K mở palette, Escape đóng", async ({ page }) => {
	// Trigger visible = CommandSearch đã mount — ⌘K bấm trước mount bị mất.
	await expect(page.getByTestId("command-search-trigger")).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();
});

test("⌘K → gõ tên học viên seed → Enter điều hướng tới /students/$id", async ({
	page,
}) => {
	await createClassAndStudent(page);

	await page.keyboard.press("ControlOrMeta+k");
	const input = page.getByPlaceholder("Tìm học viên, lớp học…");
	await expect(input).toBeVisible();
	await input.fill(STUDENT_NAME);
	const item = page
		.getByTestId("command-search-item")
		.filter({ hasText: STUDENT_NAME });
	await expect(item).toBeVisible();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/students\/[^/]+$/);
	await expect(page.getByText(STUDENT_NAME).first()).toBeVisible();
});

/** Reuses the class-operations flow (như global-search.spec): tạo lớp có lịch
 * rồi thêm học viên từ trang lớp — sinh enrollment mà snapshot cần. Chỉ giữ
 * lại assertion phục vụ search. */
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
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
}
