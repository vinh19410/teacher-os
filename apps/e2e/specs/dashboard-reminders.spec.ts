import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	isoInDaysFromTodayVN,
	orgIdForTeacherEmail,
	signUpViaApi,
} from "./helpers";
import { seedQuizFixture, seedSubmittedEssay } from "./helpers-quiz";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-6 / issue #439 — 3 thẻ "Việc cần làm hôm nay" trên /dashboard.
 *
 * Chứng minh Scenario 1 của AC-001: bộ đếm đúng với dữ liệu seed, API trả
 * trong ≤ 2s (đo response của GET /api/dashboard/reminders — kongming note:
 * đo thời gian server, không đo render CI), và 1 lần bấm thẻ/nút dẫn sang
 * màn đã lọc sẵn (/attendance?date&status=pending, /grading?status=awaiting).
 *
 * Seed dùng helper sẵn có: seedQuizFixture (lớp dated + ca hôm nay
 * `upcoming` + đề writing), seedSubmittedEssay với `submittedAtMs` = 25h
 * trước, và INSERT invoice trực tiếp (cùng pattern invoice-detail.spec.ts).
 */

const HOUR_MS = 60 * 60 * 1000;
const TODAY = isoInDaysFromTodayVN(0);
const YESTERDAY = isoInDaysFromTodayVN(-1);

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function seedOverdueInvoice(opts: {
	orgId: string;
	studentId: string;
}): Promise<void> {
	const client = openDb();
	try {
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, status, due, note, date, type, method, payment_code, pay_token, paid_amount, created_at)
				VALUES (?, ?, ?, '', 1200000, 'unpaid', ?, 'TOS-6 e2e', '01/10', 'Học phí', 'CK', ?, ?, 0, ?)`,
			args: [
				crypto.randomUUID(),
				opts.orgId,
				opts.studentId,
				YESTERDAY,
				`TOS${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
				`TOS${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
				Date.now(),
			],
		});
	} finally {
		client.close();
	}
}

/** Teacher + dữ liệu seed cho đủ 3 thẻ: 1 ca hôm nay upcoming, 1 bài writing
 * nộp 25h trước (chưa chấm), 1 hoá đơn quá hạn. */
async function seedRemindersOrg(page: Page): Promise<string> {
	const teacherEmail = await signUpViaApi(page);
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	const seeded = await seedQuizFixture({
		orgName: `TOS-6 reminders ${Date.now()}`,
		orgId,
		className: "Lớp TOS-6 điểm danh",
		studentName: "Học Viên TOS-6",
		studentEmail: `tos6-${Date.now()}@e2e.test`,
		prompts: [
			{
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Writing Task 2 TOS-6",
				passage: "",
				note: "",
				questions: [],
			},
		],
		lessons: [
			{ date: TODAY, time: "19:00", dur: 90, status: "upcoming", topic: "" },
		],
	});
	const assignmentId = seeded.assignmentIds[0];
	if (!assignmentId) throw new Error("seedQuizFixture trả thiếu assignmentId");
	await seedSubmittedEssay({
		orgId,
		assignmentId,
		studentId: seeded.studentId,
		essay: "<p>Bài viết quá hạn chấm 25 giờ.</p>",
		submittedAtMs: Date.now() - 25 * HOUR_MS,
	});
	await seedOverdueInvoice({ orgId, studentId: seeded.studentId });
	return teacherEmail;
}

test("3 thẻ nhắc việc: số đếm khớp seed, API ≤ 2s, bấm thẻ/nút dẫn đúng màn lọc", async ({
	page,
}) => {
	await seedRemindersOrg(page);

	// Đo thời gian response của chính endpoint bộ đếm — cookie ride trên
	// request context của page sau đăng ký UI.
	const started = Date.now();
	const res = await page.request.get(`${API_ORIGIN}/api/dashboard/reminders`, {
		headers: { Origin: WEB_ORIGIN },
	});
	expect(res.status()).toBe(200);
	const elapsedMs = Date.now() - started;
	expect(elapsedMs).toBeLessThanOrEqual(2000);
	const body = (await res.json()) as {
		date: string;
		attendance: { pending: number };
		overdueGrading: { count: number; writing: number; speaking: number };
		tuition?: { students: number; outstanding: number };
	};
	expect(body.date).toBe(TODAY);
	expect(body.attendance.pending).toBe(1);
	expect(body.overdueGrading).toEqual({
		count: 1,
		writing: 1,
		speaking: 0,
	});
	expect(body.tuition).toBeTruthy();
	expect(body.tuition?.students).toBe(1);
	expect(body.tuition?.outstanding).toBe(1_200_000);

	await page.goto("/teacher/dashboard");
	const section = page.locator("section", { hasText: "Việc cần làm hôm nay" });
	await expect(section).toBeVisible();
	// Chờ thẻ có số (gate 2s chặt nằm ở response API phía trên).
	await expect(section.getByText("1 ca dạy")).toBeVisible({ timeout: 5000 });
	await expect(section.getByText("1 bài")).toBeVisible();
	await expect(section.getByText("1 Writing · 0 Speaking")).toBeVisible();
	await expect(section.getByText("1 học viên")).toBeVisible();
	await expect(
		section.getByRole("link", {
			name: /^1\. Điểm danh — Ca dạy chưa điểm danh$/,
		}),
	).toBeVisible();
	await expect(
		section.getByRole("link", {
			name: /^2\. Chấm bài — Bài tập quá hạn chấm > 24h$/,
		}),
	).toBeVisible();
	await expect(
		section.getByRole("link", {
			name: /^3\. Học phí — Học phí đến hạn$/,
		}),
	).toBeVisible();

	// AC-001: bấm 1 lần trên thẻ ca dạy → /attendance?date&status=pending.
	await section
		.getByRole("link", {
			name: /^1\. Điểm danh — Ca dạy chưa điểm danh$/,
		})
		.click();
	await expect(page).toHaveURL(
		new RegExp(`/teacher/attendance\\?date=${TODAY}&status=pending$`),
	);
	await expect(
		page.getByRole("heading", { name: "Điểm danh tổng theo ngày" }),
	).toBeVisible();

	// Quay dashboard, bấm nút thẻ chấm bài → /grading?status=awaiting.
	await page.goto("/teacher/dashboard");
	const sectionAgain = page.locator("section", {
		hasText: "Việc cần làm hôm nay",
	});
	await expect(sectionAgain.getByText("1 bài")).toBeVisible({ timeout: 5000 });
	await sectionAgain
		.getByRole("link", {
			name: /^2\. Chấm bài — Bài tập quá hạn chấm > 24h$/,
		})
		.click();
	await expect(page).toHaveURL(/\/teacher\/grading\?status=awaiting$/);
});

test("screenshots dashboard reminders at 3 viewports", async ({ page }) => {
	const screenshots = new URL(
		"../../../plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots/",
		import.meta.url,
	).pathname;
	await seedRemindersOrg(page);
	await page.goto("/teacher/dashboard");
	await expect(
		page
			.locator("section", { hasText: "Việc cần làm hôm nay" })
			.getByText("1 ca dạy"),
	).toBeVisible({ timeout: 5000 });
	for (const [w, h, name] of [
		[1440, 900, "dashboard-reminders-1440"],
		[768, 1024, "dashboard-reminders-768"],
		[375, 812, "dashboard-reminders-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(300);
		await page.screenshot({
			path: `${screenshots}${name}.png`,
			fullPage: true,
		});
	}
});

test("nợ điểm danh 6 buổi quá khứ (#959): API ?v=2 và v1 đều đúng, thẻ #1 cờ 6 ca quá hạn và 1 click mở thẳng /attendance?status=overdue", async ({
	page,
}) => {
	const teacherEmail = await signUpViaApi(page);
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	const pastDates = [-11, -9, -7, -5, -3, -1].map((offset) =>
		isoInDaysFromTodayVN(offset),
	);
	await seedQuizFixture({
		orgName: `Overdue 959 ${Date.now()}`,
		orgId,
		className: "IELTS Foundation 5.5 (Test)",
		studentName: "Minh Anh",
		studentEmail: `overdue959-${Date.now()}@e2e.test`,
		prompts: [
			{
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Writing Task 2",
				passage: "",
				note: "",
				questions: [],
			},
		],
		lessons: pastDates.map((date) => ({
			date,
			time: "19:00",
			dur: 90,
			status: "upcoming" as const,
			topic: "",
		})),
	});

	// API v2 trả đủ today=0, overdue=6, pending=6 trong ≤ 2000ms.
	const t0 = Date.now();
	const v2Res = await page.request.get(
		`${API_ORIGIN}/api/dashboard/reminders?v=2`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(v2Res.status()).toBe(200);
	expect(Date.now() - t0).toBeLessThanOrEqual(2000);
	const v2Body = (await v2Res.json()) as {
		date: string;
		attendance: {
			pending: number;
			today?: number;
			overdue?: number;
			items: Array<{ date?: string }>;
		};
	};
	expect(v2Body.date).toBe(TODAY);
	expect(v2Body.attendance.pending).toBe(6);
	expect(v2Body.attendance.today).toBe(0);
	expect(v2Body.attendance.overdue).toBe(6);
	expect(v2Body.attendance.items).toHaveLength(3);
	expect(v2Body.attendance.items[0]?.date).toBe(pastDates[5]);

	// API v1 (không có ?v=2) vẫn đếm pending=6 và lược bỏ field mới để client cũ không lỗi .strict().
	const v1Res = await page.request.get(
		`${API_ORIGIN}/api/dashboard/reminders`,
		{
			headers: { Origin: WEB_ORIGIN },
		},
	);
	expect(v1Res.status()).toBe(200);
	const v1Body = (await v1Res.json()) as {
		attendance: Record<string, unknown> & {
			pending: number;
			items: Array<Record<string, unknown>>;
		};
	};
	expect(v1Body.attendance.pending).toBe(6);
	expect("today" in v1Body.attendance).toBe(false);
	expect("overdue" in v1Body.attendance).toBe(false);
	expect("date" in (v1Body.attendance.items[0] ?? {})).toBe(false);

	await page.goto("/teacher/dashboard");
	const attendanceCard = page.getByTestId("reminder-card-attendance");
	await expect(attendanceCard.getByText("6 ca dạy")).toBeVisible({
		timeout: 5000,
	});
	await expect(attendanceCard.getByText("6 ca quá hạn")).toBeVisible();
	await expect(attendanceCard.getByText("Đã hoàn tất hôm nay")).toHaveCount(0);
	await expect(page.getByTestId("dashboard-hero-summary")).not.toContainText(
		"Mọi việc hôm nay đã xong.",
	);

	if (process.env.CAPTURE_POT_959 === "1") {
		const reportsDir = new URL("../../../plans/reports/", import.meta.url)
			.pathname;
		mkdirSync(reportsDir, { recursive: true });
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.waitForTimeout(250);
		await page.screenshot({
			path: `${reportsDir}959-dashboard-overdue-1440-light.png`,
			fullPage: true,
		});
		const themeSwitch = page.getByRole("switch", { name: "Giao diện tối" });
		await themeSwitch.click();
		await page.waitForTimeout(250);
		await page.screenshot({
			path: `${reportsDir}959-dashboard-overdue-1440-dark.png`,
			fullPage: true,
		});
		await themeSwitch.click();
		await page.waitForTimeout(150);
	}

	await attendanceCard
		.getByRole("link", { name: /^1\. Điểm danh — Ca dạy chưa điểm danh$/ })
		.click();
	await expect(page).toHaveURL(
		new RegExp(`/teacher/attendance\\?date=${TODAY}&status=overdue$`),
	);
	await expect(
		page.getByText("IELTS Foundation 5.5 (Test)").first(),
	).toBeVisible();
	await expect(
		page.getByRole("radiogroup", { name: /Trạng thái điểm danh của Minh Anh/ }),
	).toBeVisible();
});
