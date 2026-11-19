import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const CAPTURE_POT = process.env.E2E_CAPTURE_POT === "1";
const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "mobile", width: 375, height: 812 },
] as const;
const REPORT_DIR = resolve(process.cwd(), "../../plans/reports");

async function signUpStudentOnPortal(
	page: Page,
	opts: { name: string; email: string; password?: string },
): Promise<void> {
	const password = opts.password ?? "password-8chars";
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(opts.name);
	await page.locator("#signup-email").fill(opts.email);
	await page.locator("#signup-password").fill(password);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, opts.email);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
}

async function captureViewports(
	page: Page,
	name: string,
	settle: () => Promise<void>,
) {
	if (CAPTURE_POT) mkdirSync(REPORT_DIR, { recursive: true });
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await assertNoHorizontalOverflow(page);
		await settle();
		if (CAPTURE_POT) {
			await page.screenshot({
				path: resolve(REPORT_DIR, `831-zoom-${name}-${vp.name}.png`),
			});
		}
	}
}

async function assertNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
}

test.describe("Zoom meeting & recording per session", () => {
	test.setTimeout(120_000);

	test("tạo Zoom theo buổi, đồng bộ recording và hiển thị trên app giáo viên + cổng học viên", async ({
		page,
		browser,
	}) => {
		const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const todayISO = vietnamTodayISO();
		const tomorrowISO = addDaysISO(todayISO, 1);
		const yesterdayISO = addDaysISO(todayISO, -1);

		const teacherEmail = await signUpViaApi(page, {
			name: "Cô Lan Zoom",
			email: `gv.zoom.${token}@test.local`,
		});

		const studentEmail = `hv.zoom.${token}@test.local`;
		const stu = await seedStudent({
			teacherEmail,
			name: "Học Viên Minh Anh",
			email: studentEmail,
			onboarded: true,
		});

		const clsRes = await page.request.post(`${API_ORIGIN}/api/classes`, {
			headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
			data: {
				name: `IELTS Speaking Zoom (${token})`,
				skills: ["Speaking"],
				mode: "Online",
				schedulingMode: "manual",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				startDate: yesterdayISO,
			},
		});
		expect(clsRes.status()).toBe(201);
		const { id: classId } = (await clsRes.json()) as { id: string };

		const enrRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${classId}/enroll`,
			{
				headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
				data: { studentId: stu.id, activateNow: true },
			},
		);
		expect(enrRes.status()).toBe(201);

		const sessionRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${classId}/sessions`,
			{
				headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
				data: {
					date: tomorrowISO,
					time: "19:00",
					dur: 90,
					topic: "Part 2 Storytelling",
					zoom: "",
				},
			},
		);
		expect(sessionRes.status()).toBe(201);

		// 1. Giáo viên mở lớp -> Điều chỉnh buổi -> thấy link Zoom
		await page.goto(`/classes/${classId}`);
		await page.getByRole("button", { name: "Điều chỉnh" }).first().click();
		const dialog = page.getByRole("dialog");
		// Tạo buổi manual đã tự dựng Zoom meeting; panel chỉ hiện nút tạo tay
		// khi buổi chưa có link.
		await expect(dialog.getByText("Phòng học Zoom")).toBeVisible();
		await expect(dialog.getByText(/^https:\/\/zoom\.us\/j\//)).toBeVisible();

		// 2. Fake Zoom có recording -> cron gán link + mật khẩu
		const recToggle = await page.request.post(
			`${API_ORIGIN}/__e2e/zoom-recording`,
			{ data: { ready: true } },
		);
		expect(recToggle.status()).toBe(200);

		const afterSessionISO = addDaysISO(todayISO, 2);
		const cronRes = await page.request.post(
			`${API_ORIGIN}/__e2e/run-recording-cron`,
			{ data: { nowIso: `${afterSessionISO}T05:00:00Z` } },
		);
		expect(cronRes.status()).toBe(200);
		const cronJson = (await cronRes.json()) as { updated: number };
		expect(cronJson.updated).toBeGreaterThanOrEqual(1);

		await page.reload();
		await page.getByRole("button", { name: "Điều chỉnh" }).first().click();
		const panel = page.getByRole("dialog");
		await expect(panel.getByText("Xem recording")).toBeVisible();
		await expect(panel.getByText("rec123")).toBeVisible();
		await expect(panel.getByText(/Mật khẩu recording:/)).toBeVisible();

		await captureViewports(page, "teacher-panel", async () => {
			await panel.getByText("Phòng học Zoom").scrollIntoViewIfNeeded();
		});

		// 3. Học viên thấy Vào lớp (Zoom), Xem recording và mật khẩu
		const studentCtx = await browser.newContext();
		const studentPage = await studentCtx.newPage();
		try {
			await signUpStudentOnPortal(studentPage, {
				name: "Học Viên Minh Anh",
				email: studentEmail,
			});

			await studentPage.goto(`${STUDENT_ORIGIN}/classes/${classId}`);
			const join = studentPage.getByRole("link", { name: /Vào lớp \(Zoom\)/i });
			await expect(join.first()).toBeVisible();
			expect(await join.first().getAttribute("href")).toMatch(
				/^https:\/\/zoom\.us\/j\//,
			);
			const rec = studentPage.getByRole("link", { name: /Xem recording/i });
			await expect(rec.first()).toBeVisible();
			expect(await rec.first().getAttribute("href")).toMatch(
				/^https:\/\/zoom\.us\/rec\/share\//,
			);
			await expect(studentPage.getByText("Mật khẩu:").first()).toBeVisible();
			await expect(studentPage.getByText("rec123").first()).toBeVisible();

			// Bàn phím: Tab phải chạm được cả hai link và nút sao chép mật khẩu.
			await studentPage.locator("body").click({ position: { x: 1, y: 1 } });
			const reached = new Set<string>();
			for (let i = 0; i < 80 && reached.size < 3; i++) {
				await studentPage.keyboard.press("Tab");
				const label = await studentPage.evaluate(() => {
					const el = document.activeElement;
					return (
						el?.getAttribute("aria-label") || el?.textContent?.trim() || ""
					);
				});
				for (const want of [
					"Vào lớp (Zoom)",
					"Xem recording",
					"Sao chép mật khẩu recording",
				]) {
					if (label.includes(want)) reached.add(want);
				}
			}
			expect([...reached].sort()).toHaveLength(3);

			await captureViewports(studentPage, "student-class", async () => {
				await studentPage.waitForTimeout(600);
				await rec.first().scrollIntoViewIfNeeded();
			});

			if (CAPTURE_POT) {
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.evaluate(() => {
					document.documentElement.classList.add("dark");
				});
				await studentPage.waitForTimeout(600);
				await rec.first().scrollIntoViewIfNeeded();
				await studentPage.screenshot({
					path: resolve(REPORT_DIR, "831-zoom-student-class-dark.png"),
				});
			}
		} finally {
			await studentCtx.close();
		}
	});
});
