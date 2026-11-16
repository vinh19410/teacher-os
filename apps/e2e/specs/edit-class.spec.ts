import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { signUpViaApi, vietnamTodayISO, vnWeekdayMon0 } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

function addDaysIso(iso: string, days: number): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

test.describe("edit class information (issue #693)", () => {
	test("1. opens via keyboard Enter, closes on Escape, and warns only on conflicts with other classes", async ({
		page,
	}) => {
		const stamp = Date.now();
		const startMonday = addDaysIso(vietnamTodayISO(), 7);
		const monIdx = vnWeekdayMon0(startMonday);
		const friIdx = (monIdx + 4) % 7;
		const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
		const otherDayLabel = dayLabels[friIdx] ?? "T6";

		await signUpViaApi(page);

		const classAName = `E2E Edit Focus A ${stamp}`;
		const classBName = `E2E Edit Overlap B ${stamp}`;
		const classAId = await seedDatedClass(page, {
			name: classAName,
			schedulingMode: "auto",
			schedule: { days: [monIdx], start: "19:00", end: "20:30" },
			startDate: startMonday,
			sessionsTotal: 8,
		});
		await seedDatedClass(page, {
			name: classBName,
			schedulingMode: "auto",
			schedule: { days: [friIdx], start: "19:00", end: "20:30" },
			startDate: startMonday,
			sessionsTotal: 8,
		});

		await page.goto(`/classes/${classAId}`);
		await expect(page.getByRole("heading", { name: classAName })).toBeVisible();

		const editBtn = page.getByRole("button", {
			name: "Chỉnh sửa",
			exact: true,
		});
		await editBtn.focus();
		await expect(editBtn).toBeFocused();
		await page.keyboard.press("Enter");

		const dialog = page.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId("schedule-conflict-warning")).toHaveCount(
			0,
		);

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();

		await editBtn.click();
		await expect(dialog).toBeVisible();
		await dialog
			.getByRole("button", { name: otherDayLabel, exact: true })
			.click();

		const warning = dialog.getByTestId("schedule-conflict-warning");
		await expect(warning).toBeVisible();
		await expect(warning).toContainText(classBName);
		await expect(warning).not.toContainText(classAName);
	});

	test("2. edits unlocked class general info, communication switch, schedule, and tuition fee", async ({
		page,
	}) => {
		const stamp = Date.now();
		const nextWeek = addDaysIso(vietnamTodayISO(), 7);
		const dayIdx = vnWeekdayMon0(nextWeek);

		await signUpViaApi(page);

		const initialName = `E2E Edit Unlocked ${stamp}`;
		const updatedName = `E2E Edit Updated ${stamp}`;
		const classId = await seedDatedClass(page, {
			name: initialName,
			schedulingMode: "auto",
			schedule: { days: [dayIdx], start: "19:00", end: "20:30" },
			startDate: nextWeek,
			sessionsTotal: 12,
		});

		await page.goto(`/classes/${classId}`);
		await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		await expect(dialog).toBeVisible();

		// Toggling to Giao tiếp clears & disables skills; switching back to IELTS re-enables them
		await dialog
			.getByRole("button", { name: "Giao tiếp", exact: true })
			.click();
		await expect(
			dialog.getByRole("button", { name: "Writing", exact: true }),
		).toBeDisabled();
		await dialog.getByRole("button", { name: "IELTS", exact: true }).click();
		await expect(
			dialog.getByRole("button", { name: "Writing", exact: true }),
		).toBeEnabled();

		await dialog.getByLabel("Tên lớp *").fill(updatedName);
		await dialog.getByLabel("Trình độ").selectOption("Band 7.0");
		await dialog.getByLabel("Hình thức").selectOption("Offline");
		await dialog.getByRole("button", { name: "Writing", exact: true }).click();
		await dialog.getByRole("button", { name: "Speaking", exact: true }).click();
		await dialog.getByLabel("Học phí / học viên (VND)").fill("4500000");

		await dialog.getByLabel("Giờ bắt đầu").fill("18:30");
		await dialog.getByLabel("Giờ kết thúc").fill("20:00");
		await dialog.getByLabel("Tổng số buổi").fill("16");

		await dialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(dialog).toBeHidden();

		await expect(
			page.getByRole("heading", { name: updatedName }),
		).toBeVisible();
		await expect(page.getByText(/18:30–20:00 · Offline/)).toBeVisible();
		await expect(page.getByText("0/16", { exact: true })).toBeVisible();

		// Tab Học viên vẫn hiển thị học phí mới và nút Sửa riêng
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await expect(
			page.getByText("Học phí: 4.500.000đ / học viên"),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Sửa", exact: true }),
		).toBeVisible();
	});

	test("3. locks schedule inputs when real sessions exist while saving general info", async ({
		page,
	}) => {
		const stamp = Date.now();
		const sessionDate = addDaysIso(vietnamTodayISO(), 7);

		await signUpViaApi(page);

		const initialName = `E2E Edit Locked ${stamp}`;
		const updatedName = `E2E Edit Locked Renamed ${stamp}`;
		const classId = await seedDatedClass(page, {
			name: initialName,
			schedulingMode: "manual",
			schedule: { days: [1, 3], start: "19:00", end: "20:30" },
			startDate: sessionDate,
		});

		const addRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${classId}/sessions`,
			{
				data: {
					date: sessionDate,
					time: "19:00",
					dur: 90,
					topic: "Buổi 1 thực tế",
					zoom: "",
				},
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(addRes.status()).toBe(201);

		await page.goto(`/classes/${classId}`);
		await expect(
			page.getByRole("heading", { name: initialName }),
		).toBeVisible();

		await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		await expect(dialog).toBeVisible();

		await expect(dialog.getByTestId("schedule-locked-note")).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "T3", exact: true }),
		).toBeDisabled();
		await expect(dialog.getByLabel("Giờ bắt đầu")).toBeDisabled();
		await expect(dialog.getByLabel("Giờ kết thúc")).toBeDisabled();
		await expect(dialog.getByLabel("Tổng số buổi")).toBeDisabled();
		await expect(dialog.getByLabel("Ngày khai giảng")).toBeDisabled();

		await dialog.getByLabel("Tên lớp *").fill(updatedName);
		await dialog.getByLabel("Học phí / học viên (VND)").fill("3800000");
		await dialog
			.getByRole("button", { name: "Lưu thay đổi", exact: true })
			.click();
		await expect(dialog).toBeHidden();

		await expect(
			page.getByRole("heading", { name: updatedName }),
		).toBeVisible();
		await expect(
			page.getByText(/T3 & T5 · 19:00–20:30 · Online/),
		).toBeVisible();

		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await expect(
			page.getByText("Học phí: 3.800.000đ / học viên"),
		).toBeVisible();
	});

	test("4. responsive layout & Light/Dark themes across 3 viewports and 320px reflow", async ({
		page,
	}) => {
		const nextWeek = addDaysIso(vietnamTodayISO(), 7);
		await signUpViaApi(page);

		const classId = await seedDatedClass(page, {
			name: "IELTS Writing 7.0 — Nhóm tối",
			schedulingMode: "auto",
			schedule: { days: [1, 3], start: "19:00", end: "20:30" },
			startDate: nextWeek,
			sessionsTotal: 12,
		});

		await page.goto(`/classes/${classId}`);
		await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		await expect(dialog).toBeVisible();

		const viewports = [
			{ key: "desktop", width: 1440, height: 900 },
			{ key: "tablet", width: 768, height: 1024 },
			{ key: "mobile", width: 375, height: 812 },
		] as const;

		if (process.env.CAPTURE_POT === "1") {
			mkdirSync(REPORT_DIR, { recursive: true });
		}

		for (const vp of viewports) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			for (const theme of ["light", "dark"] as const) {
				await page.evaluate(
					(isDark) => document.documentElement.classList.toggle("dark", isDark),
					theme === "dark",
				);
				await page.waitForTimeout(150);
				await expect(dialog).toBeVisible();
				await expect(
					dialog.getByRole("button", { name: "Lưu thay đổi", exact: true }),
				).toBeVisible();
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				);
				expect(overflow).toBe(false);

				if (process.env.CAPTURE_POT === "1") {
					await page.screenshot({
						path: resolve(REPORT_DIR, `693-edit-class-${vp.key}-${theme}.png`),
					});
				}
			}
		}

		await page.setViewportSize({ width: 320, height: 812 });
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate(
				(isDark) => document.documentElement.classList.toggle("dark", isDark),
				theme === "dark",
			);
			await page.waitForTimeout(150);
			const overflow320 = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			);
			expect(overflow320).toBe(false);
		}
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
	});
});
