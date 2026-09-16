import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

// Hai định dạng = hai code path parse khác nhau (papaparse vs
// read-excel-file) — CSV không exercise read-excel-file chút nào.
// Fixture v4 (issue #154): 5 cột có cột Loại — 2 module · 5 buổi, buổi
// "giữa kỳ" cuối Module 1 (#3), "cuối kỳ" cuối Module 2 (#5).
for (const [format, fixture] of [
	["CSV", "fixtures/syllabus-import.v4.csv"],
	["XLSX", "fixtures/syllabus-import.v4.xlsx"],
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
		await expect(dialog.getByText("2 module · 5 buổi học")).toBeVisible();
		await expect(dialog.getByRole("table")).toBeVisible();
		await expect(
			dialog.getByRole("cell", { name: "Hiểu cấu trúc đề" }),
		).toBeVisible();
		// Cột Loại ở preview: nhãn đầy đủ khớp syllabus detail (issue #154).
		await expect(
			dialog.getByRole("cell", { name: "Thi giữa kỳ" }),
		).toBeVisible();
		await expect(
			dialog.getByRole("cell", { name: "Thi cuối kỳ" }),
		).toBeVisible();
		// Khóa hợp đồng ordinal xuyên module của cột #: buổi 3 (giữa kỳ) là
		// hàng cuối Module 1, buổi 5 (cuối kỳ) thuộc Module 2 — "5" và
		// "Module 2" cùng hàng (Buổi 1–3 thuộc Module 1).
		await expect(
			dialog.getByRole("cell", { name: "3", exact: true }),
		).toBeVisible();
		await expect(
			dialog.getByRole("cell", { name: "5", exact: true }),
		).toBeVisible();
		// .first(): với v4, Module 2 có 2 buổi — row sau giữ span rỗng với
		// attr title trùng tên module (accessory name trùng, quirk có sẵn).
		await expect(
			dialog.getByRole("cell", { name: "Module 2 — Thực hành" }).first(),
		).toBeVisible();
		await expect(dialog.getByLabel("Số buổi dự kiến")).toHaveValue("5");
		await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
		await page.waitForURL(/\/syllabus\/.+/);
		await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();
		await expect(page.getByText("Module 2 — Thực hành")).toBeVisible();
		// Không exact:true với buổi thi — title div chứa thêm text badge
		// ("Buổi 3Thi giữa kỳ"), exact match sẽ trượt. getByText khớp element
		// sâu nhất chứa text nên không đụng text khác trên trang.
		for (const n of ["1", "2", "3", "4", "5"]) {
			await expect(page.getByText(`Buổi ${n}`)).toBeVisible();
		}
		// Highlight buổi thi: badge warn + nền dòng amber (bg-warn-soft/50) —
		// đúng 2 dòng thi giữa kỳ/cuối kỳ.
		await expect(page.getByText("Thi giữa kỳ", { exact: true })).toBeVisible();
		await expect(page.getByText("Thi cuối kỳ", { exact: true })).toBeVisible();
		await expect(page.locator("[class*='bg-warn-soft/50']")).toHaveCount(2);
	});
}

test("import file 4 cột v3 legacy vẫn tạo syllabus không lỗi (regression #154)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByPlaceholder("VD: IELTS Writing 7.0")
		.fill(`E2E Legacy v3 ${Date.now()}`);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.csv",
	);
	await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();
	await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);
	for (const n of ["1", "2", "3"]) {
		await expect(page.getByText(`Buổi ${n}`, { exact: true })).toBeVisible();
	}
	// Không có buổi thi nào → không badge, không dòng tint.
	await expect(page.getByText("Thi giữa kỳ")).toHaveCount(0);
	await expect(page.locator("[class*='bg-warn-soft/50']")).toHaveCount(0);
});

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

	// Đóng bằng Esc → mở lại: vẫn còn (name + preview).
	await page
		.getByRole("dialog")
		.getByPlaceholder("VD: IELTS Writing 7.0")
		.press("Escape");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await expect(
		page.getByRole("dialog").getByPlaceholder("VD: IELTS Writing 7.0"),
	).toHaveValue("E2E Keep State");
	await expect(
		page.getByRole("dialog").getByText("2 module · 3 buổi học"),
	).toBeVisible();

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

test("nút gỡ file (X) hoạt động ở cả nhánh preview OK lẫn nhánh lỗi", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");

	// Nhánh OK: import mẫu → nút X hiện ở header card → gỡ được preview.
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.csv",
	);
	await expect(dialog.getByText("2 module · 3 buổi học")).toBeVisible();
	const removeButton = dialog.getByRole("button", { name: "Gỡ file" });
	await expect(removeButton).toBeVisible();
	await removeButton.click();
	await expect(dialog.getByRole("table")).toBeHidden();
	await expect(dialog.getByText("2 module · 3 buổi học")).toBeHidden();

	// Nhánh lỗi: file template cũ 6 cột → error card + cùng nút X → gỡ được.
	await page.setInputFiles("input[type=file]", {
		name: "old-template.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(
			"Module,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái\r\nM1,,Buổi 1,o,,",
		),
	});
	await expect(dialog.getByText(/File dùng template cũ/)).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Gỡ file" })).toBeVisible();
	await dialog.getByRole("button", { name: "Gỡ file" }).click();
	await expect(dialog.getByText(/File dùng template cũ/)).toBeHidden();
});
