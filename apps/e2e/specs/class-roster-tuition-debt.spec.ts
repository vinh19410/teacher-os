import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #216 — class-detail roster shows a "Học phí" column scoped to the
 * class's own enrollments: "—" before any invoice, red fmtVND when unpaid,
 * "Đã đủ" once every invoice of the class is paid. Covers the helper's
 * accumulation branch in the UI with a second invoice.
 */
const STUDENT_NAME = "QC Roster E2E";
const CLASS_NAME = "E2E Roster Nợ học phí";

async function setupOrgWithEnrollment(page: Page): Promise<void> {
	await signUpViaUi(page);

	// Student first, from /students (the /students modal is create-only).
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const studentsDialog = page.getByRole("dialog");
	await studentsDialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await studentsDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(studentsDialog).toBeHidden();

	// Scheduled class (defaults: T2+T4).
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

	// Enroll via the class-detail picker.
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
}

/** The roster row of STUDENT_NAME inside the class-detail roster table. */
function rosterRow(page: Page) {
	return page.locator("tbody tr").filter({ hasText: STUDENT_NAME });
}

/** The "Học phí" cell content of the roster row, addressed by its exact
 * rendered text (— / fmtVND / Đã đủ) — scoped inside the row. */
function rosterFee(page: Page, text: string) {
	return rosterRow(page).getByText(text, { exact: true });
}

async function openClassDetail(page: Page): Promise<void> {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME, { exact: true }).click();
	await expect(rosterRow(page)).toBeVisible();
}

async function createInvoice(page: Page, amount: string): Promise<void> {
	await page.goto("/tuition");
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill(amount);
	await dialog.getByLabel("Ngày đến hạn *").fill("2026-12-25");
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();
}

async function markFirstInvoicePaid(page: Page): Promise<void> {
	await page.goto("/tuition");
	const unpaidButtons = page.getByRole("button", { name: "Đã nhận" });
	await expect(unpaidButtons.first()).toBeVisible();
	const before = await unpaidButtons.count();
	expect(before).toBeGreaterThan(0);
	await unpaidButtons.first().click();
	await expect(unpaidButtons).toHaveCount(before - 1);
}

test("class roster reflects the tuition-debt lifecycle of the class", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);

	// Roster is the default tab: no invoice yet → "—".
	await expect(rosterRow(page)).toBeVisible();
	await expect(page.getByText("Chưa có học viên")).toBeHidden();

	// First invoice → red outstanding amount in the roster.
	await createInvoice(page, "400000");
	await openClassDetail(page);
	await expect(rosterFee(page, "400.000đ")).toBeVisible();
	await expect(rosterFee(page, "—")).toBeHidden();

	// Second invoice accumulates (helper's accumulation branch).
	await createInvoice(page, "400000");
	await openClassDetail(page);
	await expect(rosterFee(page, "800.000đ")).toBeVisible();

	// Mark both paid → "Đã đủ", and it survives a reload.
	await markFirstInvoicePaid(page);
	await markFirstInvoicePaid(page);
	await openClassDetail(page);
	await expect(rosterFee(page, "Đã đủ")).toBeVisible();
	await expect(rosterFee(page, "800.000đ")).toBeHidden();
	await page.reload();
	await expect(rosterFee(page, "Đã đủ")).toBeVisible();
});
