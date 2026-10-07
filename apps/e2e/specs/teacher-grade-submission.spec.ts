import { readFileSync } from "node:fs";
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

/** Sign in through the portal login form (fresh context → sign-in tab). */
async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
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
		const taskSlider = teacherPage.getByLabel("Task Response");
		await taskSlider.click();
		await expect(taskSlider).toHaveValue("4.5");
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
		await teacherPage.getByRole("button", { name: "Lưu điểm" }).click();
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
});
