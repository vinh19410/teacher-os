import { expect, type Page, type Request, test } from "@playwright/test";
import { isoInDaysFromTodayVN, seedStudent, signUpViaUi } from "./helpers";

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

async function setupOrgWithEnrollment(page: Page): Promise<string> {
	const teacherEmail = await signUpViaUi(page);
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
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
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// Activate student so they can receive invoices
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();
	return teacherEmail;
}

/** The Card holding the "Hóa đơn" DataTable (scoped away from the package
 * cards above, which also render VND amounts). */
function invoiceRegion(page: Page) {
	return page
		.locator("div.mt-8")
		.filter({ has: page.getByRole("heading", { name: "Hóa đơn" }) });
}

function invoiceTable(page: Page) {
	return invoiceRegion(page).locator("tbody tr");
}

/** One KPI StatCard inside the 3-card grid, addressed by its label. */
function kpiCard(page: Page, label: string) {
	return page.locator(".grid.grid-cols-3 > div").filter({ hasText: label });
}

/** The big number div of a KPI card — exact-matched, because "0đ" is a
 * substring of every vi-VN amount ending in zero. */
function kpiNum(page: Page, label: string) {
	return kpiCard(page, label).locator("div").first();
}

async function openCreateInvoiceModal(page: Page) {
	// #343 — menu /tuition đổi tên "Doanh thu"; text này render bởi app web.
	await page.getByText("Doanh thu", { exact: true }).first().click();
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

test("tuition → tạo hóa đơn hợp lệ → due dd/mm + KPI khớp sau mark-paid và reload (#135 #62)", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);
	const dialog = await openCreateInvoiceModal(page);

	// The picker defaults to the org's only enrollment — assert it is
	// labeled with the student before submitting.
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill("400000");
	// Explicit due relative to today (VN timezone), not the modal's "today"
	// default: deterministic across midnight races and the UTC CI runner
	// (advisory round); a fixed date would flip "Chưa thu" → "Quá hạn" once
	// the calendar passes it (#322 derives overdue from `due`).
	const due = isoInDaysFromTodayVN(30);
	await dialog.getByLabel("Ngày đến hạn *").fill(due);
	await dialog.getByLabel("Ghi chú").fill("QC-135 ghi chú");
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();

	// fmtVND renders vi-VN thousands separators: 400.000đ. The KPI cards now
	// render the same string as the invoice row, so every amount assertion
	// must stay scoped (Playwright strict mode throws on double matches).
	await expect(invoiceRegion(page).getByText("400.000đ")).toBeVisible();
	await expect(invoiceTable(page)).toHaveCount(1);
	await expect(invoiceTable(page).getByText("Chưa thu")).toBeVisible();

	// Empty-org baseline first: collected starts at zero, outstanding rises
	// by exactly the new invoice (issue #62).
	await expect(kpiNum(page, "Đã thu (VND)")).toHaveText("0đ");
	await expect(kpiNum(page, "Còn nợ (VND)")).toHaveText("400.000đ");

	// The unpaid row shows the entered due as dd/mm (same date we filled)
	// plus the note tooltip (issue #135).
	const [, dueMonth, dueDay] = due.split("-");
	const row = invoiceTable(page).filter({ hasText: "400.000đ" });
	await expect(row.getByText(`${dueDay}/${dueMonth}`)).toBeVisible();
	await expect(row.locator('[title="QC-135 ghi chú"]')).toBeVisible();

	// Mark paid → the command bus refetches → KPIs flip in place (issue #62).
	await row.getByRole("button", { name: "Đã nhận" }).click();
	await expect(kpiNum(page, "Đã thu (VND)")).toHaveText("400.000đ");
	await expect(kpiNum(page, "Còn nợ (VND)")).toHaveText("0đ");

	// Everything survives a reload; the paid row's due cell becomes "—".
	await page.reload();
	await expect(invoiceTable(page)).toHaveCount(1);
	const paidRow = invoiceTable(page).filter({ hasText: "400.000đ" });
	await expect(paidRow.getByText("Đã thu")).toBeVisible();
	await expect(paidRow.getByText("—")).toBeVisible();
	await expect(kpiNum(page, "Đã thu (VND)")).toHaveText("400.000đ");
	await expect(kpiNum(page, "Còn nợ (VND)")).toHaveText("0đ");
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

test("tuition → tạo hóa đơn amount âm / ký tự không hợp lệ bị strip → input rỗng, field error, không POST, không row", async ({
	page,
}) => {
	await setupOrgWithEnrollment(page);
	const dialog = await openCreateInvoiceModal(page);
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await dialog.getByLabel("Số tiền (VND) *").fill("-5000");
	// mask strip dấu "-" → input rỗng → lỗi "bắt buộc" thay vì lỗi số âm
	await expect(dialog.getByLabel("Số tiền (VND) *")).toHaveValue("");

	const posts = await countInvoicePosts(page, async () => {
		await dialog
			.getByRole("button", { name: "Tạo hóa đơn", exact: true })
			.click();
		await expect(dialog.getByText("Vui lòng nhập số tiền.")).toBeVisible();
	});
	expect(posts).toBe(0);
	await expect(invoiceTable(page)).toHaveCount(0);
});

test("tuition → picker hóa đơn loại trừ học viên chưa kích hoạt (status invited)", async ({
	page,
}) => {
	const teacherEmail = await setupOrgWithEnrollment(page);

	// Tạo học viên thứ hai và thêm vào lớp nhưng KHÔNG kích hoạt (giữ invited)
	const INVITED_STUDENT = "HV-Chờ-Kích-Hoạt";
	await seedStudent({ teacherEmail, name: INVITED_STUDENT });
	await page.reload();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog2 = page.getByRole("dialog");
	const option2 = enrollDialog2.getByRole("option", { name: INVITED_STUDENT });
	await expect(option2).toBeVisible();
	await option2.click();
	await enrollDialog2.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog2).toBeHidden();
	await expect(page.getByText(INVITED_STUDENT)).toBeVisible();
	// Học viên này đang ở trạng thái 'Đã mời'
	await expect(page.getByText("Đã mời")).toBeVisible();

	// Mở modal tạo hóa đơn: chỉ thấy học viên active, KHÔNG thấy học viên invited
	const dialog = await openCreateInvoiceModal(page);
	await expect(dialog.getByLabel("Học viên *")).toContainText(STUDENT_NAME);
	await expect(dialog.getByLabel("Học viên *")).not.toContainText(
		INVITED_STUDENT,
	);
});
