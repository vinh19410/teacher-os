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

	await page.goto("/dashboard");
	const section = page.locator("section", { hasText: "Việc cần làm hôm nay" });
	await expect(section).toBeVisible();
	// Chờ thẻ có số (mốc đo UX vẫn ≤ 2s từ navigate — assert không phá nếu
	// dev server lạnh, gate chặt nằm ở response API phía trên).
	await expect(section.getByText("Việc cần làm hôm nay (")).toBeVisible({
		timeout: 2000,
	});
	await expect(section.getByText("1 ca")).toBeVisible({ timeout: 2000 });
	await expect(section.getByText("1 bài")).toBeVisible();
	await expect(section.getByText("1 Writing · 0 Speaking")).toBeVisible();
	await expect(section.getByText("1 học viên")).toBeVisible();

	// AC-001: bấm 1 lần trên thẻ ca học → /attendance?date&status=pending.
	await section
		.getByRole("link", { name: /Ca học hôm nay chưa điểm danh/ })
		.click();
	await expect(page).toHaveURL(
		new RegExp(`/attendance\\?date=${TODAY}&status=pending$`),
	);
	await expect(
		page.getByRole("heading", { name: "Điểm danh tổng theo ngày" }),
	).toBeVisible();

	// Quay dashboard, bấm nút thẻ chấm bài → /grading?status=awaiting.
	await page.goto("/dashboard");
	const sectionAgain = page.locator("section", {
		hasText: "Việc cần làm hôm nay",
	});
	await expect(sectionAgain.getByText("1 bài")).toBeVisible({ timeout: 5000 });
	await sectionAgain
		.getByRole("link", { name: /Bài tập quá hạn chấm/ })
		.click();
	await expect(page).toHaveURL(/\/grading\?status=awaiting$/);
});

test("screenshots dashboard reminders at 3 viewports", async ({ page }) => {
	const screenshots = new URL(
		"../../../plans/261026-1501-tos-6-dashboard-reminder-cards/screenshots/",
		import.meta.url,
	).pathname;
	await seedRemindersOrg(page);
	await page.goto("/dashboard");
	await expect(
		page
			.locator("section", { hasText: "Việc cần làm hôm nay" })
			.getByText("1 ca"),
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
