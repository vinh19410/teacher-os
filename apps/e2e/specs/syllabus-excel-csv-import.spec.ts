import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

// Hai định dạng = hai code path parse khác nhau (papaparse vs
// read-excel-file) — CSV không exercise read-excel-file chút nào.
test("tạo syllabus bằng upload CSV: preview rồi thấy đủ modules/buổi trên trang chi tiết", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await page
		.getByPlaceholder("VD: IELTS Writing 7.0")
		.fill(`E2E Import CSV ${Date.now()}`);
	await page.getByText("Writing", { exact: true }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.csv",
	);
	await expect(page.getByText("2 module · 3 buổi học")).toBeVisible();
	await expect(page.getByLabel("Số buổi dự kiến")).toHaveValue("3");
	await page.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);
	await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();
	await expect(page.getByText("Module 2 — Thực hành")).toBeVisible();
	await expect(page.getByText("Buổi 1")).toBeVisible();
	await expect(page.getByText("Buổi 2")).toBeVisible();
	await expect(page.getByText("Buổi 3")).toBeVisible();
});

test("tạo syllabus bằng upload XLSX: preview rồi thấy đủ modules/buổi trên trang chi tiết", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await page
		.getByPlaceholder("VD: IELTS Writing 7.0")
		.fill(`E2E Import XLSX ${Date.now()}`);
	await page.getByText("Writing", { exact: true }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.xlsx",
	);
	await expect(page.getByText("2 module · 3 buổi học")).toBeVisible();
	await expect(page.getByLabel("Số buổi dự kiến")).toHaveValue("3");
	await page.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);
	await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();
	await expect(page.getByText("Module 2 — Thực hành")).toBeVisible();
	await expect(page.getByText("Buổi 1")).toBeVisible();
	await expect(page.getByText("Buổi 2")).toBeVisible();
	await expect(page.getByText("Buổi 3")).toBeVisible();
});
