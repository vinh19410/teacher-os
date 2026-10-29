import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	isoInDaysFromTodayVN,
	orgIdForTeacherEmail,
	seedOrgMember,
	seedStudent,
	signUpViaUi,
} from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * E2E AC-003 (TOS-17 / issue #451):
 * 1. Số tiền thu không hợp lệ: nợ 2.500.000, nhập `0` hoặc `3.000.000` → lỗi
 *    inline "Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ"
 *    dưới ô tiền, nút "Lưu phiếu thu học phí" bị khóa; sửa về `2.500.000` →
 *    hết lỗi, nút bật và lưu thành công.
 * 2. Phân quyền tài chính: thành viên vai trò Trợ giảng (`ta`) hoặc Giáo viên
 *    đứng lớp (`class_teacher`) mở `/debts` hoặc `/tuition` → điều hướng về
 *    `/dashboard` kèm thông báo, Sidebar ẩn "Công nợ" / "Doanh thu", gọi API
 *    công nợ trả 403.
 */

const STUDENT_A = "Nguyễn Minh Anh";
const CLASS_A = "IELTS 6.5A";
const INLINE_ERROR =
	"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ";

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
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

const screenshotsDir = new URL(
	"../../../plans/261026-2038-tos-17-payment-validation-and-finance-guard/screenshots/",
	import.meta.url,
).pathname;

test("AC-003 Scenario 1: nợ 2.500.000 — nhập 0 hoặc 3.000.000 hiện lỗi inline và khóa nút Lưu, sửa 2.500.000 bật nút (#451)", async ({
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
	const enrollmentId = crypto.randomUUID();
	const invoiceId = crypto.randomUUID();
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
			args: [enrollmentId, orgId, classAId, stuA.id, now],
		});
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, paid_amount, status, date, due, type, method, note, created_at)
				VALUES (?, ?, ?, ?, 4500000, 0, 'unpaid', '26/10', ?, 'Học phí', 'Chuyển khoản', '', ?)`,
			args: [
				invoiceId,
				orgId,
				stuA.id,
				enrollmentId,
				isoInDaysFromTodayVN(10),
				now,
			],
		});
	} finally {
		client.close();
	}

	// Thu trước 2.000.000 qua API để khoản thu còn nợ đúng 2.500.000.
	const prePayRes = await page.request.post(
		`${API_ORIGIN}/api/invoices/${invoiceId}/payments`,
		{
			data: {
				clientRequestId: crypto.randomUUID(),
				amount: 2_000_000,
				method: "cash",
				note: "Đợt 1",
			},
			headers: {
				"Content-Type": "application/json",
				Origin: WEB_ORIGIN,
			},
		},
	);
	expect(prePayRes.status()).toBe(201);

	await page.goto("/debts");
	const rowA = page
		.getByTestId("debt-ledger-table")
		.locator("tbody tr")
		.filter({ hasText: STUDENT_A });
	await expect(rowA).toContainText("2.500.000đ");

	const dialog = await openRecordPayment(page, STUDENT_A);
	await expect(dialog.getByTestId("payment-summary")).toContainText(
		"Còn nợ 2.500.000đ",
	);

	const amountInput = dialog.getByLabel("Số tiền thực thu lần này (VND) *");
	const saveBtn = dialog.getByRole("button", {
		name: "Lưu phiếu thu học phí",
		exact: true,
	});

	// Mới mở hộp thoại: nút Lưu khóa, chưa hiện lỗi đỏ.
	await expect(saveBtn).toBeDisabled();
	await expect(dialog.getByText(INLINE_ERROR)).toBeHidden();

	// Nhập 0 → hiện lỗi inline, aria-invalid="true", nút Lưu khóa.
	await amountInput.fill("0");
	await expect(dialog.getByText(INLINE_ERROR)).toBeVisible();
	await expect(amountInput).toHaveAttribute("aria-invalid", "true");
	await expect(saveBtn).toBeDisabled();

	// Nhập 3.000.000 (vượt nợ 2.500.000) → vẫn hiện lỗi inline, nút Lưu khóa.
	await amountInput.fill("3000000");
	await expect(dialog.getByText(INLINE_ERROR)).toBeVisible();
	await expect(amountInput).toHaveAttribute("aria-invalid", "true");
	await expect(saveBtn).toBeDisabled();

	// Chụp screenshot trạng thái lỗi inline ở 3 viewport.
	mkdirSync(screenshotsDir, { recursive: true });
	for (const [w, h, name] of [
		[1440, 900, "tos17-invalid-amount-1440"],
		[768, 1024, "tos17-invalid-amount-768"],
		[375, 812, "tos17-invalid-amount-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(200);
		await page.screenshot({
			path: `${screenshotsDir}${name}.png`,
			fullPage: true,
		});
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	// Sửa về 2.500.000 → hết lỗi, nút Lưu bật và lưu thành công.
	await amountInput.fill("2500000");
	await expect(dialog.getByText(INLINE_ERROR)).toBeHidden();
	await expect(saveBtn).toBeEnabled();
	await saveBtn.click();
	await expect(dialog).toBeHidden();
	await expect(rowA).toContainText("Đã thu đủ");
});

test("AC-003 Scenario 2: thành viên role ta và class_teacher bị chặn 403 ở API tài chính và điều hướng về /dashboard (#451)", async ({
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
	const enrollmentId = crypto.randomUUID();
	const invoiceId = crypto.randomUUID();
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
			args: [enrollmentId, orgId, classAId, stuA.id, now],
		});
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, paid_amount, status, date, due, type, method, note, created_at)
				VALUES (?, ?, ?, ?, 4500000, 0, 'unpaid', '26/10', ?, 'Học phí', 'Chuyển khoản', '', ?)`,
			args: [
				invoiceId,
				orgId,
				stuA.id,
				enrollmentId,
				isoInDaysFromTodayVN(10),
				now,
			],
		});
	} finally {
		client.close();
	}

	// 1. Đăng nhập thành viên role "ta" → mở /debts → về /dashboard + thông báo, Sidebar ẩn mục tài chính, API trả 403.
	await seedOrgMember(page, { teacherEmail, role: "ta" });
	await page.goto("/debts");
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(
		page.getByText("Bạn không có quyền xem Sổ công nợ"),
	).toBeVisible();

	const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
	await expect(nav.getByRole("link", { name: "Công nợ" })).toHaveCount(0);
	await expect(nav.getByRole("link", { name: "Doanh thu" })).toHaveCount(0);

	const taPayRes = await page.request.post(
		`${API_ORIGIN}/api/invoices/${invoiceId}/payments`,
		{
			data: {
				clientRequestId: crypto.randomUUID(),
				amount: 500_000,
				method: "cash",
				note: "",
			},
			headers: {
				"Content-Type": "application/json",
				Origin: WEB_ORIGIN,
			},
		},
	);
	expect(taPayRes.status()).toBe(403);
	expect(await taPayRes.json()).toEqual({ error: "finance-forbidden" });

	const taTxRes = await page.request.get(
		`${API_ORIGIN}/api/invoices/${invoiceId}/transactions`,
	);
	expect(taTxRes.status()).toBe(403);

	const taSnapRes = await page.request.get(`${API_ORIGIN}/api/kernel`);
	expect(taSnapRes.status()).toBe(200);
	const taSnap = (await taSnapRes.json()) as {
		invoices: unknown[];
		viewer?: { role: string; canAccessFinance: boolean };
	};
	expect(taSnap.invoices).toEqual([]);
	expect(taSnap.viewer).toEqual({ role: "ta", canAccessFinance: false });

	// 2. Đăng nhập thành viên role "class_teacher" → mở /tuition → về /dashboard + thông báo, API trả 403.
	await seedOrgMember(page, { teacherEmail, role: "class_teacher" });
	await page.goto("/tuition");
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(
		page.getByText("Bạn không có quyền xem Sổ công nợ"),
	).toBeVisible();
	await expect(nav.getByRole("link", { name: "Công nợ" })).toHaveCount(0);
	await expect(nav.getByRole("link", { name: "Doanh thu" })).toHaveCount(0);

	const ctCreateRes = await page.request.post(`${API_ORIGIN}/api/invoices`, {
		data: {
			enrollmentId,
			amount: 1_000_000,
			due: isoInDaysFromTodayVN(10),
			note: "",
		},
		headers: {
			"Content-Type": "application/json",
			Origin: WEB_ORIGIN,
		},
	});
	expect(ctCreateRes.status()).toBe(403);
	expect(await ctCreateRes.json()).toEqual({ error: "finance-forbidden" });
});
