import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	isoInDaysFromTodayVN,
	orgIdForTeacherEmail,
	seedStudent,
	signUpViaUi,
} from "./helpers";

/**
 * E2E AC-002 (TOS-16 / issue #450): ghi nhận thu học phí một phần rồi toàn
 * bộ trên Sổ công nợ (/debts) — hộp thoại "Ghi nhận thu tiền học phí", phiếu
 * thu lưu vào ledger, trạng thái công nợ Còn nợ ↔ Đã thu đủ, 3 thẻ KPI cập
 * nhật ngay và phiếu thu hiện ở trang chi tiết hóa đơn với phương thức.
 */

const STUDENT_A = "Nguyễn Minh Anh";
const CLASS_A = "IELTS 6.5A";

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

function kpiCard(page: Page, label: string) {
	return page
		.locator('[data-testid="debt-kpis"] > div')
		.filter({ hasText: label });
}

function debtRows(page: Page) {
	return page.getByTestId("debt-ledger-table").locator("tbody tr");
}

async function createInvoiceViaModal(
	page: Page,
	opts: { studentLabelPart: string; amount: string; due: string },
) {
	await page.getByTestId("create-invoice").click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();

	const select = dialog.getByLabel("Học viên *");
	const optionValue = await select
		.locator("option", { hasText: opts.studentLabelPart })
		.getAttribute("value");
	expect(optionValue).toBeTruthy();
	await select.selectOption(optionValue as string);

	await dialog.getByLabel("Số tiền (VND) *").fill(opts.amount);
	await dialog.getByLabel("Ngày đến hạn *").fill(opts.due);
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();
}

async function openRecordPayment(page: Page, studentName: string) {
	const row = debtRows(page).filter({ hasText: studentName });
	await row.getByRole("button", { name: `Thu tiền cho ${studentName}` }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", {
			name: `Ghi nhận thu tiền học phí — ${studentName}`,
		}),
	).toBeVisible();
	return dialog;
}

async function invoiceIdForStudent(studentId: string): Promise<string> {
	const client = openDb();
	try {
		const res = await client.execute({
			sql: "SELECT id FROM invoice WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
			args: [studentId],
		});
		const id = (res.rows[0] as { id: string } | undefined)?.id;
		if (!id) throw new Error(`no invoice for student ${studentId}`);
		return id;
	} finally {
		client.close();
	}
}

const screenshotsDir = new URL(
	"../../../plans/261026-2038-tos-16-record-tuition-payment/screenshots/",
	import.meta.url,
).pathname;

test("AC-002: thu một phần 2.000.000 rồi thu đủ 2.500.000 — trạng thái và KPI cập nhật ngay (#450)", async ({
	page,
}) => {
	const teacherEmail = await signUpViaUi(page);
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	const stuA = await seedStudent({
		teacherEmail,
		name: STUDENT_A,
		phone: "0901112222",
	});

	const classAId = crypto.randomUUID();
	const now = Date.now();
	const client = openDb();
	try {
		await client.execute({
			sql: `INSERT INTO class (id, org_id, name, level, type, skills, mode, schedule, sessions_total, sessions_done, status, start_date, created_at)
				VALUES (?, ?, ?, 'Band 6.5', 'ielts', '["Writing"]', 'Online', '', 12, 0, 'active', '01/10', ?)`,
			args: [classAId, orgId, CLASS_A, now],
		});
		await client.execute({
			sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
				VALUES (?, ?, ?, ?, 'active', ?)`,
			args: [crypto.randomUUID(), orgId, classAId, stuA.id, now],
		});
	} finally {
		client.close();
	}

	await page.reload();

	// Tạo khoản thu 4.500.000, hạn +10 ngày (ngoài cửa sổ "Sắp đến hạn" +7
	// để badge sau thu một phần rơi đúng "Còn nợ").
	await page.getByRole("link", { name: "Công nợ", exact: true }).click();
	await expect(page).toHaveURL(/\/debts$/);
	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_A,
		amount: "4500000",
		due: isoInDaysFromTodayVN(10),
	});

	const rowA = debtRows(page).filter({ hasText: STUDENT_A });
	await expect(rowA).toHaveCount(1);
	await expect(rowA).toContainText("4.500.000đ");
	await expect(rowA).toContainText("Còn nợ");
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("0đ");

	// Lần 1: thu 2.000.000 Tiền mặt, ghi chú "Đợt 1".
	const dialog1 = await openRecordPayment(page, STUDENT_A);
	await expect(
		dialog1.getByTestId("payment-summary"),
	).toContainText("Phải đóng 4.500.000đ");
	await dialog1.getByLabel("Số tiền thực thu lần này (VND) *").fill("2000000");
	await dialog1.getByRole("radio", { name: "Tiền mặt" }).check();
	await dialog1
		.getByLabel("Ghi chú", { exact: false })
		.first()
		.fill("Đợt 1");
	await expect(
		dialog1.getByText(/Số dư còn nợ sau giao dịch này/),
	).toContainText("2.500.000đ");
	await expect(
		dialog1.getByText(/Số dư còn nợ sau giao dịch này/),
	).toContainText("Còn nợ");
	await dialog1
		.getByRole("button", { name: "Lưu phiếu thu học phí", exact: true })
		.click();
	await expect(dialog1).toBeHidden();

	// Dòng học viên + KPI đổi ngay (refresh được await trước khi hộp thoại đóng).
	await expect(rowA).toContainText("2.000.000đ");
	await expect(rowA).toContainText("2.500.000đ");
	await expect(rowA).toContainText("Còn nợ");
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("2.000.000đ");

	// Lần 2: "Thu toàn bộ" 2.500.000 → Đã thu đủ.
	const dialog2 = await openRecordPayment(page, STUDENT_A);
	await dialog2.getByRole("button", { name: "Thu toàn bộ 2.500.000đ" }).click();
	await expect(
		dialog2.getByText(/Số dư còn nợ sau giao dịch này/),
	).toContainText("0đ");
	await expect(
		dialog2.getByText(/Số dư còn nợ sau giao dịch này/),
	).toContainText("Đã thu đủ");
	await dialog2
		.getByRole("button", { name: "Lưu phiếu thu học phí", exact: true })
		.click();
	await expect(dialog2).toBeHidden();

	await expect(rowA).toContainText("4.500.000đ");
	await expect(rowA).toContainText("Đã thu đủ");
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("4.500.000đ");

	// Reload giữ nguyên trạng thái.
	await page.reload();
	await expect(debtRows(page)).toHaveCount(1);
	await expect(debtRows(page).first()).toContainText("Đã thu đủ");
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("4.500.000đ");

	// Chi tiết hóa đơn: 2 giao dịch — đợt 1 Tiền mặt "Đợt 1", đợt 2 Chuyển
	// khoản (mặc định của hộp thoại) không ghi chú.
	const invoiceId = await invoiceIdForStudent(stuA.id);
	await page.goto(`/tuition/${invoiceId}`);
	const txTable = page.locator("table").last();
	await expect(txTable).toBeVisible();
	const txRows = txTable.locator("tbody tr");
	await expect(txRows).toHaveCount(2);
	await expect(txRows.filter({ hasText: "Đợt 1" })).toHaveCount(1);
	await expect(txRows.filter({ hasText: "Tiền mặt" })).toHaveCount(1);
	await expect(txRows.filter({ hasText: "Chuyển khoản" })).toHaveCount(1);

	// Screenshot 3 viewport (1440×900, 768×1024, 375×812).
	mkdirSync(screenshotsDir, { recursive: true });
	for (const [w, h, name] of [
		[1440, 900, "tos16-record-payment-1440"],
		[768, 1024, "tos16-record-payment-768"],
		[375, 812, "tos16-record-payment-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(300);
		await page.screenshot({ path: `${screenshotsDir}${name}.png`, fullPage: true });
	}
	const hasHorizontalOverflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
