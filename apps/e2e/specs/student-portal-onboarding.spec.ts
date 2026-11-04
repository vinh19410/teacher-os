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
	try {
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
							const ctx = canvas.getContext("2d", {
								willReadFrequently: true,
							});
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

							const blend = (
								fg: [number, number, number],
								bg: [number, number, number],
								alpha: number,
							): [number, number, number] => [
								fg[0] * alpha + bg[0] * (1 - alpha),
								fg[1] * alpha + bg[1] * (1 - alpha),
								fg[2] * alpha + bg[2] * (1 - alpha),
							];

							const chain: HTMLElement[] = [];
							let anc: HTMLElement | null = el.parentElement;
							while (anc) {
								chain.push(anc);
								anc = anc.parentElement;
							}
							let backdrop: [number, number, number] = [255, 255, 255];
							for (let i = chain.length - 1; i >= 0; i--) {
								const node = chain[i];
								if (!node) continue;
								const ancRgba = parseRgba(
									getComputedStyle(node).backgroundColor,
								);
								if (ancRgba[3] > 0) {
									backdrop = blend(
										[ancRgba[0], ancRgba[1], ancRgba[2]],
										backdrop,
										ancRgba[3],
									);
								}
							}

							const style = getComputedStyle(el);
							const fgRaw = parseRgba(style.color);
							const bgRaw = parseRgba(style.backgroundColor);
							const opacity = Number.parseFloat(style.opacity || "1");
							if (bgRaw[3] === 0) return 0;

							let bgRgb = blend(
								[bgRaw[0], bgRaw[1], bgRaw[2]],
								backdrop,
								bgRaw[3],
							);
							let fgRgb = blend(
								[fgRaw[0], fgRaw[1], fgRaw[2]],
								bgRgb,
								fgRaw[3],
							);
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
	} finally {
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await page.setViewportSize({ width: 1280, height: 720 });
	}
}

async function assertSelectionDistinctionAcrossThemesAndViewports(
	page: Page,
	selectedBtn: Locator,
	unselectedBtn: Locator,
	mode: "card-border" | "solid-chip",
): Promise<void> {
	try {
		for (const viewport of REVIEW_VIEWPORTS) {
			await page.setViewportSize(viewport);
			for (const theme of ["light", "dark"] as const) {
				await page.evaluate(
					(isDark) => document.documentElement.classList.toggle("dark", isDark),
					theme === "dark",
				);
				await expect(selectedBtn).toBeVisible();
				await expect(unselectedBtn).toBeVisible();
				await expect
					.poll(() =>
						selectedBtn.evaluate(
							(selEl, { unselSelector, checkMode }) => {
								const unselEl =
									document.querySelector<HTMLElement>(unselSelector);
								if (!unselEl) return false;

								const canvas = document.createElement("canvas");
								canvas.width = 1;
								canvas.height = 1;
								const ctx = canvas.getContext("2d", {
									willReadFrequently: true,
								});
								if (!ctx) return false;

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

								const blend = (
									fg: [number, number, number],
									bg: [number, number, number],
									alpha: number,
								): [number, number, number] => [
									fg[0] * alpha + bg[0] * (1 - alpha),
									fg[1] * alpha + bg[1] * (1 - alpha),
									fg[2] * alpha + bg[2] * (1 - alpha),
								];

								const resolveBackdrop = (
									node: Element,
								): [number, number, number] => {
									const chain: HTMLElement[] = [];
									let cur: HTMLElement | null = node.parentElement;
									while (cur) {
										chain.push(cur);
										cur = cur.parentElement;
									}
									let rgb: [number, number, number] = [255, 255, 255];
									for (let i = chain.length - 1; i >= 0; i--) {
										const item = chain[i];
										if (!item) continue;
										const [r, g, b, a] = parseRgba(
											getComputedStyle(item).backgroundColor,
										);
										if (a > 0) rgb = blend([r, g, b], rgb, a);
									}
									return rgb;
								};

								const lum = (rgb: [number, number, number]): number => {
									const rS = rgb[0] / 255;
									const gS = rgb[1] / 255;
									const bS = rgb[2] / 255;
									const rL =
										rS <= 0.04045 ? rS / 12.92 : ((rS + 0.055) / 1.055) ** 2.4;
									const gL =
										gS <= 0.04045 ? gS / 12.92 : ((gS + 0.055) / 1.055) ** 2.4;
									const bL =
										bS <= 0.04045 ? bS / 12.92 : ((bS + 0.055) / 1.055) ** 2.4;
									return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
								};

								const ratio = (
									a: [number, number, number],
									b: [number, number, number],
								): number => {
									const la = lum(a);
									const lb = lum(b);
									return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
								};

								const selBackdrop = resolveBackdrop(selEl);
								const selStyle = getComputedStyle(selEl);
								const selBgRaw = parseRgba(selStyle.backgroundColor);
								const selBg = blend(
									[selBgRaw[0], selBgRaw[1], selBgRaw[2]],
									selBackdrop,
									selBgRaw[3],
								);
								const selFgRaw = parseRgba(selStyle.color);
								const selFg = blend(
									[selFgRaw[0], selFgRaw[1], selFgRaw[2]],
									selBg,
									selFgRaw[3],
								);
								const textRatio = ratio(selFg, selBg);

								if (checkMode === "card-border") {
									const borderRaw = parseRgba(selStyle.borderTopColor);
									if (borderRaw[3] === 0) {
										return false;
									}
									const borderRgb = blend(
										[borderRaw[0], borderRaw[1], borderRaw[2]],
										selBackdrop,
										borderRaw[3],
									);
									return textRatio >= 4.5 && ratio(borderRgb, selBackdrop) >= 3;
								}

								const unselBackdrop = resolveBackdrop(unselEl);
								const unselBgRaw = parseRgba(
									getComputedStyle(unselEl).backgroundColor,
								);
								const unselBg = blend(
									[unselBgRaw[0], unselBgRaw[1], unselBgRaw[2]],
									unselBackdrop,
									unselBgRaw[3],
								);
								return textRatio >= 4.5 && ratio(selBg, unselBg) >= 3;
							},
							{
								unselSelector: 'button[aria-pressed="false"]',
								checkMode: mode,
							},
						),
					)
					.toBe(true);
			}
		}
	} finally {
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await page.setViewportSize({ width: 1280, height: 720 });
	}
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

		const ieltsBtn = page.getByRole("button", { name: /IELTS/ });
		const toeicBtn = page.getByRole("button", { name: /TOEIC/ });
		await ieltsBtn.click();
		await expect(ieltsBtn).toHaveAttribute("aria-pressed", "true");
		await expect(toeicBtn).toHaveAttribute("aria-pressed", "false");
		await assertSelectionDistinctionAcrossThemesAndViewports(
			page,
			ieltsBtn,
			toeicBtn,
			"card-border",
		);
		await expect(continueBtn).toBeEnabled();
		await assertButtonContrastAcrossThemesAndViewports(page, continueBtn);
		await continueBtn.click();

		// Bước 2: Trình độ hiện tại (4.5 – 5.5)
		const levelBtn = page.getByRole("button", { name: /4.5 – 5.5/ });
		const beginnerBtn = page.getByRole("button", { name: /Mới bắt đầu/ });
		await levelBtn.click();
		await expect(levelBtn).toHaveAttribute("aria-pressed", "true");
		await expect(beginnerBtn).toHaveAttribute("aria-pressed", "false");
		await assertSelectionDistinctionAcrossThemesAndViewports(
			page,
			levelBtn,
			beginnerBtn,
			"card-border",
		);
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 3: Band 6.5
		const band65Btn = page.getByRole("button", { name: "Band 6.5" });
		const band60Btn = page.getByRole("button", { name: "Band 6.0" });
		await band65Btn.click();
		await expect(band65Btn).toHaveAttribute("aria-pressed", "true");
		await expect(band60Btn).toHaveAttribute("aria-pressed", "false");
		await assertSelectionDistinctionAcrossThemesAndViewports(
			page,
			band65Btn,
			band60Btn,
			"solid-chip",
		);
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 3: Du học + Giao tiếp tự tin
		await page.getByRole("button", { name: "Du học" }).click();
		await page.getByRole("button", { name: "Giao tiếp tự tin" }).click();
		await expect(page.getByRole("button", { name: "Du học" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.getByRole("button", { name: "Thăng tiến công việc" }),
		).toHaveAttribute("aria-pressed", "false");
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Bước 4: 1–2 giờ
		await page.getByRole("button", { name: "1–2 giờ" }).click();
		await expect(page.getByRole("button", { name: "1–2 giờ" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.getByRole("button", { name: "Dưới 1 giờ" }),
		).toHaveAttribute("aria-pressed", "false");
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
				sql: `SELECT exam_interest, current_level, target_score, learning_goals, learning_goals_note,
				             daily_study_hours, onboarding_completed_at
				      FROM student WHERE lower(trim(email)) = lower(?)`,
				args: [email],
			});
			const row = res.rows[0];
			expect(row).toBeDefined();
			expect(row?.exam_interest).toBe("ielts");
			expect(row?.current_level).toBe("intermediate");
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
