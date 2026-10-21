import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * #378 phase 10 — Luyện tập: catalog 5 skill (không Dictation), start đề
 * seed → nộp → thấy điểm, và bài practice KHÔNG lọt bảng điểm lớp. Kernel
 * rows seeded direct-DB (precedent seedQuizFixture); auth học viên thật
 * (portal signup + mail-log verification) làm một lần trong beforeAll.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `practice.${runToken}@test.local`;
const studentName = "Bảo Ngọc Practice";
const className = "IELTS Practice E2E";

const PRACTICE_PROMPT_QUESTIONS = [
	{ stem: "Số 1", opts: ["A", "B"], answer: "A", alts: "", pin: null },
	{ stem: "Số 2", opts: ["A", "B"], answer: "B", alts: "", pin: null },
];
const practiceTestTitle = "The Falkirk Wheel";
const classQuizTitle = "Quiz tuần 3 đọc hiểu";

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

test.beforeAll(async ({ browser }) => {
	fixture = await seedQuizFixture({
		orgName: `Practice E2E ${runToken}`,
		className,
		studentName,
		studentEmail,
		prompts: [
			{
				title: classQuizTitle,
				skill: "reading",
				part: "p1",
				type: "mcq",
				note: "<p>Đọc kỹ đoạn văn.</p>",
				passage: "<p>Passage của bài giao.</p>",
				questions: PRACTICE_PROMPT_QUESTIONS,
			},
		],
	});
	await seedPracticeTest();

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

test.describe("Student practice catalog (#378 phase 10)", () => {
	test("Luyện tập › Reading: mở đề seed → nộp → thấy điểm", async ({
		page,
	}) => {
		await signIn(page);

		// Nav "Luyện tập" đã bật (phase 10); "Lịch sử" đã bật theo phase 11.
		const nav = page.getByRole("navigation");
		await expect(nav.getByText("Luyện tập")).toBeVisible();
		await expect(nav.getByText("Lịch sử")).toBeVisible();

		// Mục cha dẫn về /practice → redirect skill đầu (/practice/reading).
		await page.goto(`${STUDENT_ORIGIN}/practice`);
		// Redirect giữ query (?page=1) — khớp path, không neo cuối.
		await expect(page).toHaveURL(/\/practice\/reading(\?|$)/);
		await expect(page.getByTestId("student-practice-page")).toBeVisible();

		// Card đề seed hiện kèm collection; skill chưa có đề → empty state.
		const card = page
			.getByTestId("practice-test-card")
			.filter({ hasText: practiceTestTitle });
		await expect(card).toContainText("IELTS Trainer 2");

		// Bắt đầu đề: card click → POST start → take screen (practice tự start,
		// không qua gate dialog như assignment).
		await card.click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);

		const progress = page.getByTestId("navigator-progress");
		await expect(progress).toHaveText("Đã trả lời 0/2 câu");
		await page
			.locator('[data-question="0"] label', { hasText: "A" })
			.first()
			.click();
		await page
			.locator('[data-question="1"] label', { hasText: "B" })
			.first()
			.click();
		await expect(progress).toHaveText("Đã trả lời 2/2 câu");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		await page.getByRole("button", { name: "Nộp bài" }).click();
		// Summary: 2/2 đúng — điểm tự chấm hiển thị ngay sau khi nộp.
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("2");
		await expect(page.getByTestId("attempt-correct")).toHaveText("2");
	});

	test("bài luyện tập KHÔNG lọt bảng điểm lớp", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_ORIGIN}/classes/${fixture.classId}`);
		const body = page.locator("main");
		await body.getByTestId("class-tab-assignments").click();
		// Đề practice không bao giờ xuất hiện trong danh sách bài tập lớp;
		// lượt giao reading vẫn "Chưa nộp" (submit không stamp target).
		await expect(body).toContainText(classQuizTitle);
		await expect(body).not.toContainText(practiceTestTitle);
		const row = body.getByRole("link", {
			name: `Làm bài: ${classQuizTitle}`,
		});
		await expect(row.getByText("Chưa nộp")).toBeVisible();
	});

	test("skill chưa có đề ready → empty state", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_ORIGIN}/practice/writing`);
		await expect(
			page.getByText("Giáo viên chưa có đề luyện tập cho kỹ năng này"),
		).toBeVisible();
	});
});
