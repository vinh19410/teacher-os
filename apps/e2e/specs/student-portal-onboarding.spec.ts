import { createClient } from "@libsql/client";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

const REVIEW_VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 375, height: 812 },
] as const;

async function assertButtonContrastAcrossThemesAndViewports(
	page: Page,
	button: Locator,
): Promise<void> {
	for (const viewport of REVIEW_VIEWPORTS) {
		await page.setViewportSize(viewport);
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate(
				(isDark) => document.documentElement.classList.toggle("dark", isDark),
				theme === "dark",
			);
			await expect(button).toBeVisible();
			await expect
				.poll(() =>
					button.evaluate((el) => {
						const canvas = document.createElement("canvas");
						canvas.width = 1;
						canvas.height = 1;
						const ctx = canvas.getContext("2d", { willReadFrequently: true });
						if (!ctx) return 0;

						const parseRgba = (
							cssColor: string,
						): [number, number, number, number] => {
							ctx.clearRect(0, 0, 1, 1);
							ctx.fillStyle = "#010203";
							ctx.fillStyle = cssColor;
							ctx.fillRect(0, 0, 1, 1);
							const data = ctx.getImageData(0, 0, 1, 1).data;
							return [
								data[0] ?? 0,
								data[1] ?? 0,
								data[2] ?? 0,
								(data[3] ?? 0) / 255,
							];
						};

						let backdrop: [number, number, number] = [255, 255, 255];
						let anc: HTMLElement | null = el.parentElement;
						while (anc) {
							const ancRgba = parseRgba(getComputedStyle(anc).backgroundColor);
							if (ancRgba[3] > 0) {
								backdrop = [ancRgba[0], ancRgba[1], ancRgba[2]];
								break;
							}
							anc = anc.parentElement;
						}

						const style = getComputedStyle(el);
						const fgRaw = parseRgba(style.color);
						const bgRaw = parseRgba(style.backgroundColor);
						const opacity = Number.parseFloat(style.opacity || "1");
						if (bgRaw[3] === 0) return 0;

						const blend = (
							fg: [number, number, number],
							bg: [number, number, number],
							alpha: number,
						): [number, number, number] => [
							fg[0] * alpha + bg[0] * (1 - alpha),
							fg[1] * alpha + bg[1] * (1 - alpha),
							fg[2] * alpha + bg[2] * (1 - alpha),
						];

						let bgRgb = blend(
							[bgRaw[0], bgRaw[1], bgRaw[2]],
							backdrop,
							bgRaw[3],
						);
						let fgRgb = blend([fgRaw[0], fgRaw[1], fgRaw[2]], bgRgb, fgRaw[3]);
						if (opacity < 1) {
							bgRgb = blend(bgRgb, backdrop, opacity);
							fgRgb = blend(fgRgb, backdrop, opacity);
						}

						const channelLum = (c: number): number => {
							const s = c / 255;
							return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
						};
						const lFg =
							0.2126 * channelLum(fgRgb[0]) +
							0.7152 * channelLum(fgRgb[1]) +
							0.0722 * channelLum(fgRgb[2]);
						const lBg =
							0.2126 * channelLum(bgRgb[0]) +
							0.7152 * channelLum(bgRgb[1]) +
							0.0722 * channelLum(bgRgb[2]);
						return (Math.max(lFg, lBg) + 0.05) / (Math.min(lFg, lBg) + 0.05);
					}),
				)
				.toBeGreaterThanOrEqual(4.5);
		}
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.setViewportSize({ width: 1280, height: 720 });
}
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

		// 3-4. Lấy link từ mail log, mở link, bấm CTA — landing trang xác nhận,
		// rồi gate tự đăng nhập đưa user mới sang /onboarding
		await verifyStudentEmailFromMailLog(page, email);
		await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
		await expect(
			page.getByText("Bạn đang quan tâm chứng chỉ nào?"),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: /Chào/ })).not.toBeVisible();

		// 5. Chạy wizard
		// Bước 1: kiểm tra contrast nút Tiếp tục khi disabled và sau khi chọn IELTS
		const continueBtn = page.getByRole("button", { name: "Tiếp tục" });
		await expect(continueBtn).toBeDisabled();
		await assertButtonContrastAcrossThemesAndViewports(page, continueBtn);

		await page.getByRole("button", { name: /IELTS/ }).click();
		await expect(continueBtn).toBeEnabled();
		await assertButtonContrastAcrossThemesAndViewports(page, continueBtn);
		await continueBtn.click();

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

		// Hoàn thành (kiểm tra contrast nút xác nhận bước cuối)
		const finishBtn = page.getByRole("button", { name: "Hoàn thành" });
		await expect(finishBtn).toBeEnabled();
		await assertButtonContrastAcrossThemesAndViewports(page, finishBtn);
		await finishBtn.click();

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
