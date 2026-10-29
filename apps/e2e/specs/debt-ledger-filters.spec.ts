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
 * E2E AC-001 (TOS-15 / issue #449): Sổ công nợ học viên (/debts) —
 * 3 thẻ KPI đầu trang, chip lọc trạng thái nợ, tìm kiếm học viên không dấu
 * debounce 300ms, lọc lớp trên URL, kết quả lọc <= 2000ms và kiểm tra 3 viewport.
 */

const STUDENT_A = "Nguyễn Minh Anh";
const STUDENT_B = "Trần Hoàng Nam";
const STUDENT_C = "Lê Thu Hà";
const CLASS_A = "IELTS 6.5A";
const CLASS_B = "IELTS 5.0B";

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

test("AC-001: Sổ công nợ học viên — 3 thẻ KPI, lọc URL, tìm kiếm debounce, 3 viewport và <= 2 giây (#449)", async ({
	page,
}) => {
	const teacherEmail = await signUpViaUi(page);
	const orgId = await orgIdForTeacherEmail(teacherEmail);

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
	const stuC = await seedStudent({
		teacherEmail,
		name: STUDENT_C,
		phone: "0905556666",
	});

	const classAId = crypto.randomUUID();
	const classBId = crypto.randomUUID();
	const now = Date.now();
	const client = openDb();
	try {
		await client.execute({
			sql: `INSERT INTO class (id, org_id, name, level, type, skills, mode, schedule, sessions_total, sessions_done, status, start_date, created_at)
				VALUES (?, ?, ?, 'Band 6.5', 'ielts', '["Writing"]', 'Online', '', 12, 0, 'active', '01/10', ?)`,
			args: [classAId, orgId, CLASS_A, now],
		});
		await client.execute({
			sql: `INSERT INTO class (id, org_id, name, level, type, skills, mode, schedule, sessions_total, sessions_done, status, start_date, created_at)
				VALUES (?, ?, ?, 'Band 5.0', 'ielts', '["Reading"]', 'Offline', '', 12, 0, 'active', '01/10', ?)`,
			args: [classBId, orgId, CLASS_B, now + 1],
		});
		const enrollments: Array<[string, string]> = [
			[stuA.id, classAId],
			[stuB.id, classBId],
			[stuC.id, classAId],
		];
		for (const [idx, [sid, cid]] of enrollments.entries()) {
			await client.execute({
				sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
					VALUES (?, ?, ?, ?, 'active', ?)`,
				args: [crypto.randomUUID(), orgId, cid, sid, now + idx],
			});
		}
	} finally {
		client.close();
	}

	// Reload để snapshot nhận classes + active enrollments vừa seed
	await page.reload();

	// 1. Mở sidebar "Công nợ" -> /debts và tạo 3 khoản thu qua UI modal
	await page.getByRole("link", { name: "Công nợ", exact: true }).click();
	await expect(page).toHaveURL(/\/debts$/);
	await expect(
		page.getByRole("heading", { name: "Sổ công nợ học viên" }),
	).toBeVisible();
	await expect(page.getByTestId("debts-empty")).toBeVisible();

	const dueYesterday = isoInDaysFromTodayVN(-1);
	const dueIn3Days = isoInDaysFromTodayVN(3);
	const dueIn10Days = isoInDaysFromTodayVN(10);

	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_A,
		amount: "4500000",
		due: dueYesterday,
	});
	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_B,
		amount: "3800000",
		due: dueIn3Days,
	});
	await createInvoiceViaModal(page, {
		studentLabelPart: STUDENT_C,
		amount: "4500000",
		due: dueIn10Days,
	});

	// Sang /tuition bấm "Đã nhận" cho hóa đơn của C để C có trạng thái "Đã thu đủ"
	await page.getByRole("link", { name: "Doanh thu", exact: true }).click();
	await expect(page).toHaveURL(/\/tuition$/);
	const rowCInTuition = page
		.getByTestId("tuition-invoices-section")
		.locator("tbody tr")
		.filter({ hasText: STUDENT_C });
	await rowCInTuition.getByRole("button", { name: "Đã nhận" }).click();
	await expect(rowCInTuition.getByText("Đã thu")).toBeVisible();

	// Quay lại sidebar "Công nợ"
	await page.getByRole("link", { name: "Công nợ", exact: true }).click();
	await expect(page).toHaveURL(/\/debts$/);

	// Kiểm tra 3 dòng và 3 thẻ KPI đầu trang
	await expect(debtRows(page)).toHaveCount(3);
	await expect(kpiCard(page, "Tổng phải thu kỳ này")).toContainText(
		"12.800.000đ",
	);
	await expect(kpiCard(page, "Tổng phải thu kỳ này")).toContainText(
		"3 học viên",
	);
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("4.500.000đ");
	await expect(kpiCard(page, "Tổng đã thu")).toContainText("1 học viên");
	await expect(kpiCard(page, "Tổng còn nợ quá hạn")).toContainText(
		"4.500.000đ",
	);
	await expect(kpiCard(page, "Tổng còn nợ quá hạn")).toContainText(
		"1 học viên",
	);

	const chipGroup = page.getByRole("group", {
		name: "Lọc trạng thái công nợ",
	});

	// 2. Bấm chip "Quá hạn" -> URL có status=overdue, chỉ còn A trong <= 2000ms
	const t0 = performance.now();
	await chipGroup.getByRole("button", { name: "Quá hạn" }).click();
	await Promise.all([
		expect(page).toHaveURL(/\/debts\?status=overdue$/),
		expect(debtRows(page)).toHaveCount(1),
		expect(debtRows(page).first()).toContainText(STUDENT_A),
	]);
	const elapsedDesktopMs = performance.now() - t0;
	expect(elapsedDesktopMs).toBeLessThanOrEqual(2000);

	// 3. Bấm "Đã thu đủ" -> chỉ còn C; reload -> vẫn chỉ C; KPI quá hạn không về 0 (D5)
	await chipGroup.getByRole("button", { name: "Đã thu đủ" }).click();
	await expect(page).toHaveURL(/\/debts\?status=clear$/);
	await expect(debtRows(page)).toHaveCount(1);
	await expect(debtRows(page).first()).toContainText(STUDENT_C);
	await expect(kpiCard(page, "Tổng còn nợ quá hạn")).toContainText(
		"4.500.000đ",
	);

	await page.reload();
	await expect(page).toHaveURL(/\/debts\?status=clear$/);
	await expect(debtRows(page)).toHaveCount(1);
	await expect(debtRows(page).first()).toContainText(STUDENT_C);
	await expect(
		chipGroup.getByRole("button", { name: "Đã thu đủ" }),
	).toHaveAttribute("aria-pressed", "true");

	// 4. Chọn chip "Tất cả" rồi gõ tên B không dấu -> URL có q= sau debounce, chỉ còn B
	await chipGroup.getByRole("button", { name: "Tất cả" }).click();
	await expect(page).toHaveURL(/\/debts$/);
	await expect(debtRows(page)).toHaveCount(3);

	const searchInput = page.getByRole("textbox", {
		name: "Tìm học viên hoặc số điện thoại",
	});
	await searchInput.fill("tran hoang nam");
	await expect(page).toHaveURL(/\/debts\?q=tran(\+|%20)hoang(\+|%20)nam$/);
	await expect(debtRows(page)).toHaveCount(1);
	await expect(debtRows(page).first()).toContainText(STUDENT_B);
	await expect(kpiCard(page, "Tổng phải thu kỳ này")).toContainText(
		"3.800.000đ",
	);

	// Xóa bộ lọc để về trạng thái đủ 3 học viên
	await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
	await expect(page).toHaveURL(/\/debts$/);
	await expect(debtRows(page)).toHaveCount(3);

	// Chụp screenshot 3 viewport (1440×900, 768×1024, 375×812) sau khi reload/xóa lọc
	const screenshotsDir = new URL(
		"../../../plans/261026-2038-tos-15-debt-ledger-kpi-filters/screenshots/",
		import.meta.url,
	).pathname;
	mkdirSync(screenshotsDir, { recursive: true });
	for (const [w, h, name] of [
		[1440, 900, "tos15-debt-ledger-1440"],
		[768, 1024, "tos15-debt-ledger-768"],
		[375, 812, "tos15-debt-ledger-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(300);
		await page.screenshot({
			path: `${screenshotsDir}${name}.png`,
			fullPage: true,
		});
	}

	// 5. Lặp bước 2 ở viewport mobile 375×812 + kiểm tra không tràn ngang
	await page.setViewportSize({ width: 375, height: 812 });
	const tMobile = performance.now();
	await chipGroup.getByRole("button", { name: "Quá hạn" }).click();
	await Promise.all([
		expect(page).toHaveURL(/\/debts\?status=overdue$/),
		expect(debtRows(page)).toHaveCount(1),
		expect(debtRows(page).first()).toContainText(STUDENT_A),
	]);
	const elapsedMobileMs = performance.now() - tMobile;
	expect(elapsedMobileMs).toBeLessThanOrEqual(2000);

	const hasHorizontalOverflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
