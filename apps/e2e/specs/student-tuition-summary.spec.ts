import { expect, type Page, test } from "@playwright/test";
import { isoInDaysFromTodayVN, seedStudent, signUpViaUi } from "./helpers";

/**
 * Issue #347 — student-profile tuition tab gains a per-class summary:
 * 3 KPI cards (Tổng học phí / Đã đóng / Còn lại) summing tuition fees of
 * every active enrolled class (two classes → both fees), minus money
 * received per class by the tuitionTotals rule. The scenario proves the
 * headline example: classes 10.000.000 + 6.000.000 with 2.000.000 collected
 * on class A → 16tr / 2tr / 14tr, correct per-class rows, stable across
 * reload, and the invoice row still opens the detail page (#345 regression
 * guard). Amounts repeat across cards/rows/cells, so every assertion stays
 * scoped to its card label or table cell (Playwright strict mode).
 */
const STUDENT_NAME = "QC Tuition Summary E2E";
const CLASS_A = "E2E Sum Lớp A";
const CLASS_B = "E2E Sum Lớp B";

/** One KPI card of the summary grid, addressed by its label. */
function summaryCard(page: Page, label: string) {
	return page
		.locator('[data-testid="tuition-stat-row"] > div')
		.filter({ hasText: label });
}

/** The big number div of a summary card — exact text (no substring). */
function summaryNum(page: Page, label: string) {
	return summaryCard(page, label).locator("div").first();
}

/** The per-class summary row of one class. Invoice rows below never contain
 * the class name, so filtering rows by class name is unambiguous. */
function classRow(page: Page, className: string) {
	return page.getByRole("row").filter({ hasText: className });
}

async function createClassWithFee(
	page: Page,
	name: string,
	fee: string | null,
): Promise<void> {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Tên lớp *").fill(name);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	if (fee !== null) {
		await dialog.getByLabel("Học phí / học viên (VND)").fill(fee);
	}
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
}

/** Enroll STUDENT_NAME into the given class and activate — each activation
 * asserted independently so a failure on the second class is diagnosable
 * (the 1-student × 2-class combination has no other precedent in the suite). */
async function enrollAndActivate(page: Page, className: string): Promise<void> {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className, { exact: true }).click();
	await expect(page).toHaveURL(/\/classes\/.+/);

	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(
		page
			.locator("tbody tr")
			.filter({ hasText: STUDENT_NAME })
			.getByText("Đang học"),
	).toBeVisible();
}

test("two enrolled classes sum into the tuition summary and survive reload (#347)", async ({
	page,
}) => {
	const teacherEmail = await signUpViaUi(page);
	const seeded = await seedStudent({ teacherEmail, name: STUDENT_NAME });

	// Class A: 10.000.000đ, class B: 6.000.000đ — student enrolled + active
	// in both so both fees count toward the totals.
	await createClassWithFee(page, CLASS_A, "10000000");
	await createClassWithFee(page, CLASS_B, "6000000");
	await enrollAndActivate(page, CLASS_A);
	await enrollAndActivate(page, CLASS_B);

	// Invoice 2.000.000đ on class A's enrollment, then mark paid. The picker
	// defaults to the FIRST active enrollment (createdAt order) — class A vs
	// B is not guaranteed, so select class A's option explicitly; both
	// options carry the same student name, the class suffix disambiguates.
	await page.getByText("Doanh thu", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	await dialog
		.getByLabel("Học viên *")
		.selectOption({ label: `${STUDENT_NAME} · ${CLASS_A}` });
	await dialog.getByLabel("Số tiền (VND) *").fill("2000000");
	await dialog.getByLabel("Ngày đến hạn *").fill(isoInDaysFromTodayVN(30));
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();

	const invoiceRow = page.locator("tbody tr").filter({ hasText: "2.000.000đ" });
	await expect(invoiceRow).toHaveCount(1);
	await invoiceRow.getByRole("button", { name: "Đã nhận" }).click();
	await expect(invoiceRow.getByText("Đã thu")).toBeVisible();

	// The summary: totals 16tr / 2tr / 14tr, per-class rows exact.
	await page.goto(`/students/${seeded.id}`);
	await page.getByRole("tab", { name: "Học phí" }).click();
	await expect(summaryNum(page, "Tổng học phí (VND)")).toHaveText(
		"16.000.000đ",
	);
	await expect(summaryNum(page, "Đã đóng (VND)")).toHaveText("2.000.000đ");
	await expect(summaryNum(page, "Còn lại (VND)")).toHaveText("14.000.000đ");

	// Cells by index (Lớp / Học phí / Đã đóng / Còn lại): "6.000.000đ"
	// appears twice inside class B's row, text queries would double-match.
	const cellsA = classRow(page, CLASS_A).getByRole("cell");
	await expect(cellsA.nth(1)).toHaveText("10.000.000đ");
	await expect(cellsA.nth(2)).toHaveText("2.000.000đ");
	await expect(cellsA.nth(3)).toHaveText("8.000.000đ");
	const cellsB = classRow(page, CLASS_B).getByRole("cell");
	await expect(cellsB.nth(1)).toHaveText("6.000.000đ");
	await expect(cellsB.nth(2)).toHaveText("0đ");
	await expect(cellsB.nth(3)).toHaveText("6.000.000đ");

	// Numbers survive a reload (kernel snapshot, no client-only drift).
	await page.reload();
	await page.getByRole("tab", { name: "Học phí" }).click();
	await expect(summaryNum(page, "Tổng học phí (VND)")).toHaveText(
		"16.000.000đ",
	);
	await expect(summaryNum(page, "Còn lại (VND)")).toHaveText("14.000.000đ");

	// The invoice row below still opens the detail page (#345 guard).
	const paidRow = page
		.locator("tbody tr")
		.filter({ hasText: "2.000.000đ" })
		.filter({ hasText: "Đã thu" });
	await expect(paidRow).toHaveCount(1);
	await paidRow.click();
	await expect(page).toHaveURL(/\/tuition\/[^/]+$/);
});

test("tuition summary screenshots at 3 viewports", async ({ page }) => {
	const screenshots = new URL(
		"../../../plans/261008-1427-student-tuition-summary/screenshots/",
		import.meta.url,
	).pathname;
	const teacherEmail = await signUpViaUi(page);
	const seeded = await seedStudent({ teacherEmail, name: STUDENT_NAME });

	await createClassWithFee(page, CLASS_A, "10000000");
	await createClassWithFee(page, CLASS_B, "6000000");
	await enrollAndActivate(page, CLASS_A);
	await enrollAndActivate(page, CLASS_B);

	await page.getByText("Doanh thu", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByLabel("Học viên *")
		.selectOption({ label: `${STUDENT_NAME} · ${CLASS_A}` });
	await dialog.getByLabel("Số tiền (VND) *").fill("2000000");
	await dialog.getByLabel("Ngày đến hạn *").fill(isoInDaysFromTodayVN(30));
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();
	await page
		.locator("tbody tr")
		.filter({ hasText: "2.000.000đ" })
		.getByRole("button", { name: "Đã nhận" })
		.click();
	await expect(
		page.locator("tbody tr").filter({ hasText: "Đã thu" }),
	).toBeVisible();

	await page.goto(`/students/${seeded.id}`);
	await page.getByRole("tab", { name: "Học phí" }).click();
	await expect(summaryNum(page, "Tổng học phí (VND)")).toHaveText(
		"16.000.000đ",
	);
	for (const [w, h, name] of [
		[1440, 900, "student-tuition-summary-1440"],
		[768, 1024, "student-tuition-summary-768"],
		[375, 812, "student-tuition-summary-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(300);
		await page.screenshot({
			path: `${screenshots}${name}.png`,
			fullPage: w === 375,
		});
	}
});
