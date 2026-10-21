import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

test.describe("class tuition fee (issue #227)", () => {
	test("creates class with tuition fee, edits fee, and clears fee", async ({
		page,
	}) => {
		const CLASS_NAME = "IELTS Fee Lifecycle Class";

		await signUpViaUi(page);

		// Navigate to classes list
		await page.getByText("Lớp học", { exact: true }).first().click();
		await expect(page).toHaveURL(/\/classes$/);

		// 1. Tạo lớp có học phí
		await page.getByRole("button", { name: "+ Tạo lớp" }).click();
		const addDialog = page.getByRole("dialog");
		await expect(addDialog.getByText("Tạo lớp mới")).toBeVisible();

		await addDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
		await addDialog
			.getByRole("button", { name: "Writing", exact: true })
			.click();
		await addDialog.getByRole("button", { name: "T2", exact: true }).click();
		await addDialog.getByLabel("Học phí / học viên (VND)").fill("5000000");

		await addDialog
			.getByRole("button", { name: "Tạo lớp", exact: true })
			.click();
		await expect(addDialog).toBeHidden();

		// Go into class detail
		// Redesign #349: card grid class title.
		const classRow = page.locator("h3", { hasText: CLASS_NAME });
		await expect(classRow).toBeVisible();
		await classRow.click();
		await expect(page).toHaveURL(/\/classes\/.+/);

		// #391: học phí + nút Sửa sống ở tab "Học viên".
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();

		// Verify fee displayed
		await expect(
			page.getByText("Học phí: 5.000.000đ / học viên"),
		).toBeVisible();

		// 2. Sửa học phí: mở modal Sửa, prefill 5000000; đổi thành 6000000
		await page.getByRole("button", { name: "Sửa", exact: true }).click();
		const editDialog = page.getByRole("dialog");
		await expect(editDialog.getByText("Sửa học phí lớp")).toBeVisible();
		await expect(editDialog.getByLabel("Học phí / học viên (VND)")).toHaveValue(
			"5,000,000",
		);

		await editDialog.getByLabel("Học phí / học viên (VND)").fill("6000000");
		await editDialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(editDialog).toBeHidden();
		await expect(
			page.getByText("Học phí: 6.000.000đ / học viên"),
		).toBeVisible();

		// 3. Xóa học phí: mở modal Sửa, xóa trắng input, lưu
		await page.getByRole("button", { name: "Sửa", exact: true }).click();
		await expect(editDialog.getByText("Sửa học phí lớp")).toBeVisible();
		await editDialog.getByLabel("Học phí / học viên (VND)").fill("");
		await editDialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(editDialog).toBeHidden();
		await expect(page.getByText("Học phí: —")).toBeVisible();
	});

	test("creates class without tuition fee and displays dash", async ({
		page,
	}) => {
		const CLASS_NAME = "IELTS No Fee Class";

		await signUpViaUi(page);

		await page.getByText("Lớp học", { exact: true }).first().click();
		await expect(page).toHaveURL(/\/classes$/);

		await page.getByRole("button", { name: "+ Tạo lớp" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();

		await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
		await dialog.getByRole("button", { name: "Writing", exact: true }).click();
		await dialog.getByRole("button", { name: "T2", exact: true }).click();

		// Leave tuition fee empty
		await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
		await expect(dialog).toBeHidden();

		// Redesign #349: card grid class title.
		const classRow = page.locator("h3", { hasText: CLASS_NAME });
		await expect(classRow).toBeVisible();
		await classRow.click();
		await expect(page).toHaveURL(/\/classes\/.+/);

		// #391: học phí sống ở tab "Học viên".
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();

		await expect(page.getByText("Học phí: —")).toBeVisible();
	});

	test("validates bad fee inputs in create modal and edit modal", async ({
		page,
	}) => {
		const CLASS_NAME = "IELTS Validate Fee Class";

		await signUpViaUi(page);

		await page.getByText("Lớp học", { exact: true }).first().click();
		await expect(page).toHaveURL(/\/classes$/);

		// Test in AddClassModal
		await page.getByRole("button", { name: "+ Tạo lớp" }).click();
		const addDialog = page.getByRole("dialog");
		await expect(addDialog.getByText("Tạo lớp mới")).toBeVisible();

		await addDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
		await addDialog
			.getByRole("button", { name: "Writing", exact: true })
			.click();
		await addDialog.getByRole("button", { name: "T2", exact: true }).click();

		// Fee 0
		await addDialog.getByLabel("Học phí / học viên (VND)").fill("0");
		await addDialog
			.getByRole("button", { name: "Tạo lớp", exact: true })
			.click();
		await expect(addDialog.getByRole("alert")).toHaveText(
			"Học phí phải là số nguyên dương.",
		);
		await expect(addDialog).toBeVisible();

		// Fee > 12 digits
		await addDialog
			.getByLabel("Học phí / học viên (VND)")
			.fill("1234567890123");
		await addDialog
			.getByRole("button", { name: "Tạo lớp", exact: true })
			.click();
		await expect(addDialog.getByRole("alert")).toHaveText(
			"Học phí phải là số nguyên dương.",
		);
		await expect(addDialog).toBeVisible();

		// Fix fee and create class
		await addDialog.getByLabel("Học phí / học viên (VND)").fill("2000000");
		await addDialog
			.getByRole("button", { name: "Tạo lớp", exact: true })
			.click();
		await expect(addDialog).toBeHidden();

		// Go into class detail
		// Redesign #349: card grid class title.
		const classRow = page.locator("h3", { hasText: CLASS_NAME });
		await expect(classRow).toBeVisible();
		await classRow.click();
		await expect(page).toHaveURL(/\/classes\/.+/);

		// Test in EditClassFeeModal
		// #391: nút Sửa học phí sống ở tab "Học viên".
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await page.getByRole("button", { name: "Sửa", exact: true }).click();
		const editDialog = page.getByRole("dialog");
		await expect(editDialog.getByText("Sửa học phí lớp")).toBeVisible();

		await editDialog.getByLabel("Học phí / học viên (VND)").fill("0");
		await editDialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(editDialog.getByRole("alert")).toHaveText(
			"Học phí phải là số nguyên dương.",
		);
		await expect(editDialog).toBeVisible();

		await editDialog
			.getByLabel("Học phí / học viên (VND)")
			.fill("9999999999999");
		await editDialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(editDialog.getByRole("alert")).toHaveText(
			"Học phí phải là số nguyên dương.",
		);
		await expect(editDialog).toBeVisible();

		// Cancel modal closes without error
		await editDialog.getByRole("button", { name: "Hủy", exact: true }).click();
		await expect(editDialog).toBeHidden();
		await expect(
			page.getByText("Học phí: 2.000.000đ / học viên"),
		).toBeVisible();
	});
});
