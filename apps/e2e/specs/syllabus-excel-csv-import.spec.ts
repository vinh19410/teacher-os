import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

// Hai định dạng = hai code path parse khác nhau (papaparse vs
// read-excel-file) — CSV không exercise read-excel-file chút nào.
for (const [format, fixture] of [
	["CSV", "fixtures/syllabus-import.sample.csv"],
	["XLSX", "fixtures/syllabus-import.sample.xlsx"],
] as const) {
	test(`tạo syllabus bằng upload ${format}: preview rồi thấy đủ modules/buổi trên trang chi tiết`, async ({
		page,
	}) => {
		await signUpViaUi(page);
		await page.goto("/syllabus");
		await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
		const dialog = page.getByRole("dialog");
		await dialog
			.getByPlaceholder("VD: IELTS Writing 7.0")
			.fill(`E2E Import ${format} ${Date.now()}`);
		// Scope vào dialog: list page phía sau cũng có chip "Writing" (ChipFilter).
		await dialog.getByRole("button", { name: "Writing", exact: true }).click();
		await page.setInputFiles("input[type=file]", fixture);
		await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();
		await expect(dialog.getByRole("table")).toBeVisible();
		await expect(
			dialog.getByRole("cell", { name: "Hiểu cấu trúc đề" }),
		).toBeVisible();
		await expect(dialog.getByLabel("Số buổi dự kiến")).toHaveValue("3");
		await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
		await page.waitForURL(/\/syllabus\/.+/);
		await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();
		await expect(page.getByText("Module 2 — Thực hành")).toBeVisible();
		await expect(page.getByText("Buổi 1")).toBeVisible();
		await expect(page.getByText("Buổi 2")).toBeVisible();
		// exact:Buổi 3 status "đang học" → detail page render thêm card
		// "Buổi hiện tại" chứa "Buổi 3 — …"; substring match sẽ trúng 2 element.
		await expect(page.getByText("Buổi 3", { exact: true })).toBeVisible();
	});
}

test("đóng popup tạo syllabus rồi mở lại giữ nguyên dữ liệu đã nhập", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("VD: IELTS Writing 7.0").fill("E2E Keep State");
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.csv",
	);
	await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();

	// Đóng bằng Hủy → mở lại: name + preview còn nguyên.
	await dialog.getByRole("button", { name: "Hủy" }).click();
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await expect(
		page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
	).toHaveValue("E2E Keep State");
	await expect(
		page.getByRole("dialog").getByText("2 module · 3 buổi học"),
	).toBeVisible();

	// Đóng bằng Esc → mở lại: vẫn còn.
	await page
		.getByRole("dialog")
		.getByPlaceholder("VD: IELTS Writing 7.0")
		.press("Escape");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await expect(
		page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
	).toHaveValue("E2E Keep State");

	// Đóng bằng click overlay → mở lại: vẫn còn.
	await page.mouse.click(15, 400); // ngoài modal (modal max-w 480px giữa màn hình)
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await expect(
		page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
	).toHaveValue("E2E Keep State");
	await expect(
		page.getByRole("dialog").getByText("2 module · 3 buổi học"),
	).toBeVisible();
});
