/**
 * Ngân hàng tài liệu + tài liệu theo buổi học: giáo viên tạo thư mục, thêm
 * liên kết vào thư mục, gắn liên kết vào một buổi học có ngày, thấy xóa bị
 * chặn khi tài liệu đang dùng, gỡ khỏi buổi rồi xóa tài liệu và thư mục.
 *
 * Lớp seed bằng API (startDate = hôm nay, 1 học viên) để buổi học có dòng
 * lesson mang `date` — điều kiện server nhận gắn tài liệu.
 */
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

async function openFirstSessionMaterials(page: Page, classId: string) {
	await page.goto(`/classes/${classId}`);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const row = page.locator("[data-testid='session-row']").first();
	await row.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const dialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(dialog).toBeVisible();
	return dialog;
}

test("tạo thư mục → thêm liên kết → gắn vào buổi học → gỡ → xóa", async ({
	page,
}) => {
	const stamp = Date.now();
	const FOLDER = `E2E Writing ${stamp}`;
	const TITLE = `Bài đọc mẫu ${stamp}`;

	const teacherEmail = await signUpViaApi(page);
	const classId = await seedDatedClass(page, {
		name: `E2E Materials ${stamp}`,
		startDate: vietnamTodayISO(),
		sessionsTotal: 2,
		students: { teacherEmail, names: ["Học viên Tài liệu E2E"] },
	});

	// Ngân hàng trống → empty state; tạo thư mục, thư mục mới được chọn.
	await page.goto("/materials");
	await expect(page.getByTestId("materials-empty")).toBeVisible();
	await page.getByRole("button", { name: "Thư mục mới" }).click();
	const folderDialog = page.getByRole("dialog", { name: "Thư mục mới" });
	await folderDialog.getByLabel("Tên thư mục").fill(FOLDER);
	await folderDialog.getByRole("button", { name: "Tạo thư mục" }).click();
	await expect(folderDialog).toBeHidden();
	const tree = page.getByRole("navigation", { name: "Thư mục tài liệu" });
	await expect(tree.getByRole("button", { name: FOLDER })).toHaveAttribute(
		"aria-current",
		"true",
	);
	await expect(page).toHaveURL(/folderId=/);

	// Thêm liên kết — mặc định vào thư mục đang xem.
	await page.getByRole("button", { name: "Thêm liên kết" }).first().click();
	const linkDialog = page.getByRole("dialog", { name: "Thêm liên kết" });
	await linkDialog.getByLabel("Tiêu đề").fill(TITLE);
	await linkDialog
		.getByLabel("Đường dẫn")
		.fill("https://learnenglish.britishcouncil.org/");
	await linkDialog.getByRole("button", { name: "Thêm liên kết" }).click();
	await expect(linkDialog).toBeHidden();
	const item = page.getByTestId("material-item").filter({ hasText: TITLE });
	await expect(item).toBeVisible();
	await expect(item.getByText("Chưa dùng ở buổi nào")).toBeVisible();

	// Gắn vào buổi học từ ngân hàng; mục đã gắn bị vô hiệu.
	let sessionDialog = await openFirstSessionMaterials(page, classId);
	await expect(
		sessionDialog.getByTestId("session-materials-empty"),
	).toBeVisible();
	await sessionDialog
		.getByRole("button", { name: "Chọn từ ngân hàng" })
		.click();
	const picker = page.getByRole("dialog", {
		name: "Chọn từ ngân hàng tài liệu",
	});
	await picker.getByRole("button", { name: `Gắn ${TITLE}` }).click();
	await expect(
		picker.getByRole("button", { name: `Đã gắn ${TITLE}` }),
	).toBeDisabled();
	await picker.getByRole("button", { name: "Quay lại" }).click();
	sessionDialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(
		sessionDialog.getByTestId("material-item").filter({ hasText: TITLE }),
	).toBeVisible();

	// Đang dùng ở 1 buổi → xóa bị chặn với thông báo số buổi.
	await page.goto("/materials");
	await expect(item.getByText("Dùng ở 1 buổi")).toBeVisible();
	await item.getByRole("button", { name: `Xóa ${TITLE}` }).click();
	let deleteDialog = page.getByRole("dialog", { name: "Xóa tài liệu" });
	await deleteDialog.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(deleteDialog.getByRole("alert")).toHaveText(
		"Tài liệu đang được dùng ở 1 buổi học. Hãy gỡ khỏi các buổi đó trước khi xóa.",
	);
	await deleteDialog.getByRole("button", { name: "Hủy" }).click();

	// Gỡ khỏi buổi học.
	sessionDialog = await openFirstSessionMaterials(page, classId);
	await sessionDialog.getByRole("button", { name: `Gỡ ${TITLE}` }).click();
	await expect(
		sessionDialog.getByTestId("session-materials-empty"),
	).toBeVisible();

	// Xóa tài liệu rồi xóa thư mục (đã rỗng).
	await page.goto("/materials");
	await item.getByRole("button", { name: `Xóa ${TITLE}` }).click();
	deleteDialog = page.getByRole("dialog", { name: "Xóa tài liệu" });
	await deleteDialog.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(deleteDialog).toBeHidden();
	await expect(page.getByTestId("materials-empty")).toBeVisible();

	await tree.getByRole("button", { name: FOLDER }).click();
	await page.getByRole("button", { name: "Xóa thư mục" }).click();
	const folderDelete = page.getByRole("dialog", { name: "Xóa thư mục" });
	await folderDelete.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(folderDelete).toBeHidden();
	await expect(tree.getByRole("button", { name: FOLDER })).toHaveCount(0);
});
