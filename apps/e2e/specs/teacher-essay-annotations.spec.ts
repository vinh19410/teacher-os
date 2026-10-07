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
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * #332 — Teacher highlights words/phrases on a submitted Writing essay while
 * grading; each highlight saves immediately; the student only sees the
 * numbered highlights + notes on the result screen AFTER the attempt is
 * graded. Real apps on Chromium: the selection is made with a real DOM
 * Range over the rendered essay text (same entry path as a mouse drag).
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `annot.student.${runToken}@test.local`;
const ESSAY = "Living in a city has many benefits.\nFirst, jobs are plentiful.";

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let fixture: QuizFixture;
let attemptId = "";

/** Sau đăng nhập/đăng ký: URL về trang chủ + thấy heading Bài tập. */
async function expectAssignmentsHome(page: Page): Promise<void> {
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

/** Sign in through the portal login form (fresh context → sign-in tab). */
async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expectAssignmentsHome(page);
}

/** Highlight đánh số trên essay — dùng cho cả trang giáo viên lẫn học viên. */
const markNth = (page: Page, n: number) => page.locator(`mark[data-n="${n}"]`);

/** Bôi đen `text` trong khối essay bằng Range thật trên text node (offset
 * giữa từ) — nhấn chuột trước rồi thả tay sau, cùng đường vào popover như
 * kéo chuột (popover chỉ mở khi thả tay). */
async function selectEssayText(page: Page, text: string): Promise<void> {
	await page.evaluate((needle) => {
		const container = document.querySelector('[data-testid="essay-text"]');
		if (!container) throw new Error("essay-text not rendered");
		container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		while (node) {
			const index = (node.textContent ?? "").indexOf(needle);
			if (index >= 0) {
				const range = document.createRange();
				range.setStart(node, index);
				range.setEnd(node, index + needle.length);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				container.dispatchEvent(
					new PointerEvent("pointerup", { bubbles: true }),
				);
				return;
			}
			node = walker.nextNode();
		}
		throw new Error(`text not found in essay: ${needle}`);
	}, text);
}

test.beforeAll(async ({ browser }) => {
	test.setTimeout(120_000);
	teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN });
	teacherPage = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacherPage, {
		name: "Cô Ghi Chú",
	});

	const orgId = await orgIdForTeacherEmail(teacherEmail);
	fixture = await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: `Lớp Ghi Chú ${runToken}`,
		studentName: "Học Viên Ghi Chú",
		studentEmail,
		prompts: [
			{
				title: "Writing ghi chú: city life",
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
	attemptId = await seedSubmittedEssay({
		orgId,
		assignmentId: fixture.assignmentIds[0] ?? "",
		studentId: fixture.studentId,
		essay: ESSAY,
	});

	const signupContext = await browser.newContext();
	const page = await signupContext.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Học Viên Ghi Chú");
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expectAssignmentsHome(page);
	await signupContext.close();
});

test.afterAll(async () => {
	await teacherContext.close();
});

test.describe("Teacher essay annotations (#332)", () => {
	test("teacher highlights two phrases, edits a note, survives reload", async () => {
		await teacherPage.goto(`${WEB_ORIGIN}/grading/${attemptId}`);
		await expect(teacherPage.getByTestId("essay-text")).toBeVisible();

		// 1) Bôi đen một phần từ "benefits" → popover bắt dính cả từ.
		await selectEssayText(teacherPage, "benef");
		const dialog = teacherPage.getByRole("dialog", { name: "Thêm highlight" });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("benefits");

		await dialog
			.locator("#annotation-note")
			.fill("Dùng 'advantages' cho đa dạng.");
		await teacherPage.getByRole("button", { name: "Lưu highlight" }).click();
		await expect(markNth(teacherPage, 1)).toHaveText(/benefits/);
		await expect(
			teacherPage.getByRole("list", { name: "Ghi chú trên bài viết" }),
		).toContainText("Dùng 'advantages' cho đa dạng.");

		// 2) Highlight thứ hai với ghi chú rỗng.
		await selectEssayText(teacherPage, "plentiful");
		const dialog2 = teacherPage.getByRole("dialog", { name: "Thêm highlight" });
		await expect(dialog2).toBeVisible();
		await teacherPage.getByRole("button", { name: "Lưu highlight" }).click();
		await expect(markNth(teacherPage, 2)).toHaveText(/plentiful/);

		// 3) Bôi đen lại vùng đã có highlight → báo trùng, không cho lưu.
		await selectEssayText(teacherPage, "benefits");
		const overlapDialog = teacherPage.getByRole("dialog", {
			name: "Thêm highlight",
		});
		await expect(overlapDialog).toBeVisible();
		await expect(overlapDialog).toContainText(
			"Đoạn này trùng với highlight khác.",
		);
		await expect(
			overlapDialog.getByRole("button", { name: "Lưu highlight" }),
		).toBeDisabled();
		await overlapDialog.getByRole("button", { name: "Huỷ" }).click();

		// 4) Sửa ghi chú mục 2, reload → cả 2 highlight + ghi chú mới còn nguyên.
		await teacherPage.getByRole("button", { name: "Sửa ghi chú 2" }).click();
		await teacherPage.getByLabel("Ghi chú highlight 2").fill("Từ hay.");
		await teacherPage.getByRole("button", { name: "Lưu", exact: true }).click();
		await expect(
			teacherPage.getByRole("list", { name: "Ghi chú trên bài viết" }),
		).toContainText("Từ hay.");

		await teacherPage.reload();
		await expect(markNth(teacherPage, 1)).toHaveText(/benefits/);
		await expect(markNth(teacherPage, 2)).toHaveText(/plentiful/);
		await expect(
			teacherPage.getByRole("list", { name: "Ghi chú trên bài viết" }),
		).toContainText("Dùng 'advantages' cho đa dạng.");
		await expect(
			teacherPage.getByRole("list", { name: "Ghi chú trên bài viết" }),
		).toContainText("Từ hay.");
	});

	test("student sees highlights only after the attempt is graded", async ({
		browser,
	}) => {
		// Chưa chấm: không highlight, không danh sách, dòng chờ chấm.
		const studentContext = await browser.newContext();
		const studentPage = await studentContext.newPage();
		await signIn(studentPage);
		await studentPage.goto(
			`${STUDENT_ORIGIN}/learn/quizzes/attempt/${attemptId}`,
		);
		await expect(
			studentPage.getByText("Giáo viên sẽ chấm bài viết của bạn."),
		).toBeVisible();
		await expect(studentPage.locator("mark")).toHaveCount(0);
		await expect(studentPage.getByTestId("essay-annotation-list")).toHaveCount(
			0,
		);

		// Giáo viên chấm qua API (không phụ thuộc widget chọn điểm).
		const gradeRes = await teacherPage.request.post(
			`${API_ORIGIN}/api/grading/${attemptId}/grade`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "application/json",
				},
				data: {
					scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 },
					feedback: "",
				},
			},
		);
		expect(gradeRes.status()).toBe(200);

		// Học viên reload → thấy 2 highlight + ghi chú + band 6.5.
		await studentPage.reload();
		await expect(markNth(studentPage, 1)).toHaveText(/benefits/);
		await expect(markNth(studentPage, 2)).toHaveText(/plentiful/);
		const noteList = studentPage.getByTestId("essay-annotation-list");
		await expect(noteList).toContainText("Dùng 'advantages' cho đa dạng.");
		await expect(noteList).toContainText("Từ hay.");
		await expect(studentPage.getByTestId("grade-band")).toHaveText("6.5");
		await studentContext.close();
	});
});
