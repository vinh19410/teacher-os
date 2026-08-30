import { expect, type Page, type Request, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * QC scenario for issue #61: the "Tạo hóa đơn" modal used to be a no-op —
 * submit closed the modal without persisting, for valid AND invalid amounts
 * alike (QC re-test 2026-08-27). After the wiring, a valid submit creates
 * the invoice (row appears, survives reload) and invalid amounts are held
 * client-side with a field error and zero POSTs.

 * Shared setup: a fresh org, one student, one scheduled class, the student
 * enrolled into it — the enrollment is what the invoice picker needs.
 */
const STUDENT_NAME = "QC-61 E2E";
const CLASS_NAME = "E2E 61 Lớp hóa đơn";

async function setupOrgWithEnrollment(page: Page): Promise<void> {
	await signUpViaUi(page);

	// Student first, from /students (the /students modal is create-only).
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const studentsDialog = page.getByRole("dialog");
	await expect(studentsDialog.getByText("Thêm học viên mới")).toBeVisible();
	await studentsDialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await studentsDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(studentsDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// Scheduled class (defaults: T2+T4, 12 buổi).
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// Enroll the existing student via the class-detail picker (#122 flow).
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
}

/** The Card holding the "Hóa đơn" DataTable (scoped away from the package
 * cards above, which also render VND amounts). */
function invoiceTable(page: Page) {
	return page
		.locator("div.mt-8")
		.filter({ has: page.getByRole("heading", { name: "Hóa đơn" }) })
		.locator("tbody tr");
}

async function openCreateInvoiceModal(page: Page) {
	await page.getByText("Học phí", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	return dialog;
}

/** Observe-only request counter (no mocking): how many POSTs hit the
 * invoice endpoint while `action` runs. Registered BEFORE the action so a
 * fast request can never slip past the listener. */
async function countInvoicePosts(
	page: Page,
	action: () => Promise<void>,
): Promise<number> {
	let posts = 0;
	const onRequest = (request: Request) => {
		if (
			request.method() === "POST" &&
			request.url().includes("/api/invoices")
		) {
			posts += 1;
		}
	};
	page.on("request", onRequest);
	try {
		await action();
	} finally {
		page.off("request", onRequest);
	}
	return posts;
}

test("tuition → tạo hóa đơn hợp lệ → row hiện, reload vẫn còn", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);
	const dialog = await openCreateInvoiceModal(page);

	// The picker defaults to the org's only enrollment — assert it is
	// labeled with the student before submitting.
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill("400000");
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();

	// fmtVND renders vi-VN thousands separators: 400.000đ, unpaid badge.
	await expect(page.getByText("400.000đ")).toBeVisible();
	await expect(invoiceTable(page)).toHaveCount(1);
	await expect(
		page
			.locator("div.mt-8")
			.filter({ has: page.getByRole("heading", { name: "Hóa đơn" }) })
			.getByText("Chưa thu"),
	).toBeVisible();

	await page.reload();
	await expect(page.getByText("400.000đ")).toBeVisible();
	await expect(invoiceTable(page)).toHaveCount(1);
});

test("tuition → tạo hóa đơn amount trống → field error, không POST, không row", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);
	const dialog = await openCreateInvoiceModal(page);
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);

	const posts = await countInvoicePosts(page, async () => {
		await dialog
			.getByRole("button", { name: "Tạo hóa đơn", exact: true })
			.click();
		await expect(dialog.getByText("Vui lòng nhập số tiền.")).toBeVisible();
	});
	expect(posts).toBe(0);
	await expect(invoiceTable(page)).toHaveCount(0);
});

test("tuition → tạo hóa đơn amount âm → field error, không POST, không row", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);
	const dialog = await openCreateInvoiceModal(page);
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill("-5000");

	const posts = await countInvoicePosts(page, async () => {
		await dialog
			.getByRole("button", { name: "Tạo hóa đơn", exact: true })
			.click();
		await expect(
			dialog.getByText("Số tiền phải là số nguyên dương, tối đa 12 chữ số."),
		).toBeVisible();
	});
	expect(posts).toBe(0);
	await expect(invoiceTable(page)).toHaveCount(0);
});
