import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
	orgIdForTeacherEmail,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import {
	type QuizFixture,
	seedQuizFixture,
	seedSubmittedEssay,
} from "./helpers-quiz";
import { STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * #319 — Teacher grades a submitted Writing/Speaking attempt, end to end on
 * the real apps. Seeding is direct-DB (precedent helpers-quiz): the fixture
 * lives in the org bootstrapped by the teacher's real UI signup. The
 * student account is REAL auth (portal signup + mail-log verification, same
 * as student-quiz-take-review.spec).
 *
 * Teacher session and student session are both cookies on `localhost`
 * (different ports, same cookie jar) — separate contexts per role. Student
 * logins always use a FRESH context: the portal login page redirects when
 * a session exists and the last tab persists in localStorage, hiding the
 * sign-in form.
 *
 * Two flows:
 *  - Writing: seeded submitted essay → teacher opens /grading/<id> from the
 *    class Assignments tab → grades 4 criteria → student sees band +
 *    feedback on the attempt summary.
 *  - Speaking: real student submit (media upload) → teacher plays the
 *    audio, grades → student reloads and sees the result.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `grader.student.${runToken}@test.local`;
/** MP3 thật (1 giây im lặng) để thẻ <audio> load được metadata. */
const SPEAKING_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let fixture: QuizFixture;
let writingAttemptId = "";
const practiceWritingTitle = "Writing tự luyện: remote work";

async function seedPracticeWritingTest(orgId: string): Promise<string> {
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
			) VALUES (?,?, 'task2', 'essay', 'writing', 'task2', 'opinion', 'Task 2 Remote Work', '<p>Many employees now work from home.</p>', '[]', 'ready', ?)`,
		args: [promptId, orgId, now],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test (id, org_id, title, skill, time_limit_seconds, collection, test_group, status, created_at, updated_at)
			VALUES (?,?,?, 'writing', 2400, 'Cambridge 18', 'TEST 2', 'ready', ?, ?)`,
		args: [testId, orgId, practiceWritingTitle, now, now],
	});
	await db.execute({
		sql: `INSERT INTO assignment_test_part (id, test_id, prompt_id, part, position)
			VALUES (?,?,?, 'task2', 1)`,
		args: [crypto.randomUUID(), testId, promptId],
	});
	db.close();
	return testId;
}

/** Sign in through the portal login form (fresh context → sign-in tab). */
async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

/** Open the take screen for `title`; start the attempt if the gate dialog
 * shows (first entry), then wait for the paper. */
async function openPaper(page: Page, title: string): Promise<void> {
	await page.getByRole("link", { name: `Làm bài: ${title}` }).click();
	const paper = page.getByTestId("navigator-progress");
	const startDialog = page.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(paper.or(startDialog)).toBeVisible();
	if (await startDialog.isVisible()) {
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
	}
	await expect(paper).toBeVisible();
}

/** #331 — Set band trên input[type=range] qua native prototype setter rồi
 * dispatch `input`. Playwright `fill()` không dùng được: nó gán value bằng
 * JS thường, tracker của React 19 đồng bộ ngay trong instance setter nên
 * event `input` sau đó bị coi là "không đổi" và onChange không chạy. */
async function setBand(page: Page, label: string, band: string): Promise<void> {
	await page.getByLabel(label).evaluate((el, value) => {
		const input = el as HTMLInputElement;
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!setter) throw new Error("HTMLInputElement value setter unavailable");
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}, band);
}

test.beforeAll(async ({ browser }) => {
	test.setTimeout(120_000);
	teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN });
	teacherPage = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacherPage, {
		name: "Cô Chấm Bài",
	});

	// Org + membership only exist after the teacher's first /api request
	// bootstraps them — orgIdForTeacherEmail retries until then.
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	fixture = await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: `Lớp Chấm ${runToken}`,
		studentName: "Học Viên Chấm",
		studentEmail,
		prompts: [
			{
				title: "Writing chấm: city life",
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt: "<p>Some people prefer to live in a big city.</p>",
				questions: [],
			},
			{
				title: "Speaking chấm: a place",
				skill: "speaking",
				part: "part2",
				type: "place",
				cueTopic: "a place you like to visit",
				cuePoints: "where it is\nwhy you like it",
				note: "",
				passage: "",
				questions: [],
			},
		],
	});
	writingAttemptId = await seedSubmittedEssay({
		orgId,
		assignmentId: fixture.assignmentIds[0] ?? "",
		studentId: fixture.studentId,
		essay: "Living in a city has many benefits.\nFirst, jobs are plentiful.",
	});
	await seedPracticeWritingTest(orgId);

	// Real portal signup once (fresh context → signup tab), then close —
	// later student logins must open their own fresh context (signIn).
	const signupContext = await browser.newContext();
	const page = await signupContext.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Học Viên Chấm");
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
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
	await signupContext.close();
});

test.afterAll(async () => {
	await teacherContext.close();
});

test.describe("Teacher grades Writing/Speaking submissions", () => {
	test("teacher grades a submitted writing essay and the student sees band and feedback", async ({
		browser,
	}) => {
		await teacherPage.goto(
			`${WEB_ORIGIN}/classes/${fixture.classId}?tab=assignments`,
		);
		await expect(teacherPage.locator("#assigned-list")).toBeVisible();
		const row = teacherPage.locator("article.assign-item", {
			hasText: "Writing chấm: city life",
		});
		await row.getByRole("link", { name: "Chấm bài" }).click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${writingAttemptId}$`),
		);

		await expect(
			teacherPage.getByText("Some people prefer to live in a big city."),
		).toBeVisible();
		await expect(teacherPage.getByTestId("essay-text")).toContainText(
			"First, jobs are plentiful.",
		);
		await expect(teacherPage.getByTestId("essay-word-count")).toContainText(
			"· tối thiểu 250",
		);

		const save = teacherPage.getByRole("button", { name: "Lưu điểm" });
		await expect(save).toBeDisabled();

		// Bấm giữa track khi chưa chọn vẫn ghi 4.5 (#331); Lưu vẫn khoá.
		// aria-valuetext flip "Chưa chấm" → "4.5" mới chứng minh commit xảy
		// ra — toHaveValue không falsifiable vì placeholder cũng là 4.5.
		const taskSlider = teacherPage.getByLabel("Task Response");
		await taskSlider.click();
		await expect(taskSlider).toHaveValue("4.5");
		await expect(taskSlider).toHaveAttribute("aria-valuetext", "4.5");
		await expect(save).toBeDisabled();

		await setBand(teacherPage, "Task Response", "6");
		await setBand(teacherPage, "Coherence & Cohesion", "6.5");
		await setBand(teacherPage, "Lexical Resource", "6");
		await setBand(teacherPage, "Grammatical Range & Accuracy", "6.5");
		await expect(teacherPage.getByTestId("grade-overall-band")).toHaveText(
			"6.5",
		);
		await expect(save).toBeEnabled();

		await teacherPage
			.locator("#grade-feedback")
			.fill("Ý rõ ràng.\nCần thêm ví dụ cụ thể.");
		await save.click();
		await expect(teacherPage.getByTestId("grade-saved")).toBeVisible();

		await teacherPage.getByRole("link", { name: "← Về lớp" }).click();
		await expect(teacherPage).toHaveURL(/tab=assignments/);
		await expect(row).toContainText("Đã chấm · Band 6.5");

		// Student sees the grade on the attempt summary (fresh context).
		const sc = await browser.newContext();
		const sp = await sc.newPage();
		await signIn(sp);
		await sp.goto(
			`${STUDENT_ORIGIN}/learn/quizzes/attempt/${writingAttemptId}`,
		);
		await expect(
			sp.getByRole("heading", { name: "Kết quả chấm của giáo viên" }),
		).toBeVisible();
		await expect(sp.getByTestId("grade-band")).toHaveText("6.5");
		await expect(sp.getByTestId("grade-feedback")).toContainText(
			"Cần thêm ví dụ cụ thể.",
		);
		await expect(
			sp.getByText("Giáo viên sẽ chấm bài viết của bạn."),
		).toHaveCount(0);
		await sc.close();
	});

	test("teacher plays a submitted speaking file, grades it, and the student sees the result", async ({
		browser,
	}) => {
		// Student submits a real speaking attempt (media upload → submit).
		const sc = await browser.newContext();
		const sp = await sc.newPage();
		sp.on("dialog", (dialog) => void dialog.accept());
		await signIn(sp);
		await openPaper(sp, "Speaking chấm: a place");
		await sp.getByTestId("media-dropzone-input").setInputFiles({
			name: "bai-noi.mp3",
			mimeType: "audio/mpeg",
			buffer: SPEAKING_SAMPLE,
		});
		await expect(sp.getByTestId("speaking-media-name")).toHaveText(
			"bai-noi.mp3",
		);
		await sp.getByRole("button", { name: "Nộp bài" }).click();
		await expect(
			sp.getByRole("heading", { name: "Bài nói của bạn" }),
		).toBeVisible();
		// Summary là full-page navigation (window.location.assign) — đợi URL
		// sang /attempt/<id> trước khi parse, nếu không vẫn đọc được URL take
		// screen (/learn/quizzes/<assignmentId>) và nhận nhầm assignment id.
		await sp.waitForURL(/\/learn\/quizzes\/attempt\//, { timeout: 30_000 });
		const speakingAttemptId = new URL(sp.url()).pathname.split("/").pop() ?? "";

		// Teacher opens the grading page from the class assignments tab.
		await teacherPage.goto(
			`${WEB_ORIGIN}/classes/${fixture.classId}?tab=assignments`,
		);
		await expect(teacherPage.locator("#assigned-list")).toBeVisible();
		const row = teacherPage.locator("article.assign-item", {
			hasText: "Speaking chấm: a place",
		});
		await row.getByRole("link", { name: "Chấm bài" }).click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${speakingAttemptId}$`),
		);

		await expect(
			teacherPage.getByText("Describe a place you like to visit"),
		).toBeVisible();
		await teacherPage.getByRole("button", { name: "Nghe bài nói" }).click();
		await expect(teacherPage.locator('audio[src^="blob:"]')).toBeAttached();

		await setBand(teacherPage, "Fluency & Coherence", "7");
		await setBand(teacherPage, "Lexical Resource", "7");
		await setBand(teacherPage, "Grammatical Range & Accuracy", "7");
		await setBand(teacherPage, "Pronunciation", "7");
		// TOS-30: submit thật tạo draft `manual_pending` (chưa có STT) →
		// GradeForm ở draft mode, nút chính là "Chốt trả bài".
		await teacherPage.getByRole("button", { name: "Chốt trả bài" }).click();
		await expect(teacherPage.getByTestId("grade-saved")).toBeVisible();
		await expect(teacherPage.getByTestId("grade-overall-band")).toHaveText(
			"7.0",
		);

		// Student reload: full page load picks the fresh summary payload.
		await sp.reload();
		await expect(sp.getByTestId("grade-band")).toHaveText("7.0");
		await expect(sp.getByText("Pronunciation")).toBeVisible();
		await sc.close();
	});

	test("student submits practice writing → teacher grades from Luyện tập queue → student sees band in history (#383)", async ({
		browser,
	}) => {
		const sc = await browser.newContext();
		const sp = await sc.newPage();
		await signIn(sp);

		// 1) Học viên mở Luyện tập › Writing, bắt đầu đề tự luyện và nộp bài.
		await sp.goto(`${STUDENT_ORIGIN}/practice/writing`);
		const card = sp
			.getByTestId("practice-test-card")
			.filter({ hasText: practiceWritingTitle });
		await expect(card).toContainText("Cambridge 18");
		await card.click();
		await expect(sp).toHaveURL(/\/learn\/quizzes\/practice\//);

		const textarea = sp.getByLabel("Bài viết của bạn");
		await expect(textarea).toBeVisible();
		await textarea.fill(
			"Working from home offers flexibility and saves commuting time for workers.",
		);
		await expect(sp.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);
		await sp.getByRole("button", { name: "Nộp bài" }).click();
		const guard = sp.getByRole("alertdialog", {
			name: "Bài viết chưa đủ số từ",
		});
		await expect(guard).toBeVisible();
		await guard.getByRole("button", { name: "Nộp bài" }).click();
		await sp.waitForURL(/\/learn\/quizzes\/attempt\//, { timeout: 30_000 });
		const practiceAttemptId = new URL(sp.url()).pathname.split("/").pop() ?? "";

		// 2) Học viên vào Lịch sử thấy trạng thái thống nhất "Đã nộp — Đang
		// chờ giáo viên chấm" (TOS-30 #478; không còn "Đã nộp — tự luyện").
		await sp.goto(`${STUDENT_ORIGIN}/history`);
		const historyRow = sp
			.getByTestId("history-entry-row")
			.filter({ hasText: practiceWritingTitle });
		await expect(historyRow).toContainText("Đã nộp — Đang chờ giáo viên chấm");
		await expect(historyRow).not.toContainText("Đã nộp — tự luyện");

		// 3) Giáo viên bấm mục nav "Chấm bài" trong sidebar → lọc "Luyện tập" → bấm "Chấm bài".
		await teacherPage.goto(`${WEB_ORIGIN}/dashboard`);
		await teacherPage
			.getByRole("navigation", { name: "Điều hướng chính" })
			.getByRole("link", { name: "Chấm bài", exact: true })
			.click();
		await expect(teacherPage).toHaveURL(/\/grading(\?|$)/);

		await teacherPage
			.getByRole("group", { name: "Nguồn bài" })
			.getByRole("button", { name: "Luyện tập" })
			.click();
		await expect(teacherPage).toHaveURL(/mode=practice/);

		const queueRow = teacherPage
			.getByTestId("grading-queue-table")
			.getByRole("row")
			.filter({ hasText: practiceWritingTitle });
		await expect(queueRow).toContainText("Luyện tập");
		await expect(queueRow).toContainText("Chờ chấm");
		await queueRow
			.getByRole("link", { name: "Chấm bài của Học Viên Chấm" })
			.click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${practiceAttemptId}$`),
		);

		// 4) Giáo viên chấm 4 tiêu chí + nhận xét rồi quay lại hàng chờ chấm.
		await expect(
			teacherPage.getByRole("link", { name: "← Về hàng chờ chấm" }),
		).toBeVisible();
		await setBand(teacherPage, "Task Response", "7");
		await setBand(teacherPage, "Coherence & Cohesion", "7");
		await setBand(teacherPage, "Lexical Resource", "6.5");
		await setBand(teacherPage, "Grammatical Range & Accuracy", "6.5");
		await expect(teacherPage.getByTestId("grade-overall-band")).toHaveText(
			"7.0",
		);
		await teacherPage
			.locator("#grade-feedback")
			.fill("Bố cục mạch lạc, từ vựng tự nhiên.");
		// TOS-30: practice submit thật tạo draft `ai_drafted` (fake grader
		// boot.ts) → form điền sẵn điểm AI, nút chính là "Chốt trả bài".
		await teacherPage.getByRole("button", { name: "Chốt trả bài" }).click();
		await expect(teacherPage.getByTestId("grade-saved")).toBeVisible();

		await teacherPage.getByRole("link", { name: "← Về hàng chờ chấm" }).click();
		await expect(teacherPage).toHaveURL(/\/grading\?mode=practice/);
		await expect(queueRow).toContainText("Đã chấm · Band 7.0");

		// Kiểm chứng REVIEW.md: 3 viewport (1440×900, 768×1024, 375×812) + 320px × 2 theme (light/dark) không tràn ngang.
		const screenshotDir = new URL(
			"../../../plans/reports/screenshots-383-grading-queue",
			import.meta.url,
		).pathname;
		mkdirSync(screenshotDir, { recursive: true });
		const viewports: Array<[string, number, number]> = [
			["desktop", 1440, 900],
			["tablet", 768, 1024],
			["phone", 375, 812],
			["reflow-320", 320, 812],
		];
		for (const theme of ["light", "dark"] as const) {
			await teacherPage.evaluate((t) => {
				localStorage.setItem("theme", t);
				document.documentElement.classList.toggle("dark", t === "dark");
			}, theme);
			for (const [label, width, height] of viewports) {
				await teacherPage.setViewportSize({ width, height });
				const overflow = await teacherPage.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					overflow,
					`overflow at ${label} (${width}x${height}) ${theme}`,
				).toBe(false);
				if (label !== "reflow-320") {
					await teacherPage.screenshot({
						path: `${screenshotDir}/grading-queue-${label}-${theme}.png`,
						animations: "disabled",
					});
				}
			}
		}
		await teacherPage.evaluate(() => {
			localStorage.setItem("theme", "light");
			document.documentElement.classList.remove("dark");
		});
		await teacherPage.setViewportSize({ width: 1280, height: 720 });
		// 5) Học viên tải lại Lịch sử → thấy điểm Band 7.0 + trạng thái Đã chấm + Xem nhận xét.
		await sp.reload();
		await expect(historyRow).toContainText("Band 7.0");
		await expect(historyRow).toContainText("Đã chấm");
		await historyRow.getByRole("button", { name: "Xem nhận xét" }).click();
		const review = sp.getByTestId("writing-review");
		await expect(review).toBeVisible();
		await expect(review).toContainText("7.0");
		await expect(review).toContainText("Bố cục mạch lạc, từ vựng tự nhiên.");
		await sc.close();
	});
});
