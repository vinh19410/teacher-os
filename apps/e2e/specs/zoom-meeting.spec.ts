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

test.describe("Zoom meeting & R2 recording per session", () => {
	test.setTimeout(120_000);

	test("tạo Zoom, reup recording lên R2, chuyển Zoom vào Trash, phát trong modal player và hết hạn sau 90 ngày", async ({
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

		try {
			// 1. Giáo viên mở lớp -> Điều chỉnh buổi -> thấy link Zoom
			await page.goto(`/teacher/classes/${classId}`);
			await page.getByRole("button", { name: "Điều chỉnh" }).first().click();
			const dialog = page.getByRole("dialog");
			await expect(dialog.getByText("Phòng học Zoom")).toBeVisible();
			await expect(dialog.getByText(/^https:\/\/zoom\.us\/j\//)).toBeVisible();

			// 2. Fake Zoom có recording -> cron tải MP4 lên R2, commit D1 và gọi Zoom Trash
			const recToggle = await page.request.post(
				`${API_ORIGIN}/__e2e/zoom-recording`,
				{ data: { ready: true, downloadError: null, trashError: null } },
			);
			expect(recToggle.status()).toBe(200);

			const afterSessionISO = addDaysISO(todayISO, 2);
			const syncAtIso = `${afterSessionISO}T05:00:00Z`;
			const cronRes = await page.request.post(
				`${API_ORIGIN}/__e2e/run-recording-cron`,
				{ data: { nowIso: syncAtIso } },
			);
			expect(cronRes.status()).toBe(200);
			const cronJson = (await cronRes.json()) as {
				updated: number;
				trashCalls: number;
			};
			expect(cronJson.updated).toBeGreaterThanOrEqual(1);
			expect(cronJson.trashCalls).toBeGreaterThanOrEqual(1);

			// Kiểm tra API stream Range 206 phía giáo viên + header bảo mật
			const teacherRangeRes = await page.request.get(
				`${API_ORIGIN}/api/classes/${classId}/sessions/${tomorrowISO}/recording/video`,
				{ headers: { Range: "bytes=0-31" } },
			);
			expect(teacherRangeRes.status()).toBe(206);
			expect(teacherRangeRes.headers()["content-type"]).toContain("video/mp4");
			expect(teacherRangeRes.headers()["content-disposition"]).toContain(
				"inline",
			);
			expect(teacherRangeRes.headers()["accept-ranges"]).toBe("bytes");
			expect(teacherRangeRes.headers()["cross-origin-resource-policy"]).toBe(
				"same-site",
			);

			// Giáo viên mở lại Điều chỉnh -> thấy nút Xem recording (R2 modal), hạn 90 ngày, KHÔNG hiện mật khẩu Zoom
			await page.reload();
			await page.getByRole("button", { name: "Điều chỉnh" }).first().click();
			const panel = page.getByRole("dialog");
			await expect(panel.getByText("Phòng học Zoom")).toBeVisible();
			await expect(panel.getByText(/^https:\/\/zoom\.us\/j\//)).toBeVisible();
			const teacherPlayBtn = panel.getByRole("button", {
				name: /Xem recording/i,
			});
			await expect(teacherPlayBtn).toBeVisible();
			await expect(panel.getByText(/Lưu đến /)).toBeVisible();
			await expect(panel.getByText("rec123")).toHaveCount(0);
			await expect(panel.getByText(/Mật khẩu recording:/)).toHaveCount(0);

			// Mở modal <video> player phía giáo viên
			await teacherPlayBtn.click();
			const teacherPlayerDialog = page
				.getByRole("dialog")
				.filter({ has: page.locator("video") });
			await expect(teacherPlayerDialog).toBeVisible();
			const teacherVideo = teacherPlayerDialog.locator("video");
			await expect(teacherVideo).toHaveAttribute("controlslist", "nodownload");
			await expect(teacherPlayerDialog.getByText(/Lưu trữ đến /)).toBeVisible();
			await expect(
				teacherPlayerDialog.getByRole("link", { name: /tải/i }),
			).toHaveCount(0);

			if (CAPTURE_POT) {
				mkdirSync(REPORT_DIR, { recursive: true });
				await page.setViewportSize({ width: 1440, height: 900 });
				await assertNoHorizontalOverflow(page);
				await page.screenshot({
					path: resolve(REPORT_DIR, "994-teacher-recording-player-desktop.png"),
				});
			}

			// Escape đóng riêng modal player mà vẫn giữ modal Điều chỉnh bên dưới
			await page.keyboard.press("Escape");
			await expect(teacherPlayerDialog).toHaveCount(0);
			await expect(panel).toBeVisible();

			// 3. Học viên: payload không lộ joinUrl / recordingStorageKey, mở modal <video> player R2, kiểm khung giờ Zoom
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
				expect(detailRaw).not.toContain("recordingStorageKey");
				expect(detailRaw).not.toContain("rec123");
				const detailJson = JSON.parse(detailRaw) as {
					lessons: Array<{
						date: string | null;
						status: string;
						hasZoom?: boolean;
						hasRecordingVideo?: boolean;
						recordingSource?: string;
						recordingExpiresAt?: string | null;
					}>;
				};
				const upcomingLesson = detailJson.lessons.find(
					(lesson) =>
						lesson.date === tomorrowISO && lesson.status === "upcoming",
				);
				expect(upcomingLesson?.hasZoom).toBe(true);
				expect(upcomingLesson?.hasRecordingVideo).toBe(true);
				expect(upcomingLesson?.recordingSource).toBe("r2");
				expect(upcomingLesson?.recordingExpiresAt).toBeTruthy();

				// Kiểm tra API stream Range 206 phía học viên
				const studentRangeRes = await studentPage.request.get(
					`${API_ORIGIN}/api/student/classes/${classId}/sessions/${tomorrowISO}/recording/video`,
					{ headers: { Range: "bytes=0-31" } },
				);
				expect(studentRangeRes.status()).toBe(206);
				expect(studentRangeRes.headers()["content-disposition"]).toContain(
					"inline",
				);

				await studentPage.goto(`${STUDENT_BASE_URL}/classes/${classId}`);
				const join = studentPage.getByRole("button", {
					name: /Vào lớp \(Zoom\)/i,
				});
				await expect(join.first()).toBeVisible();
				const recBtn = studentPage.getByRole("button", {
					name: /Xem recording/i,
				});
				await expect(recBtn.first()).toBeVisible();
				await expect(studentPage.getByText(/Lưu đến /).first()).toBeVisible();
				await expect(studentPage.getByText("Mật khẩu:")).toHaveCount(0);
				await expect(studentPage.getByText("rec123")).toHaveCount(0);

				// Bàn phím: Tab chạm được nút Vào lớp (Zoom) và nút Xem recording
				await studentPage.locator("body").click({ position: { x: 1, y: 1 } });
				const reached = new Set<string>();
				for (let i = 0; i < 80 && reached.size < 2; i++) {
					await studentPage.keyboard.press("Tab");
					const label = await studentPage.evaluate(() => {
						const el = document.activeElement;
						return (
							el?.getAttribute("aria-label") || el?.textContent?.trim() || ""
						);
					});
					for (const want of ["Vào lớp (Zoom)", "Xem recording"]) {
						if (label.includes(want)) reached.add(want);
					}
				}
				expect([...reached].sort()).toHaveLength(2);

				// Mở modal <video> player phía học viên + chụp POT 3 viewport + dark mode + 320px reflow
				await recBtn.first().click();
				const studentPlayerDialog = studentPage
					.getByRole("dialog")
					.filter({ has: studentPage.locator("video") });
				await expect(studentPlayerDialog).toBeVisible();
				const studentVideo = studentPlayerDialog.locator("video");
				await expect(studentVideo).toHaveAttribute(
					"controlslist",
					"nodownload",
				);
				expect(await studentVideo.getAttribute("src")).toContain(
					`/api/student/classes/${classId}/sessions/${tomorrowISO}/recording/video`,
				);
				await expect(
					studentPlayerDialog.getByText(/Lưu trữ đến /),
				).toBeVisible();

				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await assertNoHorizontalOverflow(studentPage);
					if (CAPTURE_POT) {
						await studentPage.screenshot({
							path: resolve(
								REPORT_DIR,
								`994-student-recording-player-${vp.name}.png`,
							),
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
					await assertNoHorizontalOverflow(studentPage);
					await studentPage.screenshot({
						path: resolve(REPORT_DIR, "994-student-recording-player-dark.png"),
					});
					await studentPage.evaluate(() => {
						document.documentElement.classList.remove("dark");
					});
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.keyboard.press("Escape");
				await expect(studentPlayerDialog).toHaveCount(0);

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

				// Kịch bản C — Đã kết thúc (20:30:00+07:00): hiện toast kết thúc, không mở tab Zoom.
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

				// 4. Hết hạn sau 90 ngày -> cron dọn object R2 + chuyển DB sang expired + stream trả 410 + UI hiện badge hết hạn
				const expiredIso = `${addDaysISO(afterSessionISO, 91)}T05:00:00Z`;
				const expireCronRes = await page.request.post(
					`${API_ORIGIN}/__e2e/run-recording-cron`,
					{ data: { nowIso: expiredIso } },
				);
				expect(expireCronRes.status()).toBe(200);
				const expireCronJson = (await expireCronRes.json()) as {
					expired: number;
				};
				expect(expireCronJson.expired).toBeGreaterThanOrEqual(1);

				const expiredVideoRes = await studentPage.request.get(
					`${API_ORIGIN}/api/student/classes/${classId}/sessions/${tomorrowISO}/recording/video`,
				);
				expect(expiredVideoRes.status()).toBe(410);

				await setE2eClock(page, null);
				await studentPage.reload();
				await expect(
					studentPage.getByText(/Recording đã hết hạn \(90 ngày\)/i).first(),
				).toBeVisible();
				await expect(
					studentPage.getByRole("button", { name: /Xem recording/i }),
				).toHaveCount(0);

				if (CAPTURE_POT) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await assertNoHorizontalOverflow(studentPage);
					await studentPage.screenshot({
						path: resolve(REPORT_DIR, "994-student-recording-expired.png"),
					});
				}
			} finally {
				await studentCtx.close();
			}
		} finally {
			await page.request
				.post(`${API_ORIGIN}/__e2e/clock`, { data: { nowIso: null } })
				.catch(() => {});
			await page.request
				.post(`${API_ORIGIN}/__e2e/zoom-recording`, {
					data: { ready: false, downloadError: null, trashError: null },
				})
				.catch(() => {});
		}
	});
});
