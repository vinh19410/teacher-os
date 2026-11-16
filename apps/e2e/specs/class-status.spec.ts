import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

const POT_VIEWPORTS = [
	{ name: "desktop-1440x900", width: 1440, height: 900 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "mobile-375x812", width: 375, height: 812 },
] as const;

async function capturePotScreenshots(page: Page, base: string): Promise<void> {
	if (process.env.CAPTURE_POT !== "1") return;
	mkdirSync(REPORT_DIR, { recursive: true });
	for (const vp of POT_VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await page.waitForTimeout(200);
		await page.screenshot({
			path: resolve(REPORT_DIR, `${base}-${vp.name}-light.png`),
			fullPage: true,
		});
		await page.evaluate(() => document.documentElement.classList.add("dark"));
		await page.waitForTimeout(200);
		await page.screenshot({
			path: resolve(REPORT_DIR, `${base}-${vp.name}-dark.png`),
			fullPage: true,
		});
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.setViewportSize({ width: 1440, height: 900 });
}

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

test.describe("Issue #694 — Reversible class pause & resume E2E", () => {
	test.setTimeout(120_000);

	test("tạm dừng và mở lại lớp hoạt động đồng bộ Teacher Web + Student Portal + lịch sử", async ({
		page,
		browser,
	}) => {
		const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		const todayISO = vietnamTodayISO();
		const pastISO = addDaysISO(todayISO, -7);

		const TARGET_CLASS = `Lớp IELTS Writing 6.5 (${token})`;
		const CONTROL_CLASS = `Lớp IELTS Foundation (${token})`;

		const teacherEmail = await signUpViaApi(page, {
			name: "Giáo Viên Minh",
			email: `gv.minh.${token}@test.local`,
		});

		// Lớp đối chứng luôn active để kiểm chứng dropdown AddStudentModal ẩn lớp paused.
		await seedDatedClass(page, {
			name: CONTROL_CLASS,
			startDate: addDaysISO(todayISO, 1),
			sessionsTotal: 2,
		});

		// Lớp mục tiêu có buổi quá khứ (đã hoàn thành) và buổi hôm nay (upcoming).
		const targetClassId = await seedDatedClass(page, {
			name: TARGET_CLASS,
			startDate: pastISO,
			schedule: { start: "18:30", end: "20:00" },
			sessionsTotal: 4,
		});

		const lanEmail = `lan.${token}@test.local`;
		const namEmail = `nam.${token}@test.local`;
		const lanStudent = await seedStudent({
			teacherEmail,
			name: "Học Viên Lan",
			email: lanEmail,
			onboarded: true,
		});
		const namStudent = await seedStudent({
			teacherEmail,
			name: "Học Viên Nam",
			email: namEmail,
			onboarded: true,
		});

		const lanEnrollRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${targetClassId}/enroll`,
			{
				data: { studentId: lanStudent.id, activateNow: true },
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(lanEnrollRes.status()).toBe(201);

		const namEnrollRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${targetClassId}/enroll`,
			{
				data: { studentId: namStudent.id, activateNow: false },
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(namEnrollRes.status()).toBe(201);

		// Điểm danh hoàn thành buổi quá khứ (pastISO) để kiểm chứng giữ lịch sử khi pause.
		const checkInRes = await page.request.post(
			`${API_ORIGIN}/api/classes/${targetClassId}/sessions/${pastISO}/check-in`,
			{
				data: {},
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(checkInRes.status()).toBe(200);

		// Gắn Zoom URL cho buổi upcoming hôm nay để kiểm chứng ẩn nút "Vào Zoom" khi pause.
		const kernelRes = await page.request.get(`${API_ORIGIN}/api/kernel`, {
			headers: { Origin: WEB_ORIGIN },
		});
		expect(kernelRes.status()).toBe(200);
		const kernelData = (await kernelRes.json()) as {
			lessons: Array<{
				id: string;
				classId: string;
				date: string | null;
				day: number;
				time: string;
				dur: number;
			}>;
		};
		const todayLesson = kernelData.lessons.find(
			(l) => l.classId === targetClassId && l.date === todayISO,
		);
		expect(todayLesson).toBeDefined();
		if (todayLesson) {
			const editRes = await page.request.post(
				`${API_ORIGIN}/api/lessons/${todayLesson.id}/edit`,
				{
					data: {
						day: todayLesson.day,
						time: todayLesson.time,
						dur: todayLesson.dur,
						topic: "Writing Task 2 — Opinion Essay",
						zoom: "https://zoom.example.test/ielts-694",
					},
					headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
				},
			);
			expect(editRes.status()).toBe(200);
		}

		// Kiểm chứng trước khi pause: buổi hôm nay hiện trên /schedule.
		await page.goto("/schedule");
		await expect(page.getByText(TARGET_CLASS).first()).toBeVisible();

		// 1. Vào /classes/$classId, kiểm tra badge "Đang hoạt động" và di chuyển Tab bàn phím tới "Tạm dừng lớp".
		await page.goto(`/classes/${targetClassId}`);
		const statusBadge = page.getByTestId("class-status-badge");
		await expect(statusBadge).toHaveText("Đang hoạt động");

		const pauseBtn = page.getByRole("button", { name: "Tạm dừng lớp" });
		await expect(pauseBtn).toBeVisible();
		await page
			.getByRole("link", { name: "Lớp học", exact: true })
			.last()
			.focus();
		let focusedPause = false;
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press("Tab");
			focusedPause = await pauseBtn.evaluate(
				(el) => document.activeElement === el,
			);
			if (focusedPause) break;
		}
		expect(focusedPause).toBe(true);
		await page.keyboard.press("Enter");

		const pauseModal = page.getByRole("dialog", {
			name: `Tạm dừng lớp ${TARGET_CLASS}`,
		});
		await expect(pauseModal).toBeVisible();
		await pauseModal.getByRole("button", { name: "Xác nhận tạm dừng" }).click();
		await expect(pauseModal).toBeHidden();
		await expect(statusBadge).toHaveText("Tạm dừng");

		// Reload giữ nguyên trạng thái "Tạm dừng".
		await page.reload();
		await expect(statusBadge).toHaveText("Tạm dừng");

		// Kiểm tra reflow 320px trên chi tiết lớp tạm dừng.
		await page.setViewportSize({ width: 320, height: 812 });
		const overflow320 = await page.evaluate(
			() =>
				document.documentElement.scrollWidth <=
				document.documentElement.clientWidth,
		);
		expect(overflow320).toBe(true);

		// Chụp POT cho màn chi tiết lớp đang tạm dừng (3 viewport Light & Dark).
		await capturePotScreenshots(page, "694-class-detail-paused");

		// Tab Học viên: "+ Thêm học viên vào lớp" ẩn; nút "Kích hoạt" disabled.
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "+ Thêm học viên vào lớp" }),
		).toHaveCount(0);
		const namRow = page.locator("tbody tr", { hasText: "Học Viên Nam" });
		await expect(namRow).toBeVisible();
		await expect(
			namRow.getByRole("button", { name: "Kích hoạt" }),
		).toBeDisabled();

		// 2. /students -> AddStudentModal ẩn lớp đang tạm dừng khỏi dropdown.
		await page.goto("/students");
		await page.getByRole("button", { name: "Thêm học viên" }).first().click();
		const addStudentDialog = page.getByRole("dialog", {
			name: "Thêm học viên mới",
		});
		await expect(addStudentDialog).toBeVisible();
		const classSelect = addStudentDialog.getByLabel(
			"Ghi danh vào lớp (tùy chọn)",
		);
		await expect(classSelect).toBeVisible();
		const classOptions = await classSelect.locator("option").allTextContents();
		expect(classOptions).toContain(CONTROL_CLASS);
		expect(classOptions).not.toContain(TARGET_CLASS);
		await addStudentDialog.getByRole("button", { name: "Hủy" }).click();
		await expect(addStudentDialog).toBeHidden();

		// 3. /classes -> chip lọc "Tạm dừng" cập nhật URL ?filter=paused & chụp POT 3 viewport Light & Dark.
		await page.goto("/classes");
		await page.getByRole("button", { name: "Tạm dừng", exact: true }).click();
		await expect(page).toHaveURL(/\/classes\?filter=paused/);
		await expect(page.locator("h3", { hasText: TARGET_CLASS })).toBeVisible();
		await expect(page.locator("h3", { hasText: CONTROL_CLASS })).toHaveCount(0);
		await capturePotScreenshots(page, "694-classes-paused");

		// 4. /schedule & /dashboard ẩn buổi upcoming; /attendance ngày quá khứ giữ lịch sử chỉ xem.
		await page.goto("/schedule");
		await expect(page.getByText(TARGET_CLASS)).toHaveCount(0);

		await page.goto("/dashboard");
		await expect(page.getByText(TARGET_CLASS)).toHaveCount(0);

		await page.goto(`/attendance?date=${pastISO}&status=all`);
		const pastRowBtn = page.getByRole("button", {
			name: new RegExp(TARGET_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
		});
		await expect(pastRowBtn).toBeVisible();
		await pastRowBtn.click();
		await expect(
			page.getByText("Lớp đang tạm dừng — chỉ xem lịch sử điểm danh."),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Lưu điểm danh ca học" }),
		).toBeDisabled();
		await expect(
			page.getByRole("textbox", { name: /^Ghi chú học vụ của / }).first(),
		).toBeDisabled();

		// 5. Student Portal:
		// 5a. Học viên invited ("Học Viên Nam") thấy badge Tạm dừng + nút "Tham gia lớp" disabled.
		const namCtx = await browser.newContext();
		const namPage = await namCtx.newPage();
		await signUpStudentOnPortal(namPage, {
			name: "Học Viên Nam",
			email: namEmail,
		});
		const namCard = namPage
			.getByTestId("class-card")
			.filter({ hasText: TARGET_CLASS });
		await expect(namCard).toBeVisible();
		await expect(namCard.getByText("Tạm dừng", { exact: true })).toBeVisible();
		await expect(
			namCard.getByText("Lớp đang tạm dừng — chưa thể tham gia"),
		).toBeVisible();
		await expect(
			namCard.getByRole("button", { name: "Tham gia lớp" }),
		).toBeDisabled();
		await namCtx.close();

		// 5b. Học viên active ("Học Viên Lan") vào chi tiết lớp: banner tạm dừng, không có "Buổi tới" / "Vào Zoom", nhãn "Tạm hoãn".
		const lanCtx = await browser.newContext();
		const lanPage = await lanCtx.newPage();
		await signUpStudentOnPortal(lanPage, {
			name: "Học Viên Lan",
			email: lanEmail,
		});
		await lanPage.goto(`${STUDENT_ORIGIN}/classes/${targetClassId}`);
		await expect(lanPage.getByTestId("class-paused-banner")).toBeVisible();
		await expect(lanPage.getByText("Tạm dừng").first()).toBeVisible();
		await expect(lanPage.getByText("Buổi tới")).toHaveCount(0);
		await expect(lanPage.getByRole("link", { name: /Vào Zoom/i })).toHaveCount(
			0,
		);
		await expect(lanPage.getByText("Tạm hoãn").first()).toBeVisible();
		await capturePotScreenshots(lanPage, "694-student-paused");
		await lanCtx.close();

		// 6. Giáo viên bấm "Mở lại lớp" -> khôi phục trạng thái "Đang hoạt động", lịch /schedule, nút "Kích hoạt".
		await page.goto(`/classes/${targetClassId}`);
		await page.getByRole("button", { name: "Mở lại lớp" }).click();
		const resumeModal = page.getByRole("dialog", {
			name: `Mở lại lớp ${TARGET_CLASS}`,
		});
		await expect(resumeModal).toBeVisible();
		await resumeModal.getByRole("button", { name: "Xác nhận mở lại" }).click();
		await expect(resumeModal).toBeHidden();
		await expect(statusBadge).toHaveText("Đang hoạt động");

		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await expect(
			page.getByRole("button", { name: "+ Thêm học viên vào lớp" }),
		).toBeVisible();
		await expect(
			page
				.locator("tbody tr", { hasText: "Học Viên Nam" })
				.getByRole("button", { name: "Kích hoạt" }),
		).toBeEnabled();

		await page.goto("/schedule");
		await expect(page.getByText(TARGET_CLASS).first()).toBeVisible();
	});
});
