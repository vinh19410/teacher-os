import {
	type Browser,
	type BrowserContext,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	orgIdForTeacherEmail,
	seedOrgMember,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-33 #481 — E2E AC-004 (US-006):
 *  1. Trợ giảng (TA) mở bài `ai_drafted` trên [7], sửa điểm + nhận xét →
 *     bấm được "Lưu bản nháp" (badge "Đang rà soát"), nút "Chốt trả bài"
 *     bị khóa (disabled + API 403 GRADE_PUBLISH_FORBIDDEN).
 *  2. Học viên nộp bài chứa `ai-fail` → AI lỗi đủ 2 lần tự thử lại →
 *     hoàn 100% Credit tạm giữ (số dư ví không giảm thêm), màn [7] hiện
 *     badge "Chờ chấm tay" + thông điệp E-selfomy-alignment-004 + nút
 *     "Thử chấm lại AI".
 *  3. Hai context trình duyệt (TA + GV) cùng mở 1 bài; TA lưu trước
 *     (tăng version), GV lưu sau trên màn cũ → chặn 409 với hộp thoại
 *     E-selfomy-alignment-011; bấm "Tải lại bản mới nhất" thấy bản của TA
 *     và giữ nội dung đang gõ ở vùng "Bản bạn đang sửa".
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `ai.ac004.${runToken}@test.local`;
const normalWritingTitle = "Writing AC-004: urban transport";
const failWritingTitle = "Writing AC-004: remote work";

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let taContext: BrowserContext;
let taPage: Page;
let teacherEmail = "";
let normalAttemptId = "";
let failAttemptId = "";

async function signInStudent(page: Page): Promise<void> {
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

async function submitWritingPaper(
	browser: Browser,
	title: string,
	essayText: string,
): Promise<string> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signInStudent(page);
	await openPaper(page, title);

	const textarea = page.getByLabel("Bài viết của bạn");
	await expect(textarea).toBeVisible();
	await textarea.fill(essayText);
	await page.getByRole("button", { name: "Nộp bài" }).click();
	const guard = page.getByRole("alertdialog", {
		name: "Bài viết chưa đủ số từ",
	});
	await expect(guard).toBeVisible();
	await guard.getByRole("button", { name: "Nộp bài" }).click();
	await expect(page.getByTestId("awaiting-grade")).toHaveText(
		"Đã nộp — Đang chờ giáo viên chấm",
	);
	const detailUrl = new URL(page.url());
	const id = detailUrl.pathname.split("/").pop() ?? "";
	expect(id).not.toBe("");
	await context.close();
	return id;
}

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
	teacherEmail = await signUpViaUi(teacherPage, {
		name: "Cô Giáo AC004",
	});
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	taContext = await browser.newContext({ baseURL: WEB_ORIGIN });
	taPage = await taContext.newPage();
	await seedOrgMember(taPage, {
		teacherEmail,
		role: "ta",
		name: "Trợ Giảng AC004",
	});

	await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: `Lớp AC004 ${runToken}`,
		studentName: "Học Viên AC004",
		studentEmail,
		prompts: [
			{
				title: normalWritingTitle,
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt: "<p>Public transport should be free in large cities.</p>",
				questions: [],
			},
			{
				title: failWritingTitle,
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt: "<p>Remote work is changing modern offices.</p>",
				questions: [],
			},
		],
	});

	const signupContext = await browser.newContext();
	const page = await signupContext.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Học Viên AC004");
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
	await taContext?.close();
	await teacherContext?.close();
});

test("Scenario 1: Trợ giảng (TA) mở bài ai_drafted, sửa điểm + Lưu bản nháp → Đang rà soát; nút Chốt trả bài bị khóa và API trả 403", async ({
	browser,
}) => {
	test.setTimeout(60_000);
	normalAttemptId = await submitWritingPaper(
		browser,
		normalWritingTitle,
		"Public transport reduces traffic congestion and lowers carbon emissions in cities.",
	);

	await taPage.goto(`${WEB_ORIGIN}/grading/${normalAttemptId}`);
	const panel = taPage.getByTestId("ai-draft-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByText("AI đã chấm nháp")).toBeVisible();

	const publishBtn = taPage.getByTestId("publish-grade");
	const saveDraftBtn = taPage.getByTestId("save-draft");
	await expect(publishBtn).toBeDisabled();
	await expect(publishBtn).toHaveAttribute(
		"title",
		"Chỉ Giáo viên đứng lớp được chốt trả bài",
	);
	await expect(saveDraftBtn).toBeEnabled();

	await setBand(taPage, "Task Response", "7");
	await taPage.locator("#grade-feedback").fill("TA đã rà soát lần 1.");
	await saveDraftBtn.click();

	await expect(panel.getByText("Đang rà soát")).toBeVisible();

	// Gọi thẳng API publish bằng session TA → 403 GRADE_PUBLISH_FORBIDDEN.
	const directPublish = await taPage.request.post(
		`${API_ORIGIN}/api/grading/${normalAttemptId}/grade`,
		{
			headers: {
				"Content-Type": "application/json",
				Origin: WEB_ORIGIN,
			},
			data: {
				scores: { task: 7, coherence: 7, lexical: 6, grammar: 6.5 },
				feedback: "TA cố chốt qua API",
				version: 2,
			},
		},
	);
	expect(directPublish.status()).toBe(403);
	expect(await directPublish.json()).toMatchObject({
		code: "GRADE_PUBLISH_FORBIDDEN",
	});
});

test("Scenario 2: Bài chứa ai-fail lỗi sau 2 lần tự thử lại → hoàn 100% Credit, hiện E-selfomy-alignment-004 + nút Thử chấm lại AI", async ({
	browser,
}) => {
	test.setTimeout(60_000);
	const walletBeforeRes = await teacherPage.request.get(
		`${API_ORIGIN}/api/credits/wallet`,
	);
	expect(walletBeforeRes.status()).toBe(200);
	const walletBefore = (await walletBeforeRes.json()) as {
		balance: number;
		held: number;
	};

	failAttemptId = await submitWritingPaper(
		browser,
		failWritingTitle,
		"This essay contains ai-fail token to trigger simulated grader failure across retries.",
	);

	await teacherPage.goto(`${WEB_ORIGIN}/grading/${failAttemptId}`);
	const panel = teacherPage.getByTestId("ai-draft-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByText("Chờ chấm tay")).toBeVisible();

	const e004Box = teacherPage.getByTestId("ai-draft-e004");
	await expect(e004Box).toBeVisible();
	await expect(e004Box).toContainText("E-selfomy-alignment-004");
	await expect(e004Box).toContainText(
		"Số Credit tạm giữ đã được hoàn lại đầy đủ vào ví của bạn.",
	);
	const retryBtn = teacherPage.getByTestId("ai-retry-button");
	await expect(retryBtn).toBeEnabled();

	// Bấm "Thử chấm lại AI" trên UI thật (đi qua guard Content-Type JSON của kernel) → 200.
	const retryResponsePromise = teacherPage.waitForResponse(
		(res) =>
			res.url().endsWith(`/api/grading/${failAttemptId}/ai-retry`) &&
			res.request().method() === "POST",
	);
	await retryBtn.click();
	const retryRes = await retryResponsePromise;
	expect(retryRes.status()).toBe(200);

	// Chờ lượt retry chạy xong (bài vẫn chứa ai-fail nên hoàn lại 100% Credit và về lại Chờ chấm tay).
	await expect(panel.getByText("Chờ chấm tay")).toBeVisible();
	await expect(e004Box).toBeVisible();

	// Số dư ví giữ nguyên (Credit tạm giữ của cả 2 lượt đều đã được hoàn trả 100%, held = 0).
	const walletAfterRes = await teacherPage.request.get(
		`${API_ORIGIN}/api/credits/wallet`,
	);
	expect(walletAfterRes.status()).toBe(200);
	const walletAfter = (await walletAfterRes.json()) as {
		balance: number;
		held: number;
	};
	expect(walletAfter.balance).toBe(walletBefore.balance);
	expect(walletAfter.held).toBe(0);
});

test("Scenario 3: TA và GV cùng mở 1 bài; TA lưu trước, GV lưu sau trên màn cũ → cảnh báo E-selfomy-alignment-011 + tải lại thấy bản của TA và giữ nội dung đang gõ", async () => {
	test.setTimeout(60_000);
	// Cả TA và GV cùng mở bài normalAttemptId (đang ở version 2 từ Scenario 1).
	await teacherPage.goto(`${WEB_ORIGIN}/grading/${normalAttemptId}`);
	await taPage.goto(`${WEB_ORIGIN}/grading/${normalAttemptId}`);

	await expect(
		teacherPage.getByTestId("ai-draft-panel").getByText("Đang rà soát"),
	).toBeVisible();
	await expect(
		taPage.getByTestId("ai-draft-panel").getByText("Đang rà soát"),
	).toBeVisible();

	// TA sửa nhận xét và lưu trước (version 2 → 3).
	await taPage
		.locator("#grade-feedback")
		.fill("Bản cập nhật mới của Trợ giảng ở version 3.");
	await taPage.getByTestId("save-draft").click();
	await expect(taPage.getByTestId("grade-saved")).toBeVisible();

	// GV trên màn cũ (vẫn cầm version 2) sửa nhận xét rồi bấm Lưu bản nháp → 409 E-011.
	await teacherPage
		.locator("#grade-feedback")
		.fill("Nhận xét GV đang gõ trên màn cũ.");
	await teacherPage.getByTestId("save-draft").click();

	const conflictMsg = teacherPage.getByTestId("conflict-dialog-message");
	await expect(conflictMsg).toBeVisible();
	await expect(conflictMsg).toContainText("E-selfomy-alignment-011");

	// Bấm "Tải lại bản mới nhất" → form nạp bản của TA, vùng "Bản bạn đang sửa" giữ nội dung GV vừa gõ.
	await teacherPage.getByTestId("reload-latest-draft").click();
	await expect(conflictMsg).toBeHidden();
	await expect(teacherPage.locator("#grade-feedback")).toHaveValue(
		"Bản cập nhật mới của Trợ giảng ở version 3.",
	);
	await expect(
		teacherPage.getByTestId("conflict-preserved-draft"),
	).toContainText("Nhận xét GV đang gõ trên màn cũ.");
});
