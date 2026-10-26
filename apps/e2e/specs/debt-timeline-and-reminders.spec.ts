import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	isoInDaysFromTodayVN,
	orgIdForTeacherEmail,
	seedStudent,
	signUpViaUi,
} from "./helpers";
import { API_ORIGIN } from "./origins";

/**
 * E2E AC-004 (TOS-18 / issue #452):
 * 1. Bấm (eye) trên dòng "Nguyễn Minh Anh" -> drawer liệt kê hóa đơn phát hành
 *    + giao dịch QR Bank-Hub + phiếu thu Tiền mặt theo thứ tự mới nhất trước;
 *    Esc đóng drawer và trả focus về nút (eye).
 * 2. Học viên đã thu đủ không tích chọn được; tích 2 học viên đang nợ ->
 *    "Gửi nhắc học phí (2)" -> xác nhận -> màn Nhật ký thông báo (/notifications)
 *    có 2 bản ghi "Nhắc học phí"; bấm gửi lần 2 cùng ngày không tạo bản ghi trùng.
 * 3. Lặp kiểm tra ở viewport 375×812 và chụp ảnh 3 viewport.
 */

const STUDENT_A = "Nguyễn Minh Anh";
const STUDENT_B = "Trần Hoàng Nam";
const STUDENT_CLEAR = "Lê Thu Hà";
const CLASS_A = "IELTS 6.5A";

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
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
	const row = page
		.getByTestId("debt-ledger-table")
		.locator("tbody tr")
		.filter({ hasText: studentName });
	await row
		.getByRole("button", { name: `Thu tiền cho ${studentName}` })
		.click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", {
			name: `Ghi nhận thu tiền học phí — ${studentName}`,
		}),
	).toBeVisible();
	return dialog;
}

async function paymentCodeForStudent(studentId: string): Promise<string> {
	const client = openDb();
	try {
		const res = await client.execute({
			sql: "SELECT payment_code FROM invoice WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
			args: [studentId],
		});
		const code = (res.rows[0] as { payment_code?: string } | undefined)
			?.payment_code;
		if (!code) throw new Error(`missing payment_code for student ${studentId}`);
		return code;
	} finally {
		client.close();
	}
}

const screenshotsDir = new URL(
	"../../../plans/261026-2038-tos-18-billing-timeline-and-reminders/screenshots/",
	import.meta.url,
).pathname;

test("AC-004: dòng thời gian hóa đơn & giao dịch (QR Bank-Hub + thu thủ công) và gửi nhắc học phí chống trùng trong ngày (#452)", async ({
	page,
	request,
}) => {
	const teacherEmail = await signUpViaUi(page);
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	const bankAccountXid = `xid-${orgId.slice(0, 12)}`;

	const stuA = await seedStudent({
		teacherEmail,
		name: STUDENT_A,
		phone: "0901112222",
	});
	const stuB = await seedStudent({
		teacherEmail,
		name: STUDENT_B,
		phone: "0903334444",
	});
	const stuClear = await seedStudent({
		teacherEmail,
		name: STUDENT_CLEAR,
		phone: "0905556666",
	});

	const classAId = crypto.randomUUID();
	const enClearId = crypto.randomUUID();
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
				VALUES (?, ?, ?, ?, 'active', ?), (?, ?, ?, ?, 'active', ?), (?, ?, ?, ?, 'active', ?)`,
			args: [
				crypto.randomUUID(),
				orgId,
				classAId,
				stuA.id,
				now,
				crypto.randomUUID(),
				orgId,
				classAId,
				stuB.id,
				now,
				enClearId,
				orgId,
				classAId,
				stuClear.id,
				now,
			],
		});
		// Hóa đơn đã thu đủ cho Lê Thu Hà
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, paid_amount, status, due, note, date, type, method, created_at)
				VALUES (?, ?, ?, ?, 4500000, 4500000, 'paid', ?, '', '26/10', 'Học phí', 'Chuyển khoản', ?)`,
			args: [
				crypto.randomUUID(),
				orgId,
				stuClear.id,
				enClearId,
				isoInDaysFromTodayVN(-5),
				now,
			],
		});
		// Liên kết ngân hàng để nhận webhook IPN của SePay Bank-Hub
		await client.execute({
			sql: `INSERT INTO org_bank_link (org_id, company_xid, bank_account_xid, status, brand_name, bank_bin, bank_code, account_number, account_holder_name, updated_at)
				VALUES (?, ?, ?, 'linked', 'MBBank', '970422', 'MB', '0123456789', 'TEACHER OS', ?)`,
			args: [orgId, `comp-${orgId.slice(0, 12)}`, bankAccountXid, now],
		});
	} finally {
		client.close();
	}

	await page.reload();

	// Điều hướng sang /debts và tạo hóa đơn cho Nguyễn Minh Anh (4.500.000đ) và Trần Hoàng Nam (3.800.000đ)
	await page.getByRole("link", { name: "Công nợ", exact: true }).click();
	await expect(page).toHaveURL(/\/debts$/);

	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_A,
		amount: "4500000",
		due: isoInDaysFromTodayVN(10),
	});
	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_B,
		amount: "3800000",
		due: isoInDaysFromTodayVN(5),
	});

	// Bắn webhook IPN QR Bank-Hub 1.000.000đ cho hóa đơn của Nguyễn Minh Anh
	const paymentCodeA = await paymentCodeForStudent(stuA.id);
	const ipnRes = await request.post(
		`${API_ORIGIN}/webhooks/sepay/bankhub/ipn`,
		{
			headers: {
				Authorization: "Apikey e2e-ipn-key",
				"Content-Type": "application/json",
			},
			data: {
				gateway: "MBBank",
				transaction_date: "2026-10-27 10:00:00",
				account_number: "0123456789",
				bank_account_xid: bankAccountXid,
				content: `PHU HUYNH CHUYEN KHOAN ${paymentCodeA}`,
				transfer_type: "credit",
				amount: 1_000_000,
				reference_code: "FT-TOS18",
				payment_code: null,
				transaction_id: `tx-tos18-${crypto.randomUUID()}`,
			},
		},
	);
	expect(ipnRes.status()).toBe(200);

	await page.reload();

	// Ghi nhận thêm 1 phiếu thu Tiền mặt 1.000.000đ ("Đóng tiền mặt đợt 2") cho Nguyễn Minh Anh
	const payDialog = await openRecordPayment(page, STUDENT_A);
	await payDialog
		.getByLabel("Số tiền thực thu lần này (VND) *")
		.fill("1000000");
	await payDialog.getByRole("radio", { name: "Tiền mặt" }).check();
	await payDialog
		.getByLabel("Ghi chú", { exact: false })
		.first()
		.fill("Đóng tiền mặt đợt 2");
	await payDialog
		.getByRole("button", { name: "Lưu phiếu thu học phí", exact: true })
		.click();
	await expect(payDialog).toBeHidden();

	// 1. Kịch bản Timeline: mở drawer của Nguyễn Minh Anh
	const eyeBtnA = page.getByRole("button", {
		name: `Xem dòng thời gian lịch sử hóa đơn & giao dịch của ${STUDENT_A}`,
	});
	await eyeBtnA.click();

	const drawer = page.getByTestId("billing-timeline-drawer");
	await expect(drawer).toBeVisible();
	await expect(drawer.getByTestId("billing-timeline-summary")).toContainText(
		"4.500.000đ",
	);
	await expect(drawer.getByTestId("billing-timeline-summary")).toContainText(
		"2.000.000đ",
	);
	await expect(drawer.getByTestId("billing-timeline-summary")).toContainText(
		"2.500.000đ",
	);

	const items = drawer.getByTestId("billing-timeline-item");
	await expect(items).toHaveCount(3);
	// Mục 0 (mới nhất): Thu thủ công · Tiền mặt
	await expect(items.nth(0)).toContainText("Thu 1.000.000đ");
	await expect(items.nth(0)).toContainText(
		"Thu thủ công · Tiền mặt — Đóng tiền mặt đợt 2",
	);
	// Mục 1: QR Bank-Hub
	await expect(items.nth(1)).toContainText("Thu 1.000.000đ");
	await expect(items.nth(1)).toContainText("QR Bank-Hub");
	// Mục 2 (cũ nhất): Phát hành hóa đơn 4.500.000đ
	await expect(items.nth(2)).toContainText("Phát hành hóa đơn");
	await expect(items.nth(2)).toContainText("4.500.000đ");

	// Chụp ảnh 3 viewport khi drawer đang mở
	mkdirSync(screenshotsDir, { recursive: true });
	for (const [w, h, name] of [
		[1440, 900, "tos18-timeline-drawer-1440"],
		[768, 1024, "tos18-timeline-drawer-768"],
		[375, 812, "tos18-timeline-drawer-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(200);
		await page.screenshot({
			path: `${screenshotsDir}${name}.png`,
			fullPage: true,
		});
	}

	// Trả về 1440×900, nhấn Escape đóng drawer và kiểm tra focus về nút (eye)
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.keyboard.press("Escape");
	await expect(drawer).toBeHidden();
	await expect(eyeBtnA).toBeFocused();

	// 2. Kịch bản Nhắc học phí:
	// Học viên đã thu đủ (Lê Thu Hà) có checkbox disabled
	const cbClear = page.getByRole("checkbox", {
		name: `Chọn học viên ${STUDENT_CLEAR}`,
	});
	await expect(cbClear).toBeDisabled();

	// Tích chọn Nguyễn Minh Anh + Trần Hoàng Nam
	await page
		.getByRole("checkbox", { name: `Chọn học viên ${STUDENT_A}` })
		.check();
	await page
		.getByRole("checkbox", { name: `Chọn học viên ${STUDENT_B}` })
		.check();

	const remindBtn = page.getByTestId("send-debt-reminders");
	await expect(remindBtn).toBeEnabled();
	await expect(remindBtn).toContainText("Gửi nhắc học phí (2)");

	await remindBtn.click();
	const confirmDialog = page.getByRole("dialog");
	await expect(confirmDialog).toContainText(
		"Gửi nhắc học phí cho 2 học viên (2 hóa đơn còn nợ)?",
	);
	await confirmDialog.getByTestId("confirm-send-debt-reminders").click();
	await expect(confirmDialog).toBeHidden();

	await expect(
		page.getByText(/Đã gửi nhắc học phí cho 2 hóa đơn/),
	).toBeVisible();

	// Mở màn Nhật ký thông báo [5] (/notifications), lọc sự kiện Học phí và kiểm tra 2 bản ghi "Nhắc học phí"
	await page.goto("/notifications?event=tuition");
	await expect(
		page.getByRole("heading", { name: /Nhật ký gửi thông báo/ }),
	).toBeVisible();
	const reminderRows = page
		.locator("table tbody tr")
		.filter({ hasText: "Nhắc học phí" });
	await expect(reminderRows).toHaveCount(2);
	await expect(reminderRows.filter({ hasText: STUDENT_A })).toHaveCount(1);
	await expect(reminderRows.filter({ hasText: STUDENT_B })).toHaveCount(1);

	// Quay lại /debts, tích chọn lại 2 học viên và bấm gửi lần 2 cùng ngày -> báo đã nhắc hôm nay, không thêm dòng
	await page.goto("/debts");
	await page
		.getByRole("checkbox", { name: `Chọn học viên ${STUDENT_A}` })
		.check();
	await page
		.getByRole("checkbox", { name: `Chọn học viên ${STUDENT_B}` })
		.check();
	await remindBtn.click();
	await page
		.getByRole("dialog")
		.getByTestId("confirm-send-debt-reminders")
		.click();
	await expect(
		page.getByText(/đã được gửi nhắc học phí trong hôm nay/),
	).toBeVisible();

	await page.goto("/notifications?event=tuition");
	await expect(
		page.locator("table tbody tr").filter({ hasText: "Nhắc học phí" }),
	).toHaveCount(2);

	// 3. Kịch bản 1 lặp ở 375×812
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto("/debts");
	const eyeBtnMobile = page.getByRole("button", {
		name: `Xem dòng thời gian lịch sử hóa đơn & giao dịch của ${STUDENT_A}`,
	});
	await eyeBtnMobile.click();
	await expect(page.getByTestId("billing-timeline-drawer")).toBeVisible();
	await expect(page.getByTestId("billing-timeline-item")).toHaveCount(3);
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("billing-timeline-drawer")).toBeHidden();
});
