import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { seedGoogleAccount } from "../src/account-seed";
import {
	addDaysISO,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const CAPTURE_POT = process.env.E2E_CAPTURE_POT === "1";
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

async function assertNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(overflow).toBe(false);
}

test.describe("Issue #816 — Google Meet & Recording per session E2E", () => {
	test.setTimeout(120_000);

	test("tạo link Google Meet theo buổi, đồng bộ recording và hiển thị trên app giáo viên + cổng học viên", async ({
		page,
		browser,
	}) => {
		const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const todayISO = vietnamTodayISO();
		const tomorrowISO = addDaysISO(todayISO, 1);
		const yesterdayISO = addDaysISO(todayISO, -1);

		const teacherEmail = await signUpViaApi(page, {
			name: "Cô Lan Meet",
			email: `gv.meet.${token}@test.local`,
		});

		// 1. Trang Hồ sơ: chưa liên kết -> sau khi seed Meet scopes -> "Sẵn sàng Meet"
		await page.goto("/profile");
		await expect(
			page.getByRole("button", { name: "Kết nối Google" }),
		).toBeVisible();
		await seedGoogleAccount(teacherEmail, { withMeetScopes: true });
		await page.reload();
		await expect(page.getByText("Sẵn sàng Meet")).toBeVisible();

		// 2. Tạo học viên + lớp Online manual + ghi danh active
		const studentEmail = `hv.meet.${token}@test.local`;
		const stu = await seedStudent({
			teacherEmail,
			name: "Học Viên Minh Anh",
			email: studentEmail,
			onboarded: true,
		});

		const clsRes = await page.request.post(`${API_ORIGIN}/api/classes`, {
			headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
			data: {
				name: `IELTS Speaking Meet (${token})`,
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

		// 3. Tạo 2 buổi manual (1 buổi hôm qua đã kết thúc, 1 buổi ngày mai) -> tự tạo Meet link
		const pastRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${classId}/sessions`,
			{
				headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
				data: {
					date: yesterdayISO,
					time: "10:00",
					dur: 90,
					topic: "Part 1 Fluency",
					zoom: "",
				},
			},
		);
		expect(pastRes.status()).toBe(201);

		const futureRes = await page.request.post(
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
		expect(futureRes.status()).toBe(201);

		// 4. Kiểm tra UI giáo viên: link Vào Meet trên danh sách buổi + đồng bộ recording
		await page.goto(`/classes/${classId}`);
		await expect(
			page.getByRole("link", { name: /Vào Meet/i }).first(),
		).toBeVisible();

		// Chuyển fake Google Meet sang trạng thái đã có file recording
		const recToggle = await page.request.post(
			`${API_ORIGIN}/__e2e/google-meet-recording`,
			{ data: { ready: true } },
		);
		expect(recToggle.status()).toBe(200);

		// Chạy cron sync recording (giả lập sau buổi học hôm qua kết thúc)
		const cronRes = await page.request.post(
			`${API_ORIGIN}/__e2e/run-recording-cron`,
			{
				data: { nowIso: `${todayISO}T05:00:00Z` },
			},
		);
		expect(cronRes.status()).toBe(200);
		const cronJson = (await cronRes.json()) as {
			checked: number;
			updated: number;
		};
		expect(cronJson.updated).toBeGreaterThanOrEqual(1);

		await page.reload();
		await expect(
			page.getByRole("link", { name: /Xem recording/i }),
		).toBeVisible();

		if (CAPTURE_POT) {
			mkdirSync(REPORT_DIR, { recursive: true });
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.screenshot({
				path: resolve(REPORT_DIR, "816-teacher-class-desktop.png"),
			});
		}

		// 5. Học viên đăng nhập cổng học viên -> thấy nút Vào lớp (Google Meet) & Xem recording
		const studentCtx = await browser.newContext();
		const studentPage = await studentCtx.newPage();
		try {
			await signUpStudentOnPortal(studentPage, {
				name: "Học Viên Minh Anh",
				email: studentEmail,
			});

			// Trang chủ học viên: nút Vào lớp (Google Meet) ở card lớp & panel Sắp tới
			const joinLinks = studentPage.getByRole("link", {
				name: /Vào lớp \(Google Meet\)/i,
			});
			await expect(joinLinks.first()).toBeVisible();
			const meetHref = await joinLinks.first().getAttribute("href");
			expect(meetHref).toMatch(/^https:\/\/meet\.google\.com\/e2e-meet-/);

			// Trang Lịch học học viên
			await studentPage.goto(`${STUDENT_ORIGIN}/schedule`);
			await expect(
				studentPage
					.getByRole("link", { name: /Vào lớp \(Google Meet\)/i })
					.first(),
			).toBeVisible();

			// Tab "Tất cả" trên /schedule hiển thị cả nút Xem recording cho buổi hôm qua
			await studentPage.getByRole("tab", { name: /Tất cả/i }).click();
			const recLink = studentPage.getByRole("link", {
				name: /Xem recording/i,
			});
			await expect(recLink).toBeVisible();
			expect(await recLink.getAttribute("href")).toMatch(
				/^https:\/\/drive\.google\.com\/file\/d\/drive-e2e-meet-/,
			);

			// Trang Chi tiết lớp học viên + kiểm tra 3 viewport (1440x900, 768x1024, 375x812)
			await studentPage.goto(`${STUDENT_ORIGIN}/classes/${classId}`);
			await expect(
				studentPage.getByRole("link", { name: /Vào lớp \(Google Meet\)/i }),
			).toBeVisible();
			await expect(
				studentPage.getByRole("link", { name: /Xem recording/i }),
			).toBeVisible();

			for (const vp of [
				{ name: "desktop", width: 1440, height: 900 },
				{ name: "tablet", width: 768, height: 1024 },
				{ name: "mobile", width: 375, height: 812 },
			]) {
				await studentPage.setViewportSize({
					width: vp.width,
					height: vp.height,
				});
				await assertNoHorizontalOverflow(studentPage);
				if (CAPTURE_POT) {
					await studentPage.screenshot({
						path: resolve(REPORT_DIR, `816-student-class-${vp.name}.png`),
					});
				}
			}

			if (CAPTURE_POT) {
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.evaluate(() => {
					document.documentElement.classList.add("dark");
				});
				await studentPage.screenshot({
					path: resolve(REPORT_DIR, "816-student-class-dark.png"),
				});
			}
		} finally {
			await studentCtx.close();
		}
	});
});
