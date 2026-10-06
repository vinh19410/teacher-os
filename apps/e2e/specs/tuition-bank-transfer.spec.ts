import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	seedStudent,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * Tuition bank-transfer flow E2E (#320, plan phase 6). Fake Bank Hub injects
 * qua AppDeps.getBankHub (apps/e2e/src/fake-bank-hub.ts) — hosted link là
 * trang /__fake-bankhub do chính API server phục vụ, postMessage đúng contract
 * của SePay. IPN mô phỏng bằng POST thẳng webhook với Apikey của fake.
 *
 * Ghi chú: invoice được seed trực tiếp bằng SQL (POST /invoices đã được phủ
 * bởi unit test kernel) để spec tập trung vào luồng QR → IPN → đối soát.
 */

const PASSWORD = "password-8chars";
const MAIN_CODE = "TOS7K2M9QXA";
const SECOND_CODE = "TOS7K2M9QXB";
const MAIN_TOKEN = "e2epaytoken-main-0000000000a";
const SECOND_TOKEN = "e2epaytoken-second-000000000b";

let teacherEmail: string;
let studentEmail: string;
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
	payToken: string;
	amount: number;
}): Promise<string> {
	const client = openDb();
	try {
		const id = crypto.randomUUID();
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, status, due, note, date, type, method, payment_code, pay_token, paid_amount, created_at)
				VALUES (?, ?, ?, '', ?, 'unpaid', '', '', '', 'Học phí', '—', ?, ?, 0, ?)`,
			args: [
				id,
				opts.orgId,
				opts.studentId,
				opts.amount,
				opts.code,
				opts.payToken,
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
	const res = await request.post(`${API_ORIGIN}/webhooks/sepay/bankhub/ipn`, {
		headers: {
			Authorization: "Apikey e2e-ipn-key",
			"Content-Type": "application/json",
		},
		data: {
			gateway: "MBBank",
			transaction_date: "2026-10-05 10:00:00",
			account_number: "0123456789",
			bank_account_xid: "ba-e2e-1",
			content: input.content,
			transfer_type: "credit",
			amount: input.amount,
			reference_code: "FT-E2E",
			payment_code: null,
			transaction_id: input.transactionId,
		},
	});
	return res.status();
}

async function teacherSignIn(page: Page): Promise<void> {
	await page.goto(`${WEB_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#si-email").fill(teacherEmail);
	await page.locator("#si-password").fill(PASSWORD);
	await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.getByRole("button", { name: "Sign in" }).click(),
	]);
	await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function openPayModalForAmount(
	page: Page,
	amount: string,
): Promise<void> {
	// The tuition table shows the display invoice code (INV-…), not the
	// transfer memo — locate rows by the student's amount cell instead.
	await page.goto(`${WEB_ORIGIN}/tuition`);
	const row = page.locator("tr", { hasText: amount });
	await row.locator("button", { hasText: "Thu học phí" }).click();
	await expect(
		page.locator("iframe[title*='liên kết'], img[src*='vietqr.app']").first(),
	).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Tuition bank transfer (#320)", () => {
	test("teacher links a bank account through the fake hosted link", async ({
		page,
	}) => {
		teacherEmail = `lan.teacher.${Date.now()}@e2e.local`;
		await signUpViaUi(page, { email: teacherEmail, password: PASSWORD });
		await teacherSignIn(page);

		await page.goto(`${WEB_ORIGIN}/payments`);
		await expect(page.getByText("Nhận học phí qua chuyển khoản")).toBeVisible();
		await page
			.getByRole("button", { name: "Liên kết tài khoản ngân hàng" })
			.click();
		const frame = page.frameLocator("iframe[title*='SePay']");
		await frame.getByRole("button", { name: "Hoàn tất" }).click();
		// The modal closes itself once the server reports "linked" (postMessage
		// or the 5s poll — both paths converge here).
		await expect(page.getByText("Đã liên kết")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByText("•••6789")).toBeVisible();
	});

	test("invoice shows QR with the right amount and memo; public link works", async ({
		page,
		browser,
	}) => {
		await teacherSignIn(page);
		const orgId = await orgIdOfTeacher();
		const student = await seedStudent({
			teacherEmail,
			name: "Học Viên QR",
		});
		studentEmail = student.email;
		await seedInvoice({
			orgId,
			studentId: student.id,
			code: MAIN_CODE,
			payToken: MAIN_TOKEN,
			amount: 500000,
		});
		await seedInvoice({
			orgId,
			studentId: student.id,
			code: SECOND_CODE,
			payToken: SECOND_TOKEN,
			amount: 400000,
		});

		await openPayModalForAmount(page, "500.000đ");
		const qr = page.locator("img[src*='vietqr.app']");
		await expect(qr).toBeVisible();
		const src = await qr.getAttribute("src");
		expect(src).toContain("amount=500000");
		expect(src).toContain(`des=${MAIN_CODE}`);
		await expect(page.getByText(MAIN_CODE)).toBeVisible();
		await page.keyboard.press("Escape");

		// Public /pay/<token> in a signed-out context.
		const anon = await browser.newContext();
		const anonPage = await anon.newPage();
		await anonPage.goto(`${WEB_ORIGIN}/pay/${MAIN_TOKEN}`);
		await expect(anonPage.locator("img[src*='vietqr.app']")).toBeVisible({
			timeout: 15_000,
		});
		await expect(anonPage.getByText(MAIN_CODE)).toBeVisible();
		await anon.close();
	});

	test("student portal shows the tuition section and invoice QR", async ({
		page,
	}) => {
		// Mark onboarding done so the verified student lands straight on the
		// portal overview (same trick as helpers-quiz.ts seedStudent).
		{
			const client = openDb();
			try {
				await client.execute({
					sql: "UPDATE student SET onboarding_completed_at = ? WHERE lower(email) = lower(?)",
					args: [Date.now(), studentEmail],
				});
			} finally {
				client.close();
			}
		}

		// Sign the student up on the portal; provisioning links the student row
		// by email on first authenticated /api/student/me call.
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill("Học Viên QR");
		await page.locator("#signup-email").fill(studentEmail);
		await page.locator("#signup-password").fill(PASSWORD);
		await page.locator("#panel-signup button[type='submit']").click();
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 20_000,
		});

		// Verify through the real mail log (helper polls + opens the CTA).
		await verifyStudentEmailFromMailLog(page, studentEmail);

		// verifyStudentEmailFromMailLog ends signed-in on the portal (the
		// seeded student row links by email at first /api/student/me call).
		await page.goto(`${STUDENT_ORIGIN}/`);
		await expect(
			page.getByRole("heading", { name: "Lớp học của tôi" }),
		).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole("heading", { name: "Học phí" })).toBeVisible({
			timeout: 20_000,
		});
		// The unsettled invoice row links to the QR detail page.
		await page
			.getByRole("link", { name: /Học phí/ })
			.first()
			.click();
		await expect(page.locator("img[src*='vietqr.app']")).toBeVisible({
			timeout: 20_000,
		});
	});

	test("IPN 200k lands as 'Thu một phần' everywhere", async ({
		page,
		request,
	}) => {
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-t1",
				amount: 200000,
				content: `Hoc phi ${MAIN_CODE}`,
			}),
		).toBe(200);

		await teacherSignIn(page);
		await openPayModalForAmount(page, "500.000đ");
		await expect(page.getByText("Đã nhận 200.000đ / 500.000đ")).toBeVisible({
			timeout: 20_000,
		});
		await page.keyboard.press("Escape");
		// The table shows INV-… codes, not transfer memos — locate by amount.
		await expect(
			page.locator("tr", { hasText: "500.000đ" }).getByText("Thu một phần"),
		).toBeVisible();
	});

	test("IPN 300k with lowercase memo completes the invoice on /pay", async ({
		page,
		request,
	}) => {
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-t2",
				amount: 300000,
				content: `sevqr ${MAIN_CODE.toLowerCase()} hoc phi`,
			}),
		).toBe(200);

		await page.goto(`${WEB_ORIGIN}/pay/${MAIN_TOKEN}`);
		await expect(page.getByText("Đã thanh toán đủ")).toBeVisible({
			timeout: 20_000,
		});
	});

	test("replaying the same transaction id never double-counts", async ({
		request,
	}) => {
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-t1",
				amount: 200000,
				content: `Hoc phi ${MAIN_CODE}`,
			}),
		).toBe(200);
		const client = openDb();
		try {
			const res = await client.execute({
				sql: "SELECT paid_amount AS p FROM invoice WHERE payment_code = ?",
				args: [MAIN_CODE],
			});
			expect(Number(res.rows[0]?.p)).toBe(500000);
		} finally {
			client.close();
		}
	});

	test("unmatched foreign-code transaction lands in the queue and assigns", async ({
		page,
		request,
	}) => {
		// A transfer carrying org B's code… we only have one org, so use a
		// code of the SECOND invoice paid into the account while the memo got
		// garbled: wrong-code scenario → unknown_code on the queue. The
		// foreign_code branch (cross-org) is covered by server tests.
		expect(
			await simulateIpn(request, {
				transactionId: "e2e-t3",
				amount: 150000,
				content: "TOSZZZZ9999 chuyen khoan lac",
			}),
		).toBe(200);

		await teacherSignIn(page);
		await page.goto(`${WEB_ORIGIN}/tuition`);
		await expect(page.getByText("Giao dịch chưa khớp (1)")).toBeVisible();
		const row = page.locator("tr", { hasText: "TOSZZZZ9999" });
		// Picker labels carry the INV- display code + remaining amount — the
		// second invoice (400k, unsettled) is the only option.
		const secondId = await row
			.locator("select option", { hasText: "400.000đ" })
			.first()
			.getAttribute("value");
		await row.locator("select").selectOption(secondId ?? "");
		await row.locator("button", { hasText: "Gán" }).click();
		await expect(page.getByText("Giao dịch chưa khớp (1)")).toBeHidden({
			timeout: 15_000,
		});

		await page.goto(`${WEB_ORIGIN}/pay/${SECOND_TOKEN}`);
		await expect(page.getByText("Đã nhận 150.000đ / 400.000đ")).toBeVisible({
			timeout: 20_000,
		});
	});
});
