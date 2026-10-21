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
// Đủ dài để trang kết quả cuộn được — phục vụ assertion sticky (#336).
const ESSAY = `Living in a city has many benefits.
First, jobs are plentiful.
${Array.from(
	{ length: 14 },
	(_, i) =>
		`Điểm ${i + 1}: city dwellers can reach museums, offices and hospitals within minutes, which saves hours every single week and makes daily routines far more predictable than in rural areas where transport is sparse.`,
).join("\n")}`;

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let fixture: QuizFixture;
let attemptId = "";
let htmlAttemptId = "";

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
			{
				title: "Writing ghi chú HTML: remote learning",
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt: "<p>Discuss the impact of remote learning.</p>",
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
	htmlAttemptId = await seedSubmittedEssay({
		orgId,
		assignmentId: fixture.assignmentIds[1] ?? "",
		studentId: fixture.studentId,
		essay:
			"<p>Remote learning has widened the gap between rich &amp; poor students.</p><p>Teachers need better tools.</p>",
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
		// Chưa chấm: không highlight, không ghi chú inline, không chia khung,
		// dòng chờ chấm.
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
		await expect(studentPage.getByTestId("essay-inline-note")).toHaveCount(0);
		await expect(studentPage.getByTestId("writing-result-split")).toHaveCount(
			0,
		);

		// Giáo viên chấm qua API (không phụ thuộc widget chọn điểm) — feedback
		// dài để card tràn max-h, phục vụ assertion card cuộn được.
		const gradeRes = await teacherPage.request.post(
			`${API_ORIGIN}/api/grading/${attemptId}/grade`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "application/json",
				},
				data: {
					scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 },
					feedback: Array.from(
						{ length: 30 },
						(_, i) =>
							`Nhận xét dòng ${i + 1}: bài viết dùng ví dụ tốt, cần mở rộng lập luận và kiểm tra lại dấu câu cho kỹ hơn.`,
					).join("\n"),
				},
			},
		);
		expect(gradeRes.status()).toBe(200);

		// Học viên reload → thấy 2 highlight + ghi chú nằm NGAY SAU highlight
		// (#336), band 6.5; danh sách riêng đã bỏ.
		await studentPage.reload();
		await expect(markNth(studentPage, 1)).toHaveText(/benefits/);
		await expect(markNth(studentPage, 2)).toHaveText(/plentiful/);
		await expect(
			studentPage.locator(
				'mark[data-n="1"] + [data-testid="essay-inline-note"]',
			),
		).toContainText("Dùng 'advantages' cho đa dạng.");
		await expect(
			studentPage.locator(
				'mark[data-n="2"] + [data-testid="essay-inline-note"]',
			),
		).toContainText("Từ hay.");
		await expect(studentPage.getByTestId("essay-annotation-list")).toHaveCount(
			0,
		);
		await expect(studentPage.getByTestId("grade-band")).toHaveText("6.5");

		// Bố cục 2 khung ở ≥ 921px (viewport mặc định Playwright 1280×720).
		const essayFrame = studentPage.getByTestId("essay-frame");
		const gradeCard = studentPage.getByTestId("attempt-grade");
		const gradeBody = studentPage.getByTestId("attempt-grade-body");
		const essayFrameBox = await essayFrame.boundingBox();
		const cardBox = await gradeCard.boundingBox();
		expect(essayFrameBox).not.toBeNull();
		expect(cardBox).not.toBeNull();
		// Card bên phải khung bài viết.
		expect(essayFrameBox?.x ?? 0).toBeLessThan(cardBox?.x ?? 0);
		// Heading hai cột thẳng hàng (cùng mt-6 trong grid BFC).
		const essayHeadingBox = await essayFrame.locator("h2").boundingBox();
		const gradeHeadingBox = await gradeCard.locator("h2").boundingBox();
		expect(essayHeadingBox).not.toBeNull();
		expect(gradeHeadingBox).not.toBeNull();
		expect(
			Math.abs((essayHeadingBox?.y ?? 0) - (gradeHeadingBox?.y ?? 0)),
		).toBeLessThanOrEqual(4);
		// Biên trên 2 card thẳng hàng: card điểm bắt đầu sau heading + meta
		// "Chấm lúc", đối xứng card bài viết (heading → meta → card).
		const essayCardBox = await essayFrame.locator("> div").boundingBox();
		const gradeBodyBox = await gradeBody.boundingBox();
		expect(essayCardBox).not.toBeNull();
		expect(gradeBodyBox).not.toBeNull();
		expect(
			Math.abs((essayCardBox?.y ?? 0) - (gradeBodyBox?.y ?? 0)),
		).toBeLessThanOrEqual(4);
		// max-w-[1120px] hiệu lực — nhồi trong 720px thì khung trái chỉ ~400px.
		expect(essayFrameBox?.width ?? 0).toBeGreaterThanOrEqual(500);
		// `app:sticky` phải sinh CSS thật (bắt variant chết).
		expect(
			await gradeCard.evaluate((el) => getComputedStyle(el).position),
		).toBe("sticky");

		// Sticky dính khi cuộn: ở root 14px (design v2), py-6 = 21px và
		// max-h (100svh − 6rem = 636px) nên ở đáy trang stickyY ≈ 62.6px.
		// Band [56, 88] khoá cả hai mép mà không ghim con số.
		await studentPage.evaluate(() =>
			window.scrollTo(0, document.body.scrollHeight),
		);
		await expect
			.poll(async () => (await gradeCard.boundingBox())?.y ?? -1, {
				timeout: 5_000,
			})
			.toBeLessThanOrEqual(88);
		const stickyY = (await gradeCard.boundingBox())?.y ?? -1;
		expect(stickyY).toBeGreaterThanOrEqual(56);
		// Card tràn max-h → cuộn được bằng bàn phím (scrollable + tabIndex nằm
		// trên attempt-grade-body; max-h giới hạn trên section).
		const viewportHeight = await studentPage.evaluate(() => window.innerHeight);
		const scrollInfo = await gradeBody.evaluate((el) => ({
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
		}));
		expect(scrollInfo.scrollHeight).toBeGreaterThan(scrollInfo.clientHeight);
		expect(
			await gradeCard.evaluate((el) => getComputedStyle(el).maxHeight),
		).not.toBe("none");
		// max-h thực sự giới hạn chiều cao vùng cuộn (không chỉ tồn tại trên giấy).
		expect(scrollInfo.clientHeight).toBeLessThanOrEqual(
			viewportHeight - 96 + 1,
		);
		await gradeBody.focus();
		await expect(gradeBody).toBeFocused();
		await studentPage.keyboard.press("ArrowDown");
		// Chromium cuộn container focus bằng animation — poll cho scrollTop
		// cập nhật thay vì đo ngay sau keypress.
		await expect
			.poll(async () => gradeBody.evaluate((el) => el.scrollTop))
			.toBeGreaterThan(0);

		// Dải hẹp nhất ≥ 921px (960 — snap nửa màn hình 1920): không tràn ngang.
		await studentPage.setViewportSize({ width: 960, height: 900 });
		await expect
			.poll(() =>
				studentPage.evaluate(() => document.documentElement.scrollWidth),
			)
			.toBeLessThanOrEqual(960);

		// < 921px: xếp dọc — card nằm dưới khung bài viết, không tràn ngang.
		await studentPage.setViewportSize({ width: 768, height: 1024 });
		await expect
			.poll(() =>
				studentPage.evaluate(() => document.documentElement.scrollWidth),
			)
			.toBeLessThanOrEqual(768);
		await studentPage.setViewportSize({ width: 375, height: 812 });
		await expect
			.poll(() =>
				studentPage.evaluate(() => document.documentElement.scrollWidth),
			)
			.toBeLessThanOrEqual(375);
		const mobileFrame = await essayFrame.boundingBox();
		const mobileCard = await gradeCard.boundingBox();
		expect(mobileFrame).not.toBeNull();
		expect(mobileCard).not.toBeNull();
		expect(mobileCard?.y ?? 0).toBeGreaterThan(
			(mobileFrame?.y ?? 0) + (mobileFrame?.height ?? 0),
		);
		await studentContext.close();
	});

	test("renders HTML-wrapped essay (<p> tags) as clean text with aligned highlights (#382)", async ({
		browser,
	}) => {
		await teacherPage.goto(`${WEB_ORIGIN}/grading/${htmlAttemptId}`);
		await expect(teacherPage.getByTestId("essay-text")).toBeVisible();
		await expect(teacherPage.getByTestId("essay-text")).not.toContainText(
			"<p>",
		);
		await expect(teacherPage.getByTestId("essay-word-count")).toContainText(
			"15 từ",
		);

		await selectEssayText(teacherPage, "widened");
		const dialog = teacherPage.getByRole("dialog", { name: "Thêm highlight" });
		await expect(dialog).toBeVisible();
		await dialog.locator("#annotation-note").fill("Động từ chuẩn.");
		await teacherPage.getByRole("button", { name: "Lưu highlight" }).click();
		await expect(markNth(teacherPage, 1)).toHaveText("widened");

		const gradeRes = await teacherPage.request.post(
			`${API_ORIGIN}/api/grading/${htmlAttemptId}/grade`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "application/json",
				},
				data: {
					scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					feedback: "Bài tốt.",
				},
			},
		);
		expect(gradeRes.status()).toBe(200);

		const studentContext = await browser.newContext();
		try {
			const studentPage = await studentContext.newPage();
			await signIn(studentPage);
			await studentPage.goto(
				`${STUDENT_ORIGIN}/learn/quizzes/attempt/${htmlAttemptId}`,
			);
			await expect(studentPage.getByTestId("essay-frame")).not.toContainText(
				"<p>",
			);
			await expect(studentPage.getByTestId("essay-summary-count")).toHaveText(
				"15 từ",
			);
			await expect(markNth(studentPage, 1)).toHaveText("widened");
			await expect(
				studentPage.locator(
					'mark[data-n="1"] + [data-testid="essay-inline-note"]',
				),
			).toContainText("Động từ chuẩn.");
		} finally {
			await studentContext.close();
		}
	});
});
