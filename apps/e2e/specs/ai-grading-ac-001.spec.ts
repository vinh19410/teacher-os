import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
	orgIdForTeacherEmail,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-30 #478 — E2E AC-001 (US-006): nền tảng chấm nháp AI ẩn với học viên
 * cho tới khi giáo viên "Chốt trả bài", trên apps thật (API boot shim +
 * web + student portal).
 *
 * Grader là fake (boot.ts inject `createFakeAiGrader` — điểm cố định
 * task 6.5 / coherence 7.0 / lexical 6.0 / grammar 6.5) nên pipeline chạy
 * thật: submit route → scheduleAiGrading (fire-and-forget trong Node) →
 * reserve → grade → settle → draft `ai_drafted`.
 *
 * Bốn bước của AC-001, chạy serial:
 *  1. Học viên nộp Writing thật (portal) → chỉ thấy "Đã nộp — Đang chờ
 *     giáo viên chấm", API học viên không có bất kỳ field draft nào.
 *  2. Giáo viên mở /grading/:id → panel "Gợi ý từ AI" 4 điểm + badge
 *     "AI đã chấm nháp"; ví org giảm đúng 1 Credit (reserve → settle).
 *  3. Giáo viên sửa điểm + "Lưu bản nháp" → badge "Đang rà soát"; học viên
 *     vẫn không thấy điểm.
 *  4. "Chốt trả bài" → học viên thấy điểm cuối cùng + band tổng.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `ai.grading.${runToken}@test.local`;
const writingTitle = "Writing AI chấm: city life";

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let attemptId = "";

/** Sign in portal student (fresh context mỗi lần — localStorage portal). */
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

/** Mở máy làm bài; bấm "Bắt đầu" khi gate dialog hiện (lần đầu). */
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

/** Set band qua native prototype setter (React 19 tracker — xem spec
 * teacher-grade-submission). */
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
		name: "Cô AI Chấm",
	});
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: `Lớp AI ${runToken}`,
		studentName: "Học Viên AI",
		studentEmail,
		prompts: [
			{
				title: writingTitle,
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt: "<p>Some people prefer to live in a big city.</p>",
				questions: [],
			},
		],
	});

	// Student thật: signup + verify qua mail-log (precedent grader spec).
	const signupContext = await browser.newContext();
	const page = await signupContext.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Học Viên AI");
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
	await signupContext.close();
});

test.afterAll(async () => {
	await teacherContext.close();
});

test("học viên nộp Writing → chỉ thấy Đã nộp — Đang chờ giáo viên chấm", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page);
	await openPaper(page, writingTitle);

	const textarea = page.getByLabel("Bài viết của bạn");
	await expect(textarea).toBeVisible();
	await textarea.fill(
		"Big cities offer more jobs and better services than rural areas.",
	);
	await page.getByRole("button", { name: "Nộp bài" }).click();
	const guard = page.getByRole("alertdialog", {
		name: "Bài viết chưa đủ số từ",
	});
	await expect(guard).toBeVisible();
	await guard.getByRole("button", { name: "Nộp bài" }).click();

	// Summary attempt: nhãn chờ chấm mới, KHÔNG điểm / nhận xét AI.
	await expect(page.getByTestId("awaiting-grade")).toHaveText(
		"Đã nộp — Đang chờ giáo viên chấm",
	);
	const detailUrl = new URL(page.url());
	attemptId = detailUrl.pathname.split("/").pop() ?? "";
	expect(attemptId).not.toBe("");

	// API học viên không chứa bất kỳ field/trạng thái draft nào (BR-001).
	const res = await page.request.get(
		`${API_ORIGIN}/api/student/attempts/${attemptId}/detail`,
	);
	expect(res.status()).toBe(200);
	const text = await res.text();
	for (const forbidden of [
		"aiScores",
		"aiFeedback",
		"aiDraft",
		"reviewedScores",
		"ai_processing",
		"ai_drafted",
		"teacher_reviewing",
		"manual_pending",
	]) {
		expect(text).not.toContain(forbidden);
	}
	await context.close();
});

test("giáo viên thấy Gợi ý từ AI + badge AI đã chấm nháp, ví giảm 1 Credit", async () => {
	test.setTimeout(60_000);
	await teacherPage.goto(`${WEB_ORIGIN}/grading/${attemptId}`);

	const panel = teacherPage.getByTestId("ai-draft-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByText("AI đã chấm nháp")).toBeVisible();
	// Fake grader: 6.5 / 7.0 / 6.0 / 6.5 — 6.5 có 2 ô.
	await expect(panel.getByText("6.5")).toHaveCount(2);
	await expect(panel.getByText("7.0")).toBeVisible();
	await expect(panel.getByText("6.0")).toBeVisible();

	// GradeForm điền sẵn từ điểm AI — nút chính là "Chốt trả bài".
	await expect(
		teacherPage.getByRole("button", { name: "Chốt trả bài" }),
	).toBeVisible();
	await expect(
		teacherPage.getByRole("button", { name: "Lưu bản nháp" }),
	).toBeVisible();

	// Ví org: 30 Credit dùng thử − 1 Writing = 29 (reserve → settle).
	const walletRes = await teacherPage.request.get(
		`${API_ORIGIN}/api/credits/wallet`,
	);
	expect(walletRes.status()).toBe(200);
	const wallet = (await walletRes.json()) as { balance: number };
	expect(wallet.balance).toBe(29);
});

test("Lưu bản nháp → badge Đang rà soát; học viên vẫn không thấy điểm", async ({
	browser,
}) => {
	test.setTimeout(60_000);
	await setBand(teacherPage, "Task Response", "6.5");
	await setBand(teacherPage, "Lexical Resource", "6.5");
	await teacherPage.getByRole("button", { name: "Lưu bản nháp" }).click();
	await expect(
		teacherPage.getByTestId("ai-draft-panel").getByText("Đang rà soát"),
	).toBeVisible();

	// Học viên xem lại bài: vẫn nhãn chờ chấm, không có điểm.
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page);
	await page.goto(`${STUDENT_ORIGIN}/learn/quizzes/attempt/${attemptId}`);
	await expect(page.getByTestId("awaiting-grade")).toBeVisible();
	const body = await page.locator("body").textContent();
	expect(body).not.toContain("Gợi ý từ AI");
	await context.close();
});

test("Chốt trả bài → học viên thấy điểm cuối cùng", async ({ browser }) => {
	test.setTimeout(60_000);
	// Điểm đã điền sẵn (nháp rà 6.5/7.0/6.5/6.5) — Chốt trả bài trực tiếp.
	await teacherPage.getByRole("button", { name: "Chốt trả bài" }).click();
	await expect(teacherPage.getByTestId("grade-saved")).toBeVisible();
	await expect(
		teacherPage.getByTestId("ai-draft-panel").getByText("Đã trả kết quả"),
	).toBeVisible();

	// Học viên reload: hiện band tổng + nhận xét, hết nhãn chờ chấm.
	// Điểm nháp rà (6.5/7.0/6.5/6.5) → trung bình 6.625 → band IELTS 6.5.
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page);
	await page.goto(`${STUDENT_ORIGIN}/learn/quizzes/attempt/${attemptId}`);
	await expect(page.getByTestId("awaiting-grade")).toHaveCount(0);
	await expect(page.getByText("6.5").first()).toBeVisible();
	await context.close();
});
