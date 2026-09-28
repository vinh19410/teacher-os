import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { readVerificationEmails } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

test.describe("Student Portal Onboarding Wizard", () => {
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

	test("happy-path: signup -> verify email -> redirect to /onboarding -> complete wizard -> overview + db assert + reverse gate", async ({
		page,
	}) => {
		const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		const studentName = "Học Viên Onboarding";

		// 1. Đăng ký tài khoản
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill(studentName);
		await page.locator("#signup-email").fill(email);
		await page.locator("#signup-password").fill("password-8chars");
		await page.locator("#panel-signup button[type='submit']").click();

		// 2. Chờ màn xác thực
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});

		// 3. Lấy link verify email từ mailer
		let verifyUrl: string | undefined;
		for (let i = 0; i < 20; i++) {
			const emails = await readVerificationEmails();
			const entry = emails.find(
				(e) => e.to.trim().toLowerCase() === email.trim().toLowerCase(),
			);
			if (entry?.url) {
				verifyUrl = entry.url;
				break;
			}
			await page.waitForTimeout(500);
		}

		expect(verifyUrl).toBeDefined();
		if (!verifyUrl) throw new Error("No verifyUrl found");

		// 4. Click link verify -> tự đăng nhập -> rơi vào /onboarding
		await page.goto(verifyUrl);
		await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
		await expect(
			page.getByText("Bạn đang quan tâm chứng chỉ nào?"),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: /Chào/ })).not.toBeVisible();

		// 5. Chạy wizard
		// Bước 1: IELTS
		await page.getByRole("button", { name: /IELTS/ }).click();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 2: Band 6.5
		await page.getByRole("button", { name: "Band 6.5" }).click();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 3: Du học + Giao tiếp tự tin
		await page.getByRole("button", { name: "Du học" }).click();
		await page.getByRole("button", { name: "Giao tiếp tự tin" }).click();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 4: 1–2 giờ
		await page.getByRole("button", { name: "1–2 giờ" }).click();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Màn xác nhận
		await expect(page.getByText("Xác nhận thông tin của bạn")).toBeVisible();
		await expect(page.getByText("IELTS")).toBeVisible();
		await expect(page.getByText(/Du học/)).toBeVisible();

		// Hoàn thành
		await page.getByRole("button", { name: "Hoàn thành" }).click();

		// 6. Chuyển về overview
		await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
		await expect(page.getByRole("heading", { name: /Chào/ })).toBeVisible();

		// Anti-bounce check
		await page.waitForTimeout(1500);
		await expect(page).toHaveURL(/\/$/);
		await expect(
			page.getByText("Bạn đang quan tâm chứng chỉ nào?"),
		).not.toBeVisible();

		// 7. Assert DB
		const client = createClient({
			url: `file:${new URL("../local.db", import.meta.url).pathname}`,
		});
		await client.execute("PRAGMA busy_timeout = 5000;");
		try {
			const res = await client.execute({
				sql: `SELECT exam_interest, target_score, learning_goals, learning_goals_note,
				             daily_study_hours, onboarding_completed_at
				      FROM student WHERE lower(trim(email)) = lower(?)`,
				args: [email],
			});
			const row = res.rows[0];
			expect(row).toBeDefined();
			expect(row?.exam_interest).toBe("ielts");
			expect(row?.target_score).toBe("6.5");
			const parsedGoals = JSON.parse(
				String(row?.learning_goals ?? "[]"),
			) as string[];
			expect(parsedGoals).toEqual(["study-abroad", "communication"]);
			expect(row?.learning_goals_note).toBeNull();
			expect(row?.daily_study_hours).toBe("1-2");
			expect(row?.onboarding_completed_at).not.toBeNull();
		} finally {
			client.close();
		}

		// 8. Gate ngược: User đã hoàn thành onboarding khi vào lại /onboarding bị đẩy về /
		await page.goto(`${STUDENT_ORIGIN}/onboarding`);
		await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
		await expect(page.getByRole("heading", { name: /Chào/ })).toBeVisible();
	});

	test("unverified user cannot access onboarding: seeing verify screen instead", async ({
		page,
	}) => {
		const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		const studentName = "Học Viên Unverified";

		// 1. Đăng ký tài khoản nhưng KHÔNG verify
		await page.goto(`${STUDENT_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill(studentName);
		await page.locator("#signup-email").fill(email);
		await page.locator("#signup-password").fill("password-8chars");
		await page.locator("#panel-signup button[type='submit']").click();

		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});

		// 2. Vào thẳng /onboarding
		await page.goto(`${STUDENT_ORIGIN}/onboarding`);

		// 3. Vẫn thấy màn chờ xác thực
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.getByRole("button", { name: "Gửi lại email" }),
		).toBeVisible();
		await expect(
			page.getByText("Bạn đang quan tâm chứng chỉ nào?"),
		).not.toBeVisible();
	});
});
