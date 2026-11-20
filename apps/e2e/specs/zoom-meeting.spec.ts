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
import {
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
	STUDENT_ORIGIN,
	WEB_ORIGIN,
} from "./origins";

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
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(opts.name);
	await page.locator("#signup-email").fill(opts.email);
	await page.locator("#signup-password").fill(password);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, opts.email);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
}

async function setE2eClock(page: Page, nowIso: string | null): Promise<void> {
	const res = await page.request.post(`${API_ORIGIN}/__e2e/clock`, {
		data: { nowIso },
	});
	expect(res.status()).toBe(200);
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
		await page.goto(`/teacher/classes/${classId}`);
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
		await expect(panel.getByText("Phòng học Zoom")).toBeVisible();
		await expect(panel.getByText(/^https:\/\/zoom\.us\/j\//)).toBeVisible();
		await expect(panel.getByText("Xem recording")).toBeVisible();
		await expect(panel.getByText("rec123")).toBeVisible();
		await expect(panel.getByText(/Mật khẩu recording:/)).toBeVisible();

		// 3. Học viên: payload không lộ raw joinUrl, nút Vào lớp (Zoom) kiểm tra khung giờ
		// [start - 30 phút, end) theo đồng hồ máy chủ, và vẫn thấy recording + mật khẩu.
		const studentCtx = await browser.newContext();
		await studentCtx.route("https://zoom.us/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<html><body>Zoom Meeting Stub</body></html>",
			}),
		);
		const studentPage = await studentCtx.newPage();
		try {
			await signUpStudentOnPortal(studentPage, {
				name: "Học Viên Minh Anh",
				email: studentEmail,
			});

			const detailRes = await studentPage.request.get(
				`${API_ORIGIN}/api/student/classes/${classId}`,
				{ headers: { origin: STUDENT_ORIGIN } },
			);
			expect(detailRes.status()).toBe(200);
			const detailRaw = await detailRes.text();
			expect(detailRaw).not.toContain("https://zoom.us/j/");
			const detailJson = JSON.parse(detailRaw) as {
				lessons: Array<{
					date: string | null;
					status: string;
					hasZoom?: boolean;
				}>;
			};
			const upcomingLesson = detailJson.lessons.find(
				(lesson) => lesson.date === tomorrowISO && lesson.status === "upcoming",
			);
			expect(upcomingLesson?.hasZoom).toBe(true);

			await studentPage.goto(`${STUDENT_BASE_URL}/classes/${classId}`);
			const join = studentPage.getByRole("button", {
				name: /Vào lớp \(Zoom\)/i,
			});
			await expect(join.first()).toBeVisible();
			const rec = studentPage.getByRole("link", { name: /Xem recording/i });
			await expect(rec.first()).toBeVisible();
			expect(await rec.first().getAttribute("href")).toMatch(
				/^https:\/\/zoom\.us\/rec\/share\//,
			);
			await expect(studentPage.getByText("Mật khẩu:").first()).toBeVisible();
			await expect(studentPage.getByText("rec123").first()).toBeVisible();

			// Bàn phím: Tab phải chạm được nút Vào lớp (Zoom), link Xem recording và nút sao chép mật khẩu.
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

			// Kịch bản A — Quá sớm (18:29:00+07:00 cho buổi 19:00, dur 90): không mở tab Zoom, hiện toast khung giờ.
			await setE2eClock(page, `${tomorrowISO}T18:29:00+07:00`);
			let unexpectedPopup = false;
			const onUnexpectedPopup = () => {
				unexpectedPopup = true;
			};
			studentPage.on("popup", onUnexpectedPopup);
			try {
				await join.first().scrollIntoViewIfNeeded();
				await join.first().click();
				const tooEarlyToast = studentPage
					.locator("[data-sonner-toast]")
					.filter({ hasText: "Chưa đến giờ vào lớp" })
					.last();
				await expect(tooEarlyToast).toBeVisible();
				await expect(tooEarlyToast).toContainText("18:30");
				await expect(tooEarlyToast).toContainText("20:30");
				expect(unexpectedPopup).toBe(false);
				expect(studentCtx.pages()).toHaveLength(1);

				// Kiểm tra không tràn ngang trên 3 viewport + 320px reflow; chụp POT khi E2E_CAPTURE_POT=1.
				if (CAPTURE_POT) mkdirSync(REPORT_DIR, { recursive: true });
				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await join.first().scrollIntoViewIfNeeded();
					if (CAPTURE_POT) {
						await join.first().click();
						await expect(tooEarlyToast).toBeVisible();
						await studentPage.waitForTimeout(300);
					}
					await assertNoHorizontalOverflow(studentPage);
					if (CAPTURE_POT) {
						await studentPage.screenshot({
							path: resolve(REPORT_DIR, `840-zoom-too-early-${vp.name}.png`),
						});
					}
				}
				await studentPage.setViewportSize({ width: 320, height: 812 });
				await assertNoHorizontalOverflow(studentPage);

				if (CAPTURE_POT) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await studentPage.evaluate(() => {
						document.documentElement.classList.add("dark");
					});
					await join.first().scrollIntoViewIfNeeded();
					await join.first().click();
					await expect(tooEarlyToast).toBeVisible();
					await studentPage.waitForTimeout(300);
					await assertNoHorizontalOverflow(studentPage);
					await studentPage.screenshot({
						path: resolve(REPORT_DIR, "840-zoom-too-early-dark.png"),
					});
					await studentPage.evaluate(() => {
						document.documentElement.classList.remove("dark");
					});
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });
			} finally {
				studentPage.off("popup", onUnexpectedPopup);
			}

			// Kịch bản B — Trong khung giờ (18:30:00+07:00, đúng sớm 30 phút): mở tab Zoom thật.
			await setE2eClock(page, `${tomorrowISO}T18:30:00+07:00`);
			await join.first().scrollIntoViewIfNeeded();
			const [popup] = await Promise.all([
				studentPage.waitForEvent("popup"),
				join.first().click(),
			]);
			await expect(popup).toHaveURL(/^https:\/\/zoom\.us\/j\//);
			await popup.close();

			// Kịch bản C — Đã kết thúc (20:30:00+07:00, giữ nguyên trang không reload): hiện toast kết thúc, không còn tab Zoom mở.
			await setE2eClock(page, `${tomorrowISO}T20:30:00+07:00`);
			await join.first().scrollIntoViewIfNeeded();
			await join.first().click();
			const endedToast = studentPage
				.locator("[data-sonner-toast]")
				.filter({ hasText: "Buổi học đã kết thúc" })
				.last();
			await expect(endedToast).toBeVisible();
			await expect
				.poll(() => studentCtx.pages().length, { timeout: 3_000 })
				.toBe(1);
		} finally {
			await page.request
				.post(`${API_ORIGIN}/__e2e/clock`, { data: { nowIso: null } })
				.catch(() => {});
			await studentCtx.close();
		}
	});
});
