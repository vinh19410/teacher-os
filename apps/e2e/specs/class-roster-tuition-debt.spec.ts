import { expect, type Page, test } from "@playwright/test";
import { isoInDaysFromTodayVN, seedStudent, signUpViaUi } from "./helpers";

/**
 * Issues #216 + #322 + #340 — class-detail roster "Học phí" cell follows the
 * tuition lifecycle of the class's own enrollments: badge "Chưa lập phiếu"
 * while the active student has no invoice, "Chưa thu" + 'còn <amount>'
 * (outstanding, subtracting ledger partial payments) for a future-due one,
 * "Quá hạn" + red remaining debt once a due date passes, "Đã thu" after full
 * payment (survives reload). "Quá hạn" is derived client-side from `due`, so
 * spec dues are relative to today (VN timezone) instead of a fixed date that
 * would flip overdue on its own.
 */
const STUDENT_NAME = "QC Roster E2E";
const CLASS_NAME = "E2E Roster Nợ học phí";

async function setupOrgWithEnrollment(page: Page): Promise<void> {
	const teacherEmail = await signUpViaUi(page);
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
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
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	// Activate student so they can receive invoices
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();
}

/** The roster row of STUDENT_NAME inside the class-detail roster table. */
function rosterRow(page: Page) {
	return page.locator("tbody tr").filter({ hasText: STUDENT_NAME });
}

/** The "Học phí" cell content of the roster row, addressed by its exact
 * rendered text (— / badge label / "còn <amount>") — scoped inside the row. */
function rosterFee(page: Page, text: string) {
	return rosterRow(page).getByText(text, { exact: true });
}

async function openClassDetail(page: Page): Promise<void> {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME, { exact: true }).click();
	// #391, #520: tab mặc định là "Buổi học & luyện tập" — roster ở tab "Học viên".
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await expect(rosterRow(page)).toBeVisible();
}

async function createInvoice(
	page: Page,
	amount: string,
	due: string,
): Promise<void> {
	await page.goto("/tuition");
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill(amount);
	await dialog.getByLabel("Ngày đến hạn *").fill(due);
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();
}

function invoiceRegion(page: Page) {
	return page
		.getByTestId("tuition-invoices-section")
		.filter({ has: page.getByRole("heading", { name: "Hóa đơn" }) });
}

async function markAllInvoicesPaid(page: Page): Promise<void> {
	await page.goto("/tuition");
	const unpaidButtons = invoiceRegion(page).getByRole("button", {
		name: "Đã nhận",
	});
	// Wait until both created invoices render as unpaid buttons.
	await expect(unpaidButtons).toHaveCount(2);

	// Click first, wait for snapshot refetch to drop count to 1.
	await unpaidButtons.first().click();
	await expect(unpaidButtons).toHaveCount(1, { timeout: 15000 });

	// Click remaining, wait for snapshot refetch to drop count to 0.
	await unpaidButtons.first().click();
	await expect(unpaidButtons).toHaveCount(0, { timeout: 15000 });
}

test("class roster reflects the tuition-debt lifecycle of the class", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);

	// Roster is the default tab: active student, no invoice yet → "Chưa lập phiếu".
	await expect(rosterRow(page)).toBeVisible();
	await expect(page.getByText("Chưa có học viên")).toBeHidden();
	await expect(rosterFee(page, "Chưa lập phiếu")).toBeVisible();

	// First invoice, due in 30 days → "Chưa thu" + remaining amount.
	await createInvoice(page, "400000", isoInDaysFromTodayVN(30));
	await openClassDetail(page);
	await expect(rosterFee(page, "Chưa thu")).toBeVisible();
	await expect(rosterFee(page, "còn 400.000đ")).toBeVisible();
	await expect(rosterFee(page, "Chưa lập phiếu")).toBeHidden();

	// Second invoice already past due → "Quá hạn" + both amounts owed.
	await createInvoice(page, "400000", isoInDaysFromTodayVN(-1));
	await openClassDetail(page);
	await expect(rosterFee(page, "Quá hạn")).toBeVisible();
	await expect(rosterFee(page, "còn 800.000đ")).toBeVisible();

	// The same past-due invoice shows "Quá hạn" on /tuition (shared helper,
	// #322): exactly one row — the +30d one stays "Chưa thu".
	await page.goto("/tuition");
	await expect(
		invoiceRegion(page).locator("tbody tr").filter({ hasText: "Quá hạn" }),
	).toHaveCount(1);

	// Mark both paid → "Đã thu", and it survives a reload.
	await markAllInvoicesPaid(page);
	await openClassDetail(page);
	await expect(rosterFee(page, "Đã thu")).toBeVisible();
	await expect(rosterFee(page, "còn 800.000đ")).toBeHidden();
	await page.reload();
	// #391, #520: reload đưa tab về mặc định "Buổi học & luyện tập" — roster phải
	// mở lại tab "Học viên".
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await expect(rosterFee(page, "Đã thu")).toBeVisible();
});
