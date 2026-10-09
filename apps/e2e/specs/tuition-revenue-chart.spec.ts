import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

/**
 * Biểu đồ doanh thu trên /tuition (#343, plan phase 3). Menu đổi tên
 * "Doanh thu" + section chart cột Đã thu (accent) / vệt nền Phát hành theo
 * kỳ phát hành hóa đơn (`created_at`, Asia/Ho_Chi_Minh), toggle kỳ sống
 * trong URL param `ky`.
 *
 * Seed bằng SQL trực tiếp (POST /invoices không nhận `createdAt` — schema
 * strict, DB default now): invoice tháng này đã mark-paid (`paid_amount=0`,
 * đúng shape mark-paid thật — rule revenue tính full amount) + invoice
 * tháng trước unpaid với `created_at` lùi đúng 1 tháng lịch.
 *
 * Assert qua text/aria/nhãn trục/URL — KHÔNG assert hình học SVG (dễ vỡ
 * khi bump recharts).
 */

const STUDENT_NAME = "QC-343 Học viên";
const PASSWORD = "password-8chars";

let teacherEmail: string;

/** VN luôn UTC+7, không DST — dịch mốc hiện tại sang giờ VN rồi đọc UTC. */
function vietnamNow(): { y: number; m0: number } {
	const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
	return { y: shifted.getUTCFullYear(), m0: shifted.getUTCMonth() };
}

/** Giữa tháng trước (ngày 15, 11:00 VN) — an toàn biên tháng 31 ngày. */
function lastMonthMs(): number {
	const { y, m0 } = vietnamNow();
	const prevM0 = m0 === 0 ? 11 : m0 - 1;
	const prevY = m0 === 0 ? y - 1 : y;
	return Date.UTC(prevY, prevM0, 15, 4, 0, 0);
}

/** Giữa tháng hiện tại (ngày 15, 11:00 VN) — cùng lý do với lastMonthMs. */
function thisMonthMs(): number {
	const { y, m0 } = vietnamNow();
	return Date.UTC(y, m0, 15, 4, 0, 0);
}

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function seedRevenueInvoice(opts: {
	orgId: string;
	studentId: string;
	amount: number;
	status: "paid" | "unpaid";
	createdAtMs: number;
}): Promise<string> {
	const client = openDb();
	try {
		const id = crypto.randomUUID();
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, status, due, note, date, type, method, paid_amount, created_at)
				VALUES (?, ?, ?, '', ?, ?, '', '', '', 'Học phí', '—', ?, ?)`,
			args: [
				id,
				opts.orgId,
				opts.studentId,
				opts.amount,
				opts.status,
				// mark-paid giữ paid_amount=0 (rule revenue tính full amount);
				// unpaid chưa có giao dịch nên cũng 0.
				0,
				opts.createdAtMs,
			],
		});
		return id;
	} finally {
		client.close();
	}
}

async function orgIdOfTeacher(): Promise<string> {
	const client = openDb();
	try {
		const res = await client.execute({
			sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
				WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
			args: [teacherEmail],
		});
		return String(res.rows[0]?.id ?? "");
	} finally {
		client.close();
	}
}

async function studentIdOf(orgId: string, name: string): Promise<string> {
	const client = openDb();
	try {
		const res = await client.execute({
			sql: "SELECT id FROM student WHERE org_id = ? AND name = ? LIMIT 1",
			args: [orgId, name],
		});
		return String(res.rows[0]?.id ?? "");
	} finally {
		client.close();
	}
}

/** Section biểu đồ (scope mọi assert text vào đây để tránh trùng KPI/heading). */
function chartSection(page: Page) {
	return page.getByTestId("revenue-chart-section");
}

test("doanh thu: chart 2 tháng theo created_at + toggle Quý đổi URL (?ky=quarter)", async ({
	page,
}) => {
	teacherEmail = await signUpViaUi(page, { password: PASSWORD });
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
	const orgId = await orgIdOfTeacher();
	const studentId = await studentIdOf(orgId, STUDENT_NAME);

	// Tháng này: mark-paid thủ công (paid_amount=0) — rule revenue (#343)
	// tính full amount đúng như tuitionTotals. Tháng trước: unpaid. Cả hai
	// seed giữa tháng lịch VN (thisMonthMs) — mép 00:00-07:00 VN đầu tháng,
	// Date.now() trần vẫn rơi UTC tháng trước và +7h tràn sang tháng sau.
	await seedRevenueInvoice({
		orgId,
		studentId,
		amount: 1500000,
		status: "paid",
		createdAtMs: thisMonthMs(),
	});
	await seedRevenueInvoice({
		orgId,
		studentId,
		amount: 2000000,
		status: "unpaid",
		createdAtMs: lastMonthMs(),
	});

	const { m0 } = vietnamNow();
	const thisMonthLabel = `T${m0 + 1}`;
	const prevM0 = m0 === 0 ? 11 : m0 - 1;
	const prevMonthLabel = `T${prevM0 + 1}`;
	const quarterLabel = `Q${Math.floor(m0 / 3) + 1}`;

	// Đi thẳng /tuition bằng goto (không click sidebar): store kernel nạp
	// snapshot MỘT LẦN lúc login — seed SQL diễn ra sau đó nên phải full
	// reload để snapshot thấy 2 hóa đơn vừa seed.
	await page.goto("/tuition");
	await expect(
		page.getByRole("heading", { name: "Doanh thu" }).first(),
	).toBeVisible();

	// KPI khớp rule mark-paid: full amount tính đã thu. Selector đổi từ
	// `.grid.grid-cols-3 > div` sang testid cùng commit đổi markup (plan
	// redesign, bảng "E2E bám class").
	await expect(
		page
			.locator('[data-testid="tuition-kpis"] > div')
			.filter({ hasText: "Đã thu (VND)" }),
	).toContainText("1.500.000đ");

	// Cửa sổ tháng: nhãn 2 tháng có hóa đơn đều trên trục; kỳ rỗng vẫn fill.
	const section = chartSection(page);
	await expect(section).toBeVisible();
	await expect(
		section.getByText(thisMonthLabel, { exact: true }),
	).toBeVisible();
	await expect(
		section.getByText(prevMonthLabel, { exact: true }),
	).toBeVisible();
	await expect(section.getByText("Phát hành", { exact: true })).toBeVisible();
	await expect(section.getByText("Đã thu", { exact: true })).toBeVisible();

	// Toggle "Quý" → URL param + tập nhãn đổi từ T… sang Q… (cửa sổ 8 quý
	// đè nhau nhãn Q — .first() tránh strict mode violation).
	await section.getByTestId("revenue-period-quarter").click();
	await expect(page).toHaveURL(/ky=quarter/);
	await expect(
		section.getByText(quarterLabel, { exact: true }).first(),
	).toBeVisible();
	await expect(section.getByText(thisMonthLabel, { exact: true })).toHaveCount(
		0,
	);

	// Về lại "Tháng" qua toggle (URL param cập nhật theo).
	await section.getByTestId("revenue-period-month").click();
	await expect(page).toHaveURL(/ky=month/);
	await expect(
		section.getByText(thisMonthLabel, { exact: true }),
	).toBeVisible();
});

test("doanh thu: ?ky=lạ không crash — rơi về cửa sổ tháng mặc định", async ({
	page,
}) => {
	teacherEmail = await signUpViaUi(page, { password: PASSWORD });
	// Org trống — chart hiện empty-state, trang vẫn chạy (#343 non-throw).
	await page.goto("/tuition?ky=abc");
	await expect(
		page.getByRole("heading", { name: "Doanh thu" }).first(),
	).toBeVisible();
	await expect(chartSection(page)).toBeVisible();
	await expect(page.getByTestId("revenue-chart-empty")).toBeVisible();
});
