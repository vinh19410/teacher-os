import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

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
const listeningPracticeTitle = "Listening Practice Intro";
const classQuizTitle = "Quiz tuần 3 đọc hiểu";

let fixture: QuizFixture;
let readingPracticeTestId = "";
let listeningPracticeTestId = "";

async function countPracticeAttempts(testId: string): Promise<number> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const res = await db.execute({
			sql: `SELECT COUNT(*) AS n FROM quiz_attempt WHERE test_id = ? AND mode = 'practice'`,
			args: [testId],
		});
		return Number(res.rows[0]?.n ?? 0);
	} finally {
		db.close();
	}
}

async function seedPracticeTests(): Promise<{
	readingTestId: string;
	listeningTestId: string;
}> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	const now = Date.now();
	const readingTestId = crypto.randomUUID();
	const readingPromptId = crypto.randomUUID();
	const listeningTestId = crypto.randomUUID();
	const listeningPromptId = crypto.randomUUID();

	await db.execute({
		sql: `INSERT INTO assignment_prompt (
				id, org_id, task, genre, skill, part, type, title, prompt, questions, status, created_at
			) VALUES (?,?, 'task1', '', 'reading', 'p1', 'mcq', 'Passage 1', '', ?, 'ready', ?)`,
		args: [
			readingPromptId,
			fixture.orgId,
			JSON.stringify(PRACTICE_PROMPT_QUESTIONS),
			now,
		],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test (id, org_id, title, skill, time_limit_seconds, collection, test_group, status, created_at, updated_at)
			VALUES (?,?,?, 'reading', 1200, 'IELTS Trainer 2', 'TEST 1', 'ready', ?, ?)`,
		args: [readingTestId, fixture.orgId, practiceTestTitle, now, now],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position)
			VALUES (?,?,?, 'p1', 1)`,
		args: [crypto.randomUUID(), readingTestId, readingPromptId],
	});

	await db.execute({
		sql: `INSERT INTO assignment_prompt (
				id, org_id, task, genre, skill, part, type, title, prompt, audio_url, audio_name, questions, status, created_at
			) VALUES (?,?, 'task1', '', 'listening', 's1', 'mcq', 'Section 1', '', 'https://example.invalid/listening-sample.mp3', 'listening-sample.mp3', ?, 'ready', ?)`,
		args: [
			listeningPromptId,
			fixture.orgId,
			JSON.stringify(PRACTICE_PROMPT_QUESTIONS),
			now,
		],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test (id, org_id, title, description, skill, time_limit_seconds, collection, test_group, status, created_at, updated_at)
			VALUES (?,?,?,?, 'listening', 600, 'Cambridge 19', 'TEST 2', 'ready', ?, ?)`,
		args: [
			listeningTestId,
			fixture.orgId,
			listeningPracticeTitle,
			"<p>Nghe kỹ hội thoại và điền đáp án.</p>",
			now,
			now,
		],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position)
			VALUES (?,?,?, 's1', 1)`,
		args: [crypto.randomUUID(), listeningTestId, listeningPromptId],
	});

	db.close();
	return { readingTestId, listeningTestId };
}

async function signIn(page: Page): Promise<void> {
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
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
	const seeded = await seedPracticeTests();
	readingPracticeTestId = seeded.readingTestId;
	listeningPracticeTestId = seeded.listeningTestId;

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(studentName);
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
	await context.close();
});

test.describe("Student practice catalog (#378 phase 10, #883)", () => {
	test("Luyện tập › Reading: mở màn giới thiệu → quay lại không tạo attempt → bắt đầu → nộp → thấy điểm", async ({
		page,
	}) => {
		await signIn(page);

		let postAttemptCount = 0;
		page.on("request", (req) => {
			if (
				req.method() === "POST" &&
				/\/api\/student\/practice\/[^/]+\/attempts$/.test(req.url())
			) {
				postAttemptCount += 1;
			}
		});

		// Nav "Luyện tập" đã bật (phase 10); "Lịch sử" đã bật theo phase 11.
		const nav = page.getByRole("navigation");
		await expect(nav.getByText("Luyện tập")).toBeVisible();
		await expect(nav.getByText("Lịch sử")).toBeVisible();

		// Mục cha dẫn về /practice → redirect skill đầu (/practice/reading).
		await page.goto(`${STUDENT_BASE_URL}/practice`);
		// Redirect giữ query (?page=1) — khớp path, không neo cuối.
		await expect(page).toHaveURL(/\/practice\/reading(\?|$)/);
		await expect(page.getByTestId("student-practice-page")).toBeVisible();

		// Card đề seed hiện kèm collection; bấm thẻ mở màn giới thiệu inline (#883),
		// KHÔNG gọi POST /attempts và KHÔNG tạo quiz_attempt trước khi bấm Bắt đầu.
		const card = page
			.getByTestId("practice-test-card")
			.filter({ hasText: practiceTestTitle });
		await expect(card).toContainText("IELTS Trainer 2");

		await card.click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);

		const intro = page.getByTestId("practice-intro-screen");
		await expect(intro).toBeVisible();
		await expect(intro).toContainText(practiceTestTitle);
		await expect(intro).toContainText("2 câu hỏi");
		await expect(intro).toContainText("1 phần");
		await expect(intro).toContainText("20 phút");
		await expect(intro).toContainText("IELTS Trainer 2 · TEST 1");
		await expect(intro).toContainText("Hướng dẫn chung");
		await expect(page.getByTestId("navigator-progress")).toHaveCount(0);
		expect(postAttemptCount).toBe(0);
		expect(await countPracticeAttempts(readingPracticeTestId)).toBe(0);

		// Keyboard Enter trên "Quay lại danh sách" quay về /practice/reading, vẫn 0 attempt.
		const backBtn = page.getByRole("button", { name: "Quay lại danh sách" });
		await backBtn.focus();
		await expect(backBtn).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/practice\/reading(\?|$)/);
		expect(postAttemptCount).toBe(0);
		expect(await countPracticeAttempts(readingPracticeTestId)).toBe(0);

		// Mở lại thẻ → kiểm tra reflow 3 viewport + 320px không tràn ngang.
		await card.click();
		await expect(intro).toBeVisible();
		for (const vp of [
			{ width: 1440, height: 900 },
			{ width: 768, height: 1024 },
			{ width: 375, height: 812 },
			{ width: 320, height: 812 },
		]) {
			await page.setViewportSize(vp);
			const hasOverflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(
				hasOverflow,
				`practice intro overflow at ${vp.width}x${vp.height}`,
			).toBe(false);
		}
		await page.setViewportSize({ width: 1280, height: 720 });

		// Kích hoạt "Bắt đầu làm bài" bằng phím Enter → đúng 1 POST /attempts → vào đề thi.
		const startBtn = page.getByTestId("practice-start-btn");
		await startBtn.focus();
		await expect(startBtn).toBeFocused();
		await page.keyboard.press("Enter");

		const progress = page.getByTestId("navigator-progress");
		await expect(progress).toHaveText("Đã trả lời 0/2 câu");
		expect(postAttemptCount).toBe(1);
		expect(await countPracticeAttempts(readingPracticeTestId)).toBe(1);

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

	test("Luyện tập › Listening: mở màn giới thiệu hiển thị thời lượng, mô tả rich-text, chỉ báo file nghe và không tạo attempt/stream audio trước khi bắt đầu (#883)", async ({
		page,
	}) => {
		await signIn(page);

		let postAttemptCount = 0;
		let audioRequestCount = 0;
		page.on("request", (req) => {
			if (
				req.method() === "POST" &&
				/\/api\/student\/practice\/[^/]+\/attempts$/.test(req.url())
			) {
				postAttemptCount += 1;
			}
			if (
				req.method() === "GET" &&
				/\/api\/student\/practice\/[^/]+\/audio(\?|$)/.test(req.url())
			) {
				audioRequestCount += 1;
			}
		});

		await page.goto(`${STUDENT_BASE_URL}/practice/listening`);
		const card = page
			.getByTestId("practice-test-card")
			.filter({ hasText: listeningPracticeTitle });
		await expect(card).toContainText("Cambridge 19");
		await card.click();

		await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);
		const intro = page.getByTestId("practice-intro-screen");
		await expect(intro).toBeVisible();
		await expect(intro).toContainText("10 phút");
		await expect(intro).toContainText("Có file nghe");
		await expect(intro).toContainText("Cambridge 19 · TEST 2");
		await expect(intro).toContainText("Hướng dẫn chung");

		const desc = page.getByTestId("practice-intro-description");
		await expect(desc).toContainText("Nghe kỹ hội thoại và điền đáp án.");
		await expect(desc).not.toContainText("<p>");

		expect(postAttemptCount).toBe(0);
		expect(audioRequestCount).toBe(0);
		expect(await countPracticeAttempts(listeningPracticeTestId)).toBe(0);
	});

	test("bài luyện tập KHÔNG lọt bảng điểm lớp", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_BASE_URL}/classes/${fixture.classId}`);
		const body = page.locator("main");
		await body.getByTestId("class-tab-assignments").click();
		// Đề practice không bao giờ xuất hiện trong danh sách bài tập lớp;
		// lượt giao reading vẫn "Chưa nộp" (submit không stamp target).
		await expect(body).toContainText(classQuizTitle);
		await expect(body).not.toContainText(practiceTestTitle);
		const row = body.getByRole("row").filter({
			has: page.getByRole("link", {
				name: `Làm bài: ${classQuizTitle}`,
			}),
		});
		await expect(
			row.getByRole("link", { name: `Làm bài: ${classQuizTitle}` }),
		).toBeVisible();
		await expect(row.getByText("Chưa nộp")).toBeVisible();
	});

	test("skill chưa có đề ready → empty state", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_BASE_URL}/practice/writing`);
		await expect(
			page.getByText("Giáo viên chưa có đề luyện tập cho kỹ năng này"),
		).toBeVisible();
	});

	test("Luyện tập › Vocabulary mở hub từ vựng đầy đủ (keyboard focus, 3 viewports) và redirect từ /vocab (#387)", async ({
		page,
	}) => {
		await signIn(page);
		// Keyboard navigation: từ trang Tổng quan (/), focus button "Luyện tập" → Enter mở nhóm → Tab tới "Vocabulary" → Enter
		await page.goto(`${STUDENT_BASE_URL}/`);
		const nav = page.getByRole("navigation", { name: "Điều hướng học viên" });
		const practiceBtn = nav.getByRole("button", { name: "Luyện tập" });
		await practiceBtn.focus();
		await expect(practiceBtn).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(practiceBtn).toHaveAttribute("aria-expanded", "true");

		// Tab qua 5 mục con tới Vocabulary (Reading -> Listening -> Writing -> Speaking -> Vocabulary)
		for (let i = 0; i < 5; i += 1) {
			await page.keyboard.press("Tab");
		}
		const vocabNavLink = nav.getByRole("link", { name: "Vocabulary" });
		await expect(vocabNavLink).toBeFocused();
		await page.keyboard.press("Enter");

		await expect(page).toHaveURL(/\/practice\/vocabulary$/);
		await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
		await expect(page.getByTestId("practice-vocab-deck")).toHaveCount(0);

		// Verify 3 viewports (1440×900, 768×1024, 375×812)
		for (const vp of [
			{ width: 1440, height: 900 },
			{ width: 768, height: 1024 },
			{ width: 375, height: 812 },
		]) {
			await page.setViewportSize(vp);
			const hasOverflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(
				hasOverflow,
				`student /practice/vocabulary overflow at ${vp.width}x${vp.height}`,
			).toBe(false);
		}
		await page.setViewportSize({ width: 1280, height: 720 });

		// Redirect legacy /vocab → /practice/vocabulary
		await page.goto(`${STUDENT_BASE_URL}/vocab`);
		await expect(page).toHaveURL(/\/practice\/vocabulary$/);
		await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
	});
});
