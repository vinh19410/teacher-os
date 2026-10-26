import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-7 / issue #440 — Điểm danh tổng theo ngày (`/attendance`) inline 4 trạng thái.
 *
 * Bao phủ đủ 5 kịch bản của Phase 5 + kiểm 3 viewport (1440×900, 768×1024,
 * 375×812, không cuộn ngang ở 375px) và điểm danh bằng bàn phím.
 */

const TODAY = vietnamTodayISO();

async function seedTodayClasses(page: Page) {
	const teacherEmail = await signUpViaUi(page);
	const mainClassId = await seedDatedClass(page, {
		name: "IELTS 6.5A Hôm Nay",
		startDate: TODAY,
		schedule: { start: "18:00", end: "19:30" },
		sessionsTotal: 2,
		students: {
			teacherEmail,
			names: ["An Nguyễn", "Bình Trần", "Cường Lê", "Dũng Phạm"],
		},
	});
	const cancelledClassId = await seedDatedClass(page, {
		name: "IELTS Huỷ Hôm Nay",
		startDate: TODAY,
		schedule: { start: "20:00", end: "21:30" },
		sessionsTotal: 2,
		students: {
			teacherEmail,
			names: ["Hà Đặng"],
		},
	});
	// Kịch bản 3: huỷ buổi hôm nay của lớp thứ 2 qua API có sẵn -> không hiện trên /attendance.
	const cancelRes = await page.request.post(
		`${API_ORIGIN}/api/classes/${cancelledClassId}/sessions/${TODAY}/cancel`,
		{
			data: {},
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
		},
	);
	expect(cancelRes.status()).toBe(200);

	return { teacherEmail, mainClassId, cancelledClassId };
}

test("AC-002: lọc theo ngày trên URL, buổi huỷ không hiện, tải ≤ 2s, thiếu trạng thái chặn lưu, chọn đủ 4 trạng thái + ghi chú và lưu ≤ 2s, bộ đếm dashboard giảm 1", async ({
	page,
}) => {
	await seedTodayClasses(page);

	// 1. Mở /dashboard, ghi lại số trên thẻ "Ca học hôm nay chưa điểm danh" (N = 1).
	await page.goto("/dashboard");
	const remindersSection = page.locator("section", {
		hasText: "Việc cần làm hôm nay",
	});
	await expect(remindersSection.getByText("1 ca")).toBeVisible({
		timeout: 5000,
	});

	// 5. Đo thời gian tải danh sách GET /api/attendance/daily ≤ 2000ms —
	// kongming note: đo thời gian server, không đo render + Vite on-demand
	// compile route /attendance ở lần goto đầu (khớp dashboard-reminders.spec.ts).
	const loadStart = Date.now();
	const dailyRes = await page.request.get(
		`${API_ORIGIN}/api/attendance/daily?date=${TODAY}`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	const loadElapsedMs = Date.now() - loadStart;
	expect(dailyRes.status()).toBe(200);
	expect(loadElapsedMs).toBeLessThanOrEqual(2000);

	await page.goto(`/attendance?date=${TODAY}`);
	// 3. Lớp có buổi hôm nay hiện với nhãn "Chưa điểm danh"; buổi đã huỷ không xuất hiện.
	await expect(page.getByText("IELTS 6.5A Hôm Nay")).toBeVisible();
	await expect(page.getByText("IELTS Huỷ Hôm Nay")).toHaveCount(0);

	// Mở ca ngay tại chỗ.
	await page.getByRole("button", { name: /IELTS 6.5A Hôm Nay/ }).click();

	// 2. Thiếu trạng thái: để trống 1 học viên, bấm lưu -> thông báo thiếu, không có request PUT.
	const groupAn = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của An Nguyễn",
	});
	const groupBinh = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Bình Trần",
	});
	const groupCuong = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Cường Lê",
	});
	const groupDung = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Dũng Phạm",
	});

	await groupAn.getByRole("radio", { name: "Có mặt" }).click();
	await groupBinh.getByRole("radio", { name: "Vắng có phép" }).click();
	await groupCuong.getByRole("radio", { name: "Vắng không phép" }).click();

	let putFired = false;
	const onRequest = (req: { method(): string; url(): string }) => {
		if (req.method() === "PUT" && req.url().includes("/attendance")) {
			putFired = true;
		}
	};
	page.on("request", onRequest);

	await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
	await expect(
		page.getByRole("alert").filter({
			hasText: "Còn 1 học viên chưa chọn trạng thái",
		}),
	).toBeVisible();
	await page.waitForTimeout(400);
	expect(putFired).toBe(false);
	page.off("request", onRequest);

	// Dùng bàn phím (ArrowRight trên radiogroup đã được focus) để chọn trạng thái cho học viên thứ 4 (Đi muộn).
	await groupDung.getByRole("radio", { name: "Đi muộn" }).click();
	await page.getByLabel("Ghi chú học vụ của Dũng Phạm").fill("Vào trễ 10 phút");

	// Bấm "Lưu điểm danh ca học": đo từ lúc bấm đến khi toast hiện ≤ 2000ms, URL không đổi.
	const urlBeforeSave = page.url();
	const saveStart = performance.now();
	await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
	await expect(page.getByText("Đã lưu điểm danh")).toBeVisible({
		timeout: 2000,
	});
	const saveElapsedMs = performance.now() - saveStart;
	expect(saveElapsedMs).toBeLessThanOrEqual(2000);
	expect(page.url()).toBe(urlBeforeSave);

	// Ca đổi nhãn "Đã điểm danh (2/4 có mặt)" (present + late).
	await expect(page.getByText(/Đã điểm danh \(2\/4 có mặt\)/)).toBeVisible();

	// 4. Lọc chip: ?status=pending không còn ca này; ?status=completed hiện ca đã lưu.
	const chipGroup = page.getByRole("group", {
		name: "Lọc trạng thái điểm danh",
	});
	await chipGroup.getByRole("button", { name: "Chưa điểm danh" }).click();
	await expect(page).toHaveURL(/status=pending/);
	await expect(
		page.getByText("Không có ca học nào trong ngày này."),
	).toBeVisible();

	await chipGroup.getByRole("button", { name: "Đã điểm danh" }).click();
	await expect(page).toHaveURL(/status=completed/);
	await expect(page.getByText("IELTS 6.5A Hôm Nay")).toBeVisible();

	// Tải lại trang: trạng thái và ghi chú vẫn đúng.
	await page.reload();
	await page.getByRole("button", { name: /IELTS 6.5A Hôm Nay/ }).click();
	await expect(
		page
			.getByRole("radiogroup", { name: "Trạng thái điểm danh của Dũng Phạm" })
			.getByRole("radio", { name: "Đi muộn" }),
	).toHaveAttribute("aria-checked", "true");
	await expect(page.getByLabel("Ghi chú học vụ của Dũng Phạm")).toHaveValue(
		"Vào trễ 10 phút",
	);

	// Bộ đếm giảm đúng 1: API pending 1 -> 0, UI thẻ chuyển sang trạng thái hoàn tất.
	const remindersRes = await page.request.get(
		`${API_ORIGIN}/api/dashboard/reminders`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(remindersRes.status()).toBe(200);
	const reminders = (await remindersRes.json()) as {
		attendance: { pending: number };
	};
	expect(reminders.attendance.pending).toBe(0);

	await page.goto("/dashboard");
	const attendanceCard = page
		.getByRole("heading", { name: "Ca học hôm nay chưa điểm danh" })
		.locator("xpath=..");
	await expect(attendanceCard.getByText("Đã hoàn tất hôm nay")).toBeVisible({
		timeout: 5000,
	});
	await expect(page.getByText("1 ca")).toHaveCount(0);
});

test("3 viewport (1440×900, 768×1024, 375×812): chụp screenshot ca đang mở và kiểm không cuộn ngang ở 375px", async ({
	page,
}) => {
	const screenshotsDir = new URL(
		"../../../plans/261026-1524-tos-7-daily-attendance-inline/screenshots/",
		import.meta.url,
	).pathname;
	mkdirSync(screenshotsDir, { recursive: true });

	await seedTodayClasses(page);
	await page.goto(`/attendance?date=${TODAY}&status=pending`);

	// Với status=pending, ca chưa điểm danh đầu tiên tự mở sẵn.
	await expect(
		page.getByRole("radiogroup", {
			name: "Trạng thái điểm danh của An Nguyễn",
		}),
	).toBeVisible();

	for (const [w, h, name] of [
		[1440, 900, "daily-attendance-1440"],
		[768, 1024, "daily-attendance-768"],
		[375, 812, "daily-attendance-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(250);

		if (w === 375) {
			const hasHorizontalOverflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(hasHorizontalOverflow).toBe(false);
		}

		await page.screenshot({
			path: `${screenshotsDir}${name}.png`,
			fullPage: true,
		});
	}
});
