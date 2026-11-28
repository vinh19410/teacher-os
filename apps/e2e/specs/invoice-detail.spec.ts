import { createHmac } from "node:crypto";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { E2E_SEPAY_WEBHOOK_SECRET } from "../src/fake-sepay";
import { seedStudent, signUpViaApi } from "./helpers";
import { API_ORIGIN, LMS_ORIGIN, TEACHER_BASE_URL } from "./origins";

/**
 * Invoice detail page E2E (#345). Click/Enter trên dòng hóa đơn mở
 * /tuition/$invoiceId hiển thị đủ thông tin + QR + lịch sử giao dịch đã khớp.
 */

const PASSWORD = "password-8chars";
const PARTIAL_CODE = "TOSABCD2345";
const LEGACY_CODE = "TOSEFGH5678";
const LIVE_CODE = "TOSJKMN2345";
const SHOT_CODE = "TOSTUV2345";

let teacherEmail = "";
const myAccountNumber = `22${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}6789`;
let studentId = "";
let classId = "";
let enrollmentId = "";
let partialId = "";
let legacyId = "";
let liveId = "";
let shotId = "";

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function seedInvoice(opts: {
	orgId: string;
	studentId: string;
	code: string;
	amount: number;
	enrollmentId?: string;
	note?: string;
	due?: string;
}): Promise<string> {
	const client = openDb();
	try {
		const id = crypto.randomUUID();
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, status, due, note, date, type, method, payment_code, pay_token, paid_amount, created_at)
				VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, '07/10', 'Học phí', 'CK', ?, ?, 0, ?)`,
			args: [
				id,
				opts.orgId,
				opts.studentId,
				opts.enrollmentId ?? "",
				opts.amount,
				opts.due ?? "",
				opts.note ?? "",
				opts.code,
				`e2e-token-${opts.code.toLowerCase()}-000000`,
				Date.now(),
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

async function simulateIpn(
	request: import("@playwright/test").APIRequestContext,
	input: { transactionId: string; amount: number; content: string },
): Promise<number> {
	const rawBody = JSON.stringify({
		id: input.transactionId,
		gateway: "MBBank",
		transactionDate: "2026-10-05 10:00:00",
		accountNumber: myAccountNumber,
		subAccount: "",
		code: null,
		content: input.content,
		transferType: "in",
		description: input.content,
		transferAmount: input.amount,
		accumulated: input.amount,
		referenceCode: "FT-E2E",
	});
	const timestamp = Math.floor(Date.now() / 1000);
	const signature =
		"sha256=" +
		createHmac("sha256", E2E_SEPAY_WEBHOOK_SECRET)
			.update(`${timestamp}.${rawBody}`)
			.digest("hex");
	const res = await request.post(`${API_ORIGIN}/webhooks/sepay`, {
		headers: {
			"Content-Type": "application/json",
			"X-SePay-Signature": signature,
			"X-SePay-Timestamp": String(timestamp),
		},
		data: rawBody,
	});
	return res.status();
}

async function teacherSignIn(page: Page): Promise<void> {
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(teacherEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });
}

/** Click the invoice row whose amount cell shows `amountText`. */
async function clickInvoiceRow(page: Page, amountText: string) {
	await page.goto(`${TEACHER_BASE_URL}/tuition`);
	await expect(page.getByRole("heading", { name: "Hóa đơn" })).toBeVisible();
	const row = page.locator("tbody tr", { hasText: amountText }).first();
	await row.click();
}

test.describe.configure({ mode: "serial" });

test.describe("Invoice detail page (#345)", () => {
	test("setup: teacher signs up, links a bank, seeds fixtures", async ({
		page,
		request,
	}) => {
		teacherEmail = `lan.detail.${Date.now()}@e2e.local`;
		await signUpViaApi(page, { email: teacherEmail, password: PASSWORD });

		await page.goto(`${TEACHER_BASE_URL}/profile`);
		await page.getByTestId("bank-bin-select").selectOption("970422");
		await page.getByTestId("bank-account-number").fill(myAccountNumber);
		await page.getByTestId("bank-holder-name").fill("NGUYEN VAN E2E");
		await page.getByTestId("bank-link-submit").click();
		await expect(page.getByText("Đã liên kết")).toBeVisible({
			timeout: 20_000,
		});

		const orgId = await orgIdOfTeacher();
		const student = await seedStudent({
			teacherEmail,
			name: "Học Viên Detail",
		});
		studentId = student.id;

		// Class + enrollment thật (seedStudent chỉ INSERT row student —
		// invoice legacy không có enrollment phải seed class/enrollment riêng).
		classId = crypto.randomUUID();
		enrollmentId = crypto.randomUUID();
		{
			const client = openDb();
			try {
				await client.execute({
					sql: `INSERT INTO class (id, org_id, name, level, type, skills, mode, schedule, sessions_total, sessions_done, status, start_date, created_at)
						VALUES (?, ?, 'E2E Lớp Detail', 'Intermediate', 'ielts', '[]', 'Online', '', 0, 0, 'active', '', ?)`,
					args: [classId, orgId, Date.now()],
				});
				await client.execute({
					sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
						VALUES (?, ?, ?, ?, 'active', ?)`,
					args: [enrollmentId, orgId, classId, studentId, Date.now()],
				});
			} finally {
				client.close();
			}
		}

		partialId = await seedInvoice({
			orgId,
			studentId,
			code: PARTIAL_CODE,
			amount: 500000,
			enrollmentId,
			note: "Học phí tháng 10 — EARLY BIRD",
			due: "2026-12-31",
		});
		legacyId = await seedInvoice({
			orgId,
			studentId,
			code: LEGACY_CODE,
			amount: 400000,
		});
		liveId = await seedInvoice({
			orgId,
			studentId,
			code: LIVE_CODE,
			amount: 600000,
			enrollmentId,
			due: "2026-12-31",
		});
		shotId = await seedInvoice({
			orgId,
			studentId,
			code: SHOT_CODE,
			amount: 450000,
			enrollmentId,
			note: "Hóa đơn cho screenshot",
			due: "2026-12-31",
		});

		// 150k vào hóa đơn screenshot để chụp trạng thái "Thu một phần".
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-detail-shot",
				amount: 150000,
				content: `Hoc phi ${SHOT_CODE}`,
			}),
		).toBe(200);
	});

	test("row click opens the detail page with every field", async ({
		page,
		request,
	}) => {
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-detail-200",
				amount: 200000,
				content: `Hoc phi ${PARTIAL_CODE}`,
			}),
		).toBe(200);

		await teacherSignIn(page);
		await clickInvoiceRow(page, "500.000đ");
		await expect(page).toHaveURL(new RegExp(`/tuition/${partialId}$`));

		await expect(
			page.getByRole("heading", {
				name: `INV-${partialId.slice(-8).toUpperCase()}`,
			}),
		).toBeVisible();
		await expect(page.getByText(partialId).first()).toBeVisible();
		await expect(page.getByText("Học phí tháng 10 — EARLY BIRD")).toBeVisible();
		await expect(page.getByText("Thu một phần")).toBeVisible();
		await expect(page.getByText("còn 300.000đ")).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Học Viên Detail/ }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "E2E Lớp Detail" }),
		).toBeVisible();
		await expect(page.locator("img[src*='vietqr.app']")).toBeVisible();
		await expect(page.getByText(PARTIAL_CODE).first()).toBeVisible();
		// Lịch sử giao dịch: một dòng 200.000đ với nội dung + mã tham chiếu.
		const history = page.locator("tr", { hasText: "200.000đ" });
		await expect(history).toBeVisible();
		await expect(history.getByText("FT-E2E")).toBeVisible();
	});

	test("Đã nhận from the detail page flips the badge", async ({ page }) => {
		await teacherSignIn(page);
		await clickInvoiceRow(page, "500.000đ");
		await expect(page).toHaveURL(new RegExp(`/tuition/${partialId}$`));
		// URL đổi trước khi chunk route detail render: list còn trên màn hình có
		// một nút "Đã nhận" mỗi hóa đơn, click lúc đó vi phạm strict mode.
		await expect(
			page.getByRole("heading", {
				name: `INV-${partialId.slice(-8).toUpperCase()}`,
			}),
		).toBeVisible();
		await page.getByRole("button", { name: "Đã nhận" }).click();
		await expect(page.getByText("Đã thu").first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test("IPN landing while the page is open updates amounts + history live", async ({
		page,
		request,
	}) => {
		await teacherSignIn(page);
		await clickInvoiceRow(page, "600.000đ");
		await expect(page).toHaveURL(new RegExp(`/tuition/${liveId}$`));
		await expect(
			page.getByText("còn 600.000đ").or(page.getByText("Còn lại")).first(),
		).toBeVisible();

		expect(
			await simulateIpn(request, {
				transactionId: "e2e-detail-600",
				amount: 600000,
				content: `Hoc phi ${LIVE_CODE}`,
			}),
		).toBe(200);

		// Không reload — poll payment phát hiện paidAmount đổi → invalidate
		// kernel + transactions (đúng điểm red-team: snapshot không tự poll).
		await expect(page.getByText("Đã thu").first()).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.locator("tr", { hasText: "600.000đ" })).toBeVisible({
			timeout: 20_000,
		});
	});

	test("action button inside the row never navigates (click + Enter)", async ({
		page,
	}) => {
		await teacherSignIn(page);
		await page.goto(`${TEACHER_BASE_URL}/tuition`);
		await expect(page.getByRole("heading", { name: "Hóa đơn" })).toBeVisible();

		// Click "Thu học phí" trong dòng legacy 400k → modal mở, URL giữ nguyên.
		const row = page.locator("tbody tr", { hasText: "400.000đ" }).first();
		await row.locator("button", { hasText: "Thu học phí" }).click();
		await expect(page.locator("img[src*='vietqr.app']")).toBeVisible();
		expect(page.url()).toBe(`${TEACHER_BASE_URL}/tuition`);
		await page.keyboard.press("Escape");

		// Keyboard: Tab đến nút trong dòng rồi Enter → modal mở, không điều hướng.
		const button = row.locator("button", { hasText: "Thu học phí" });
		await button.focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("img[src*='vietqr.app']")).toBeVisible();
		expect(page.url()).toBe(`${TEACHER_BASE_URL}/tuition`);
		await page.keyboard.press("Escape");

		// Enter trên dòng (tr focus) → điều hướng detail.
		await row.focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(new RegExp(`/tuition/${legacyId}$`));
	});

	test("?ky= filter survives the round trip via ← Doanh thu", async ({
		page,
	}) => {
		await teacherSignIn(page);
		await page.goto(`${TEACHER_BASE_URL}/tuition?ky=quarter`);
		const row = page.locator("tbody tr", { hasText: "400.000đ" }).first();
		await row.click();
		await expect(page).toHaveURL(new RegExp(`/tuition/${legacyId}`));
		await page.getByRole("link", { name: "← Doanh thu" }).click();
		await expect(page).toHaveURL(/\/tuition\?ky=quarter$/);
	});

	test("student profile tuition tab opens the detail", async ({ page }) => {
		await teacherSignIn(page);
		await page.goto(`${TEACHER_BASE_URL}/students/${studentId}`);
		await page.getByRole("tab", { name: "Học phí" }).click();
		const row = page.locator("tbody tr", { hasText: "400.000đ" }).first();
		await row.click();
		await expect(page).toHaveURL(new RegExp(`/tuition/${legacyId}$`));
		await expect(page.getByText("Lớp: —")).toBeVisible();
	});

	test("deep link returns HTTP 200; unknown id shows notFound", async ({
		page,
	}) => {
		await teacherSignIn(page);
		const res = await page.goto(`${TEACHER_BASE_URL}/tuition/${legacyId}`);
		expect(res?.status()).toBe(200);
		await expect(page.getByText("400.000đ").first()).toBeVisible();

		const missing = await page.goto(
			`${TEACHER_BASE_URL}/tuition/khong-ton-tai`,
		);
		expect(missing?.status()).toBe(200);
		await expect(page.getByText("Không tìm thấy hóa đơn")).toBeVisible();
	});

	test("screenshots at 3 viewports", async ({ page }) => {
		const screenshots = new URL(
			"../../../plans/261008-1209-invoice-detail-page/screenshots/",
			import.meta.url,
		).pathname;
		await teacherSignIn(page);
		await page.goto(`${TEACHER_BASE_URL}/tuition/${shotId}`);
		await expect(
			page
				.getByText("Học phí tháng 10 — EARLY BIRD")
				.or(page.getByText("Hóa đơn cho screenshot")),
		).toBeVisible();
		for (const [w, h, name] of [
			[1440, 900, "invoice-detail-1440"],
			[768, 1024, "invoice-detail-768"],
			[375, 812, "invoice-detail-375"],
		] as const) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForTimeout(300);
			await page.screenshot({
				path: `${screenshots}${name}.png`,
				fullPage: true,
			});
		}
	});
});
