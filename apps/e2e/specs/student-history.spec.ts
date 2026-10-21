import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * #378 phase 11 — Lịch sử: nộp 1 bài luyện (seed như phase 10) → heatmap
 * tháng có đếm ngày hôm nay ≥1, bảng tuần có cột Reading, danh sách chi tiết
 * có dòng "Tự chấm 2/2". Kernel rows seeded direct-DB (precedent
 * seedQuizFixture); auth học viên thật làm một lần trong beforeAll.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `history.${runToken}@test.local`;
const studentName = "Bảo Ngọc History";
const className = "IELTS History E2E";

const PRACTICE_PROMPT_QUESTIONS = [
	{ stem: "Số 1", opts: ["A", "B"], answer: "A", alts: "", pin: null },
	{ stem: "Số 2", opts: ["A", "B"], answer: "B", alts: "", pin: null },
];
const practiceTestTitle = "The Falkirk Wheel";

let fixture: QuizFixture;

async function seedPracticeTest(): Promise<string> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	const now = Date.now();
	const testId = crypto.randomUUID();
	const promptId = crypto.randomUUID();

	await db.execute({
		sql: `INSERT INTO assignment_prompt (
				id, org_id, task, genre, skill, part, type, title, prompt, questions, status, created_at
			) VALUES (?,?, 'task1', '', 'reading', 'p1', 'mcq', 'Passage 1', '', ?, 'ready', ?)`,
		args: [
			promptId,
			fixture.orgId,
			JSON.stringify(PRACTICE_PROMPT_QUESTIONS),
			now,
		],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test (id, org_id, title, skill, time_limit_seconds, collection, test_group, status, created_at, updated_at)
			VALUES (?,?,?, 'reading', 1200, 'IELTS Trainer 2', 'TEST 1', 'ready', ?, ?)`,
		args: [testId, fixture.orgId, practiceTestTitle, now, now],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position)
			VALUES (?,?,?, 'p1', 1)`,
		args: [crypto.randomUUID(), testId, promptId],
	});
	db.close();
	return testId;
}

async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
}

/** Nộp bài luyện reading seed — 2 câu đúng, nộp từ take screen. */
async function submitPracticeReading(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/practice/reading`);
	const card = page
		.getByTestId("practice-test-card")
		.filter({ hasText: practiceTestTitle });
	await card.click();
	await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);
	await page
		.locator('[data-question="0"] label', { hasText: "A" })
		.first()
		.click();
	await page
		.locator('[data-question="1"] label', { hasText: "B" })
		.first()
		.click();
	await page.getByRole("button", { name: "Nộp bài" }).click();
	await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
}

test.beforeAll(async ({ browser }) => {
	fixture = await seedQuizFixture({
		orgName: `History E2E ${runToken}`,
		className,
		studentName,
		studentEmail,
		prompts: [],
	});
	await seedPracticeTest();
	// Auth học viên thật (portal signup + mail-log verification) như phase 10.
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(studentName);
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await context.close();
});

test.describe("Student history (#378 phase 11)", () => {
	test("nộp 1 bài luyện → heatmap hôm nay ≥1, danh sách có dòng tương ứng", async ({
		page,
	}) => {
		await signIn(page);
		await submitPracticeReading(page);

		// Summary/Review là full-bleed (không shell) — nav chỉ có khi vào trang
		// trong shell (/history).
		await page.goto(`${STUDENT_ORIGIN}/history`);
		const nav = page.getByRole("navigation", { name: "Điều hướng học viên" });
		await expect(nav.getByText("Lịch sử")).toBeVisible();

		await expect(page.getByTestId("student-history-page")).toBeVisible();

		// Heatmap: ô ngày hôm nay (giờ VN) đếm ≥1 — đúng 1 hoạt động vừa nộp.
		const todayKey = vietnamTodayISO();
		const [, mm, dd] = todayKey.split("-");
		const todayCell = page.getByRole("button", {
			name: new RegExp(`^Ngày ${dd}/${mm}: [1-9]\\d* bài$`),
		});
		await expect(todayCell).toHaveCount(1);

		// URL chưa có ?week= (mặc định = tuần hôm nay); bấm ô ngày hôm nay
		// → tuần được đặt vào URL (?week=<monday>) cho WeekTable.
		const monday = mondayOfVN(todayKey);
		await todayCell.click();
		await expect(page).toHaveURL(new RegExp(`week=${monday}`));

		// Bảng tuần: hàng hôm nay có nhãn "Hôm nay" và đếm Reading = 1.
		const todayRow = page
			.getByTestId("history-week-table")
			.getByRole("row")
			.filter({ hasText: "Hôm nay" });
		await expect(todayRow).toContainText(`${dd}/${mm}`);
		await expect(todayRow).toContainText("1");

		// Danh sách chi tiết: dòng bài vừa nộp, tự chấm 2/2, thời lượng m.
		const entry = page
			.getByTestId("history-entry-row")
			.filter({ hasText: practiceTestTitle });
		await expect(entry).toContainText(`${dd}/${mm}`);
		await expect(entry).toContainText("2/2");
		await expect(entry).toContainText("Tự chấm");
		// Lọc theo skill qua URL (?skill=) chỉ còn đúng dòng đó.
		await page.goto(`${STUDENT_ORIGIN}/history?skill=writing`);
		await expect(
			page.getByText("Chưa có hoạt động Writing nào."),
		).toBeVisible();
	});

	test("HistoryButton ở Practice dẫn tới /history?skill= với đếm thật", async ({
		page,
	}) => {
		await signIn(page);
		await page.goto(`${STUDENT_ORIGIN}/practice/reading`);
		// Testid: nav item "Lịch sử" ở sidebar cũng là button — không dùng
		// role/name trần kẻo trúng nhầm.
		const historyButton = page.getByTestId("history-button");
		// Đã có 1 lượt nộp ở test trước → đếm (1).
		await expect(historyButton).toContainText("(1)");
		await historyButton.click();
		await expect(page).toHaveURL(/\/history\?skill=reading/);
		await expect(
			page
				.getByTestId("history-entry-row")
				.filter({ hasText: practiceTestTitle }),
		).toHaveCount(1);
	});
});

/** Thứ Hai của ngày ISO — copy helpers.mondayWeekStartISO (tránh leak API khác). */
function mondayOfVN(iso: string): string {
	const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return addDaysISO(iso, -((dow + 6) % 7));
}
