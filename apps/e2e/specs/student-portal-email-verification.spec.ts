import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { readVerificationEmails } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

test.describe("Student Portal Email Verification", () => {
	test.beforeAll(async () => {
		const client = createClient({
			url: `file:${new URL("../local.db", import.meta.url).pathname}`,
		});
		await client.execute("PRAGMA busy_timeout = 5000;");
		try {
			const res = await client.execute(
				"SELECT id FROM organization ORDER BY created_at ASC, id ASC LIMIT 1",
			);
			if (!res.rows[0]) {
				await client.execute({
					sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
					args: ["org-e2e-seed", "E2E School", Date.now()],
				});
			}
		} finally {
			client.close();
		}
	});

	test("happy-path: đăng ký portal -> màn chờ xác thực -> verify link -> auto-login và provision hồ sơ", async ({
		page,
	}) => {
		const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		const studentName = "Học Viên Happy Path";
		// 1. Mở trang login student portal
		await page.goto(`${STUDENT_ORIGIN}/login`);

		// 2. Chuyển sang tab Đăng ký
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill(studentName);
		await page.locator("#signup-email").fill(email);
		await page.locator("#signup-password").fill("password-8chars");

		// 3. Submit tạo tài khoản
		await page.locator("#panel-signup button[type='submit']").click();

		// 4. Expect màn chờ xác thực hiển thị đúng copy và nút Gửi lại
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(email)).toBeVisible();
		const resendButton = page.getByRole("button", {
			name: "Gửi lại email",
		});
		await expect(resendButton).toBeVisible();

		// 5. Lấy URL verify từ mail log
		let verifyUrl: string | undefined;
		for (let i = 0; i < 20; i++) {
			const emails = await readVerificationEmails();
			const entry = emails.find(
				(e) => e.to.toLowerCase() === email.toLowerCase(),
			);
			if (entry?.url) {
				verifyUrl = entry.url;
				break;
			}
			await page.waitForTimeout(500);
		}

		expect(verifyUrl).toBeDefined();
		if (!verifyUrl) throw new Error("No verifyUrl found");

		// 6. Click URL verify
		await page.goto(verifyUrl);
		// 7. Better-Auth verify và auto sign-in chuyển về portal overview
		await expect(page.getByRole("heading", { name: /Chào/ })).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByText("Email chưa được xác thực")).not.toBeVisible();

		// 8. Assert DB có đúng 1 record student được provision
		const client = createClient({
			url: `file:${new URL("../local.db", import.meta.url).pathname}`,
		});
		await client.execute("PRAGMA busy_timeout = 5000;");
		try {
			const res = await client.execute({
				sql: "SELECT count(*) AS count FROM student WHERE lower(trim(email)) = lower(?)",
				args: [email],
			});
			const rowCount = Number(res.rows[0]?.count ?? 0);
			expect(rowCount).toBe(1);
		} finally {
			client.close();
		}
	});

	test("resend: bấm 'Gửi lại email' kích hoạt gửi mail mới và UI phản hồi", async ({
		page,
	}) => {
		const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		const studentName = "Học Viên Resend";

		// 1. Đăng ký qua student portal
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill(studentName);
		await page.locator("#signup-email").fill(email);
		await page.locator("#signup-password").fill("password-8chars");
		await page.locator("#panel-signup button[type='submit']").click();

		// 2. Chờ màn chờ xác thực
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});
		const resendButton = page.getByRole("button", {
			name: "Gửi lại email",
		});
		await expect(resendButton).toBeVisible();

		// Đếm số mail đã ghi cho email này
		const emailsInitial = await readVerificationEmails();
		const countBefore = emailsInitial.filter(
			(e) => e.to.toLowerCase() === email.toLowerCase(),
		).length;
		expect(countBefore).toBeGreaterThanOrEqual(1);

		// 3. Bấm Gửi lại email
		await resendButton.click();

		// 4. UI phản hồi thành công
		await expect(page.getByText("Đã gửi lại — kiểm tra hộp thư")).toBeVisible({
			timeout: 10_000,
		});

		// 5. Kiểm tra mail log có thêm entry mới cho email này
		let countAfter = countBefore;
		for (let i = 0; i < 20; i++) {
			const emails = await readVerificationEmails();
			countAfter = emails.filter(
				(e) => e.to.toLowerCase() === email.toLowerCase(),
			).length;
			if (countAfter > countBefore) break;
			await page.waitForTimeout(500);
		}

		expect(countAfter).toBeGreaterThan(countBefore);
	});
});
