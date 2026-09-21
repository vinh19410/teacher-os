import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #221 — class-scoped lesson management: the curriculum card is
 * assignment-only (no progress %, no expandable tree) and lesson ordering
 * lives in the "Quản lý buổi" modal. Reordering lessons must swap the
 * topics shown on the class schedule table (buổi N ↔ bài N).
 */

async function createTemplateWithModules(page: Page, name: string) {
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("VD: IELTS Writing 7.0").fill(name);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);

	// Module A with two lessons, then Module B with one.
	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog = page.getByRole("dialog");
	await moduleDialog
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module A");
	await moduleDialog.getByRole("button", { name: "Thêm module" }).click();
	await expect(page.getByText("Module A")).toBeVisible();

	for (const title of ["Buổi A1", "Buổi A2"]) {
		await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
		const addDialog = page.getByRole("dialog");
		await addDialog
			.getByPlaceholder("VD: Line chart — Mô tả xu hướng")
			.fill(title);
		await addDialog.getByRole("button", { name: "Thêm buổi" }).click();
		await expect(addDialog).toBeHidden();
	}

	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog2 = page.getByRole("dialog");
	await moduleDialog2
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module B");
	await moduleDialog2.getByRole("button", { name: "Thêm module" }).click();
	await expect(moduleDialog2).toBeHidden();

	await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
	const addDialog2 = page.getByRole("dialog");
	await addDialog2
		.getByPlaceholder("VD: Line chart — Mô tả xu hướng")
		.fill("Buổi B1");
	await addDialog2.getByRole("button", { name: "Thêm buổi" }).click();
	await expect(addDialog2).toBeHidden();
}

async function createClassAndImportTemplate(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(className);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// Import the template into the class (single "Nhập giáo trình" submit).
	await page.getByRole("button", { name: "Nhập từ template" }).click();
	const importDialog = page.getByRole("dialog");
	await expect(
		importDialog.getByRole("heading", { name: "Nhập giáo trình từ template" }),
	).toBeVisible();
	await importDialog.getByRole("button", { name: "Nhập giáo trình" }).click();
	await expect(importDialog).toBeHidden();
}

test("manage modal reorders lessons and the schedule table follows (#221)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await createTemplateWithModules(page, "E2E 221 Template");
	await createClassAndImportTemplate(page, "E2E 221 Lớp");

	// Curriculum card is assignment-only: no progress, no expandable tree.
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Mở rộng \(/ })).toHaveCount(
		0,
	);

	// Schedule table starts A1 → A2 → B1.
	const scheduleRows = page.locator("tbody tr");
	await expect(
		scheduleRows.filter({ hasText: "Buổi A1" }).first(),
	).toBeVisible();

	// Open the manage modal and move "Buổi A2" up.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageDialog = page.getByRole("dialog");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeVisible();
	const a2Row = manageDialog
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi A2" });
	await a2Row.getByRole("button", { name: "↑", exact: true }).click();
	// The base Modal closes on Escape (no explicit close button).
	await page.keyboard.press("Escape");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeHidden();

	// Schedule rows swapped: A2 now precedes A1.
	await expect(
		scheduleRows.filter({ hasText: "Buổi A2" }).first(),
	).toBeVisible();
	const firstRow = scheduleRows.nth(0);
	await expect(firstRow).toContainText("Buổi A2");
	await expect(firstRow).not.toContainText("Buổi A1");

	// Card stays assignment-only after the flow.
	await expect(page.getByRole("button", { name: /^Mở rộng \(/ })).toHaveCount(
		0,
	);
});
