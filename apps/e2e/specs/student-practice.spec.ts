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
const PRACTICE_READING_PASSAGE = [
	"<p><strong>The Falkirk Wheel</strong> is a rotating boat lift in central Scotland, connecting the Forth and Clyde Canal with the Union Canal. Opened in 2002, it replaced a series of eleven locks that previously took almost a full day to navigate.</p>",
	"<p>The structure uses Archimedes' principle: because a floating object displaces its own weight in water, both water-filled gondolas always weigh the same regardless of how many boats enter. As a result, rotating the wheel through 180 degrees requires remarkably little electrical energy.</p>",
	"<p>Engineers designed the central axle and hydraulic motors to operate smoothly across seasonal temperature shifts, turning an industrial transport link into an iconic landmark visited by hundreds of thousands of people every year.</p>",
].join("");
const practiceTestTitle = "The Falkirk Wheel";
const listeningPracticeTitle = "Listening Practice Intro";
const classQuizTitle = "Quiz tuần 3 đọc hiểu";

let fixture: QuizFixture;
let readingPracticeTestId = "";
let listeningPracticeTestId = "";

function parseClockSeconds(text: string): number {
	const match = text.trim().match(/^(\d+):(\d{2})$/);
	if (!match) return Number.NaN;
	return Number(match[1]) * 60 + Number(match[2]);
}

async function backdateActivePracticeAttempt(
	testId: string,
	deltaMs: number,
): Promise<void> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	await db.execute({
		sql: `UPDATE quiz_attempt
			SET started_at = started_at - ?
			WHERE org_id = ?
				AND test_id = ?
				AND mode = 'practice'
				AND status = 'in_progress'`,
		args: [deltaMs, fixture.orgId, testId],
	});
	db.close();
}

async function clearActivePracticeAttempts(testId: string): Promise<void> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	await db.execute({
		sql: `DELETE FROM quiz_attempt
			WHERE org_id = ?
				AND test_id = ?
				AND mode = 'practice'
				AND status = 'in_progress'`,
		args: [fixture.orgId, testId],
	});
	db.close();
}

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
				id, org_id, task, genre, skill, part, type, title, prompt, passage, questions, status, created_at
			) VALUES (?,?, 'task1', '', 'reading', 'p1', 'mcq', 'Passage 1', '', ?, ?, 'ready', ?)`,
		args: [
			readingPromptId,
			fixture.orgId,
			PRACTICE_READING_PASSAGE,
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

test.describe("Student practice catalog (#378 phase 10, #880, #883)", () => {
	test.beforeEach(async () => {
		// Dọn lượt in_progress còn sót (ví dụ sau khi test fail giữa chừng trước
		// bước nộp và CI retry) để mỗi test/retry luôn bắt đầu ở trạng thái sạch.
		if (readingPracticeTestId) {
			await clearActivePracticeAttempts(readingPracticeTestId);
		}
		if (listeningPracticeTestId) {
			await clearActivePracticeAttempts(listeningPracticeTestId);
		}
	});

	test("Luyện tập › Reading: mở màn giới thiệu → quay lại không tạo attempt → bắt đầu → đếm ngược qua reload → nộp → thấy điểm", async ({
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
		await expect(page.getByTestId("quiz-timer-badge")).toHaveCount(0);
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

		// Reading có passage → split-pane + đồng hồ đếm ngược 20 phút trên header.
		await expect(page.getByTestId("reading-passage-pane")).toBeVisible();
		await expect(page.getByTestId("reading-work-pane")).toBeVisible();
		const timerBadge = page.getByTestId("quiz-timer-badge");
		await expect(timerBadge).toBeVisible();
		await expect(timerBadge).toHaveAttribute("data-state", "running");
		const initialSec = parseClockSeconds(await timerBadge.innerText());
		expect(initialSec).toBeGreaterThanOrEqual(1140);
		expect(initialSec).toBeLessThanOrEqual(1200);

		const progress = page.getByTestId("navigator-progress");
		await expect(progress).toHaveText("Đã trả lời 0/2 câu");
		expect(postAttemptCount).toBe(1);
		expect(await countPracticeAttempts(readingPracticeTestId)).toBe(1);

		await page
			.locator('[data-question="0"] label', { hasText: "A" })
			.first()
			.click();
		await expect(progress).toHaveText("Đã trả lời 1/2 câu");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		// Lùi started_at đi 3 phút rồi tải lại trang: đồng hồ phải tiếp tục từ
		// ~17:00 ngay khi dialog tiếp tục hiện ra và tổng thời gian lúc nộp phải
		// tính cả 3 phút trước khi tải lại.
		await backdateActivePracticeAttempt(readingPracticeTestId, 180_000);
		await page.reload();

		const resumeDialog = page.getByRole("alertdialog", {
			name: "Tiếp tục bài làm",
		});
		await expect(resumeDialog).toBeVisible();
		await expect(resumeDialog.getByTestId("quiz-dialog-helper")).toHaveText(
			'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".',
		);
		const submitBtn = page.getByRole("button", { name: "Nộp bài" });
		await expect(submitBtn).toBeDisabled();
		const describedBy = await submitBtn.getAttribute("aria-describedby");
		expect(describedBy).toBeTruthy();
		const describedText = await page.evaluate(
			(ids) =>
				ids
					.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
					.filter(Boolean)
					.join(" "),
			(describedBy ?? "").trim().split(/\s+/).filter(Boolean),
		);
		expect(describedText).toBe(
			'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.',
		);
		const dialogOverflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(dialogOverflow).toBe(false);
		await expect(timerBadge).toBeVisible();
		const resumedSec = parseClockSeconds(await timerBadge.innerText());
		expect(resumedSec).toBeGreaterThanOrEqual(900);
		expect(resumedSec).toBeLessThanOrEqual(1020);
		expect(initialSec - resumedSec).toBeGreaterThanOrEqual(170);

		await page.getByRole("button", { name: "Tiếp tục" }).click();
		await expect(resumeDialog).toBeHidden();
		await expect(submitBtn).toBeEnabled();
		await expect(submitBtn).not.toHaveAttribute("aria-describedby");
		await page
			.locator('[data-question="1"] label', { hasText: "B" })
			.first()
			.click();
		await expect(progress).toHaveText("Đã trả lời 2/2 câu");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		// Kiểm tra không tràn ngang trên 4 viewport (gồm 320px reflow) cả Light & Dark,
		// và desktop 1440×900 split-pane giữ document scrollTop === 0.
		for (const dark of [false, true]) {
			await page.evaluate((isDark) => {
				document.documentElement.classList.toggle("dark", isDark);
			}, dark);
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 768, height: 1024 },
				{ width: 375, height: 812 },
				{ width: 320, height: 568 },
			]) {
				await page.setViewportSize(vp);
				const metrics = await page.evaluate(() => ({
					overflowX:
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
					docScrollTop: document.scrollingElement?.scrollTop ?? 0,
				}));
				expect(
					metrics.overflowX,
					`practice take overflow at ${vp.width}x${vp.height} dark=${dark}`,
				).toBe(false);
				if (vp.width === 1440) {
					expect(metrics.docScrollTop).toBe(0);
				}
			}
		}
		await page.evaluate(() => {
			document.documentElement.classList.remove("dark");
		});
		await page.setViewportSize({ width: 1280, height: 720 });

		await page.getByRole("button", { name: "Nộp bài" }).click();
		// Summary: 2/2 đúng và tổng thời gian tính đủ cả trước + sau khi tải lại.
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("2");
		await expect(page.getByTestId("attempt-correct")).toHaveText("2");
		await expect(page.locator("main")).toContainText(
			/hoàn thành trong [3-5] phút/,
		);
	});

	test("Luyện tập › Reading: hết giờ mềm hiện 00:00 + banner cảnh báo, split-pane không tràn dọc và vẫn nộp được bài", async ({
		page,
	}) => {
		await signIn(page);
		await page.goto(`${STUDENT_BASE_URL}/practice/reading`);
		const card = page
			.getByTestId("practice-test-card")
			.filter({ hasText: practiceTestTitle });
		await card.click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/practice\//);
		await page.getByTestId("practice-start-btn").click();

		const timerBadge = page.getByTestId("quiz-timer-badge");
		await expect(timerBadge).toBeVisible();
		await page
			.locator('[data-question="0"] label', { hasText: "A" })
			.first()
			.click();
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		// Lùi started_at vượt quá 20 phút (21 phút) rồi tải lại trang.
		await backdateActivePracticeAttempt(readingPracticeTestId, 1_260_000);
		await page.reload();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		await expect(timerBadge).toHaveAttribute("data-state", "expired");
		await expect(timerBadge).toHaveText("00:00");
		await expect(page.getByTestId("quiz-time-expired-banner")).toBeVisible();

		// Desktop split-pane phải giữ nguyên chiều cao 100svh kể cả khi có banner hết giờ.
		await page.setViewportSize({ width: 1440, height: 900 });
		const splitMetrics = await page.evaluate(() => ({
			docOverflowY:
				document.documentElement.scrollHeight -
				document.documentElement.clientHeight,
			docScrollTop: document.scrollingElement?.scrollTop ?? 0,
		}));
		expect(splitMetrics.docOverflowY).toBeLessThanOrEqual(1);
		expect(splitMetrics.docScrollTop).toBe(0);

		// Hết giờ mềm KHÔNG tự nộp và KHÔNG khoá nút Nộp bài.
		const submitBtn = page.getByRole("button", { name: "Nộp bài" });
		await expect(submitBtn).toBeEnabled();
		await submitBtn.click();
		// Câu 2 chưa làm → mở dialog xác nhận nộp bài.
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: "Nộp bài" }).click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("1");
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
		await expect(page.getByTestId("quiz-timer-badge")).toHaveCount(0);
		expect(await countPracticeAttempts(listeningPracticeTestId)).toBe(0);
	});

	test("bài luyện tập KHÔNG lọt bảng điểm lớp", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_BASE_URL}/classes/${fixture.classId}`);
		const body = page.locator("main");
		// Bài tập giao tay không thuộc bộ đề tự học hiện ở TodoBanner và /assignments,
		// không lọt đề practice; RingStat giữ tổng bài của lớp.
		await expect(body).toContainText("Bạn còn 1 bài chưa làm");
		await expect(body).toContainText("0/1");
		await expect(body).not.toContainText(practiceTestTitle);

		await body.getByTestId("class-tab-assignments").click();
		await expect(body.getByText("Chưa có bộ đề tự học")).toBeVisible();
		await body.getByRole("link", { name: "Xem tất cả bài tập" }).click();
		await expect(page).toHaveURL(`${STUDENT_BASE_URL}/assignments`);

		// Đề practice không bao giờ xuất hiện trong danh sách bài tập;
		// lượt giao reading vẫn "Chưa nộp" (submit không stamp target).
		await expect(body).toContainText(classQuizTitle);
		await expect(body).not.toContainText(practiceTestTitle);
		const row = body.getByRole("listitem").filter({
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

test.describe("Student practice catalog filters & facets (#884)", () => {
	let facetsFixture: QuizFixture;
	let facetsEmail = "";

	test.beforeAll(async ({ browser }) => {
		const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		facetsEmail = `practice.facets.${token}@test.local`;
		facetsFixture = await seedQuizFixture({
			orgName: `Practice Facets E2E ${token}`,
			className: "IELTS Facets E2E",
			studentName: "Minh Anh Facets",
			studentEmail: facetsEmail,
			prompts: [],
		});

		const db = createClient({
			url: `file:${new URL("../local.db", import.meta.url).pathname}`,
		});
		await db.execute("PRAGMA busy_timeout = 5000;");
		const now = Date.now();

		const multiGroupGroups = JSON.stringify([
			{
				id: "g1",
				type: "tfng",
				instruction: "<p>True / False / Not Given</p>",
				startIndex: 0,
				count: 1,
				optionBank: [],
				answersInline: false,
				splitContent: false,
				dragDrop: false,
			},
			{
				id: "g2",
				type: "fill_blank",
				instruction: "<p>Fill in the blank</p>",
				startIndex: 1,
				count: 1,
				optionBank: [],
				answersInline: false,
				splitContent: false,
				dragDrop: false,
			},
		]);

		const specs = [
			...Array.from({ length: 11 }, (_, idx) => ({
				title: `Actual Reading Passage ${idx + 1}`,
				collection: "Actual Test",
				part: "p1",
				type: "tfng",
				groups: "[]",
			})),
			{
				title: "Actual Multi-Group Passage 2",
				collection: "Actual Test",
				part: "p2",
				type: "tfng",
				groups: multiGroupGroups,
			},
			{
				title: "Cambridge 18 Summary Passage 2",
				collection: "Cambridge IELTS 18",
				part: "p2",
				type: "summary",
				groups: "[]",
			},
			{
				title: "Forecast Passage 3 YNNG",
				collection: "Forecast Quý 2-2025",
				part: "p3",
				type: "ynng",
				groups: "[]",
			},
			{
				title: "Other Sources Passage 1 MCQ",
				collection: "Other sources",
				part: "p1",
				type: "mcq",
				groups: "[]",
			},
		];

		for (const [idx, spec] of specs.entries()) {
			const promptId = crypto.randomUUID();
			const testId = crypto.randomUUID();
			const createdAt = now - idx * 1000;
			await db.execute({
				sql: `INSERT INTO assignment_prompt (
						id, org_id, task, genre, skill, part, type, band, title, prompt, passage, questions, groups, status, created_at
					) VALUES (?,?, 'task1', '', 'reading', ?, ?, '7.0', ?, '', ?, ?, ?, 'ready', ?)`,
				args: [
					promptId,
					facetsFixture.orgId,
					spec.part,
					spec.type,
					spec.title,
					PRACTICE_READING_PASSAGE,
					JSON.stringify(PRACTICE_PROMPT_QUESTIONS),
					spec.groups,
					createdAt,
				],
			});
			await db.execute({
				sql: `INSERT INTO assignment_test (id, org_id, title, skill, time_limit_seconds, collection, test_group, status, created_at, updated_at)
					VALUES (?,?,?, 'reading', 1200, ?, NULL, 'ready', ?, ?)`,
				args: [
					testId,
					facetsFixture.orgId,
					spec.title,
					spec.collection,
					createdAt,
					createdAt,
				],
			});
			await db.execute({
				sql: `INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position)
					VALUES (?,?,?,?, 0)`,
				args: [crypto.randomUUID(), testId, promptId, spec.part],
			});
		}
		db.close();

		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${LMS_ORIGIN}/login`);
		await page.locator("#tab-signup").click();
		await page.locator("#signup-name").fill("Minh Anh Facets");
		await page.locator("#signup-email").fill(facetsEmail);
		await page.locator("#signup-password").fill(PASSWORD);
		await page.locator("#panel-signup button[type='submit']").click();
		await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
			timeout: 15_000,
		});
		await verifyStudentEmailFromMailLog(page, facetsEmail);
		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
			timeout: 30_000,
		});
		await context.close();
	});

	test("bộ lọc Bộ đề giữ đủ nguồn toàn catalog qua các trang, lọc Phần thi + Dạng bài nhóm phụ, reload giữ URL, Xóa bộ lọc sạch và không tràn 4 viewport Light/Dark", async ({
		page,
	}) => {
		await page.goto(`${LMS_ORIGIN}/login`);
		await page.locator("#tab-signin").click();
		await page.locator("#signin-email").fill(facetsEmail);
		await page.locator("#signin-password").fill(PASSWORD);
		await page.locator("#panel-signin button[type='submit']").click();
		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
			timeout: 30_000,
		});

		await page.goto(`${STUDENT_BASE_URL}/practice/reading`);
		await expect(page.getByText("15 đề — trang 1 / 2")).toBeVisible();

		const expectedCollections = [
			"",
			"Actual Test",
			"Cambridge IELTS 18",
			"Forecast Quý 2-2025",
			"Other sources",
		];
		const collectionSelect = page.getByLabel("Bộ đề");
		const partSelect = page.getByLabel("Phần thi");
		const typeSelect = page.getByLabel("Dạng bài");

		// Trang 1 chỉ gồm 12 đề "Actual Test" nhưng dropdown Bộ đề vẫn liệt kê đủ cả 4 nguồn.
		expect(
			await collectionSelect
				.locator("option")
				.evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value)),
		).toEqual(expectedCollections);
		// Cả 15 đề đều mặc định band 7.0 -> không hiện dropdown Band chết 1 lựa chọn.
		await expect(page.getByLabel("Band")).toHaveCount(0);

		// Sang trang 2: dropdown Bộ đề giữ nguyên toàn bộ 4 nguồn.
		await page.getByRole("button", { name: "Sau" }).click();
		await expect(page).toHaveURL(/page=2/);
		await expect(page.getByText("15 đề — trang 2 / 2")).toBeVisible();
		expect(
			await collectionSelect
				.locator("option")
				.evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value)),
		).toEqual(expectedCollections);

		// Lọc kết hợp Bộ đề + Phần thi (Passage 2) + Dạng bài nhóm phụ (Fill in the blank).
		await collectionSelect.selectOption("Actual Test");
		await expect(page).toHaveURL(/collection=Actual/);
		await partSelect.selectOption("p2");
		await expect(page).toHaveURL(/part=p2/);
		await typeSelect.selectOption("fill_blank");
		await expect(page).toHaveURL(/type=fill_blank/);
		await expect(page.getByText("1 đề — trang 1 / 1")).toBeVisible();
		await expect(page.getByTestId("practice-test-card")).toHaveCount(1);
		await expect(page.getByTestId("practice-test-card")).toContainText(
			"Actual Multi-Group Passage 2",
		);

		// Reload giữ nguyên filter và kết quả.
		await page.reload();
		await expect(collectionSelect).toHaveValue("Actual Test");
		await expect(partSelect).toHaveValue("p2");
		await expect(typeSelect).toHaveValue("fill_blank");
		await expect(page.getByTestId("practice-test-card")).toHaveCount(1);

		// Kiểm tra keyboard Tab focus đi qua các filter control.
		await collectionSelect.focus();
		await expect(collectionSelect).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(partSelect).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(typeSelect).toBeFocused();

		// Tổ hợp không khớp -> empty state phân biệt + Xóa bộ lọc làm sạch URL & danh sách.
		await partSelect.selectOption("p3");
		await expect(
			page.getByText("Không tìm thấy đề phù hợp với bộ lọc hiện tại."),
		).toBeVisible();
		await page.getByRole("button", { name: "Xóa bộ lọc" }).first().click();
		await expect(page).toHaveURL(
			new RegExp(`^${STUDENT_BASE_URL}/practice/reading$`),
		);
		await expect(page.getByText("15 đề — trang 1 / 2")).toBeVisible();

		// 4 viewport (gồm 320px reflow) cả Light & Dark không tràn ngang.
		for (const dark of [false, true]) {
			await page.evaluate((isDark) => {
				document.documentElement.classList.toggle("dark", isDark);
			}, dark);
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 768, height: 1024 },
				{ width: 375, height: 812 },
				{ width: 320, height: 568 },
			]) {
				await page.setViewportSize(vp);
				const hasOverflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					hasOverflow,
					`practice catalog filters overflow at ${vp.width}x${vp.height} dark=${dark}`,
				).toBe(false);
			}
		}
		await page.evaluate(() => {
			document.documentElement.classList.remove("dark");
		});
		await page.setViewportSize({ width: 1280, height: 720 });
	});
});
