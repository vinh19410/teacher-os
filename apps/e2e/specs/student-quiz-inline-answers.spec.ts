import { expect, type Locator, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

/**
 * End-to-end coverage for inline answer inputs rendered directly inside
 * structured group instructions (`notes` text inputs + `matching` option-bank
 * selects with offset markers) across take, autosave/resume, submit, review,
 * and mobile viewport layout.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `quiz.inline.${runToken}@test.local`;
const ASSIGNMENT_TITLE =
	"Nghe điền từ và nối bảo tàng: History of US recording";

let fixture: QuizFixture;
let assignmentId = "";

/** Sign in through the student portal login form. */
async function signIn(page: Page): Promise<void> {
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

/** Open the take screen for `title`; confirm the start gate if shown. */
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

/** Assert the document does not overflow horizontally at mobile 375x812. */
async function assertNoMobileOverflow(page: Page): Promise<void> {
	await page.setViewportSize({ width: 375, height: 812 });
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			),
		)
		.toBeLessThanOrEqual(0);
}

/** Expand a collapsible `<details>` block and assert a review item + explanation. */
async function expectReviewItemAndExplanation(
	item: Locator,
	expected: {
		verdict: "correct" | "wrong" | "skipped";
		key: string;
		alts?: string;
		explanationText: string;
	},
): Promise<void> {
	await expect(item).toHaveAttribute("data-verdict", expected.verdict);
	await expect(item).toContainText(`Đáp án: ${expected.key}`);
	if (expected.alts) {
		await expect(item).toContainText(`thay thế: ${expected.alts}`);
	}
	const explanation = item.getByTestId("quiz-review-explanation");
	await expect(explanation).toBeVisible();
	await explanation.locator(":scope > summary").click();
	await expect(explanation).toHaveAttribute("open", "");
	await expect(explanation.getByText(expected.explanationText)).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
	fixture = await seedQuizFixture({
		orgName: `Quiz Inline E2E ${runToken}`,
		className: `Lớp Inline ${runToken}`,
		studentName: "Inline Quiz Taker",
		studentEmail,
		prompts: [
			{
				title: ASSIGNMENT_TITLE,
				skill: "listening",
				part: "s3",
				type: "notes",
				note: "",
				passage: "",
				groups: [
					{
						id: "g-notes",
						type: "notes",
						instruction:
							"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p><table><tbody><tr><td><h3><strong>History of US recording technology</strong></h3><ul><li>Popular music began with instruments made of <strong>(1)</strong> that were used outdoors.</li><li>People liked to sing while watching <strong>(2)</strong> events.</li><li>The <strong>(3)</strong> of publishers Witmark and Mills were located there.</li></ul></td></tr></tbody></table>",
						startIndex: 0,
						count: 3,
						optionBank: [],
					},
					{
						id: "g-matching",
						type: "matching",
						instruction:
							"<p>What is the theme of each museum? Choose the correct letter A–C.</p><ul><li>Museum 1: <strong>(14)</strong></li><li>Museum 2: <strong>(15)</strong></li></ul>",
						startIndex: 3,
						count: 2,
						optionBank: [
							"Earth science",
							"Astronomy science",
							"Decoration and art",
						],
					},
				],
				questions: [
					{
						stem: "Popular music began with instruments made of ____ that were used outdoors.",
						opts: null,
						answer: "brass",
						alts: "metal",
						explanation:
							"<p>Brass instruments such as trumpets and tubas were played outdoors.</p>",
					},
					{
						stem: "People liked to sing while watching ____ events.",
						opts: null,
						answer: "sports",
						alts: "",
						explanation: "<p>People enjoyed singing along at sports games.</p>",
					},
					{
						stem: "The ____ of publishers Witmark and Mills were located there.",
						opts: null,
						answer: "offices",
						alts: "",
						explanation:
							"<p>Major music publishers had their offices on Tin Pan Alley.</p>",
					},
					{
						stem: "Museum 1",
						opts: null,
						answer: "C",
						alts: "",
						type: "matching",
						explanation:
							"<p>The first museum showcases interior design and sculptures.</p>",
					},
					{
						stem: "Museum 2",
						opts: null,
						answer: "A",
						alts: "",
						type: "matching",
						explanation:
							"<p>The second museum focuses on geology and earth science.</p>",
					},
				],
			},
		],
	});
	assignmentId = fixture.assignmentIds[0] ?? "";

	// Real student portal signup + mail-log verification (onboarding pre-set by seed).
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Inline Quiz Taker");
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
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
	await context.close();
});

test.describe("Student quiz inline answers", () => {
	test("inline inputs and option-bank selects work across take, navigator focus, autosave resume, review verdicts, explanations, and mobile viewport", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		const progress = page.getByTestId("navigator-progress");
		const inputQ1 = page.getByRole("textbox", { name: "Điền đáp án câu 1" });
		const inputQ2 = page.getByRole("textbox", { name: "Điền đáp án câu 2" });
		const inputQ3 = page.getByRole("textbox", { name: "Điền đáp án câu 3" });
		const selectQ4 = page.getByRole("combobox", { name: "Chọn đáp án câu 4" });
		const selectQ5 = page.getByRole("combobox", { name: "Chọn đáp án câu 5" });

		await test.step("take mode: inline slots, unified badges, option bank placement, navigator focus, autosave, and reload resume", async () => {
			await openPaper(page, ASSIGNMENT_TITLE);
			await expect(page).toHaveURL(
				new RegExp(`/learn/quizzes/${assignmentId}`),
			);
			await expect(progress).toHaveText("Đã trả lời 0/5 câu");

			// Both groups render inline containers with all 5 bound slots and zero duplicated question fieldsets.
			await expect(page.getByTestId("quiz-inline-instruction")).toHaveCount(2);
			await expect(page.getByTestId("quiz-inline-slot")).toHaveCount(5);
			for (const q of [0, 1, 2, 3, 4]) {
				await expect(
					page.locator(
						`[data-testid="quiz-inline-slot"][data-question="${q}"]`,
					),
				).toBeVisible();
			}
			await expect(page.locator("fieldset[data-question]")).toHaveCount(0);

			// Unified 1-based badges match QuizNavigator even when raw HTML has offset markers (14)/(15).
			await expect(page.getByTestId("quiz-inline-badge")).toHaveText([
				"1",
				"2",
				"3",
				"4",
				"5",
			]);

			// Anchors live directly on the inline inputs/selects in take mode.
			await expect(inputQ1).toHaveAttribute("id", "quiz-q-1");
			await expect(inputQ2).toHaveAttribute("id", "quiz-q-2");
			await expect(inputQ3).toHaveAttribute("id", "quiz-q-3");
			await expect(selectQ4).toHaveAttribute("id", "quiz-q-4");
			await expect(selectQ5).toHaveAttribute("id", "quiz-q-5");

			// OptionBankList renders above Group 2's inline matching slots.
			const group2Section = page.locator('section[aria-label="Questions 4–5"]');
			const optionBankTitle = group2Section.getByText("Ngân hàng lựa chọn");
			const optionBankItems = group2Section.locator("ol li");
			await expect(optionBankTitle).toBeVisible();
			await expect(
				optionBankItems.filter({ hasText: "Earth science" }),
			).toBeVisible();
			await expect(
				optionBankItems.filter({ hasText: "Astronomy science" }),
			).toBeVisible();
			await expect(
				optionBankItems.filter({ hasText: "Decoration and art" }),
			).toBeVisible();

			const bankBox = await optionBankTitle.boundingBox();
			const group2FirstSlotBox = await group2Section
				.getByTestId("quiz-inline-slot")
				.first()
				.boundingBox();
			expect(bankBox).not.toBeNull();
			expect(group2FirstSlotBox).not.toBeNull();
			expect(bankBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
				group2FirstSlotBox?.y ?? Number.NEGATIVE_INFINITY,
			);

			// Clicking question 4 in QuizNavigator focuses the inline select control.
			await page.locator('footer button[data-question="3"]').click();
			await expect(page.locator("select#quiz-q-4")).toBeFocused();

			// Answer Q1 (correct), Q2 (wrong), leave Q3 skipped, Q4 (correct), Q5 (wrong).
			await inputQ1.fill("brass");
			await inputQ2.fill("music");
			await selectQ4.selectOption("C");
			await selectQ5.selectOption("B");

			await expect(progress).toHaveText("Đã trả lời 4/5 câu");
			const saveState = page.getByTestId("save-state");
			await expect(saveState).toHaveAttribute("data-state", "saved");
			await expect(saveState).toHaveText("Đã lưu");

			// Reload and resume: all 4 saved answers persist in the inline controls.
			await page.reload();
			const resumeDialog = page.getByRole("alertdialog", {
				name: "Tiếp tục bài làm",
			});
			await expect(resumeDialog).toBeVisible();
			await resumeDialog.getByRole("button", { name: "Tiếp tục" }).click();

			await expect(inputQ1).toHaveValue("brass");
			await expect(inputQ2).toHaveValue("music");
			await expect(inputQ3).toHaveValue("");
			await expect(selectQ4).toHaveValue("C");
			await expect(selectQ5).toHaveValue("B");
			await expect(progress).toHaveText("Đã trả lời 4/5 câu");
		});

		await test.step("responsive no-overflow check on take screen (375x812)", async () => {
			await assertNoMobileOverflow(page);
			await page.setViewportSize({ width: 1280, height: 720 });
		});

		await test.step("submit guard and review mode: inline verdicts, key hints, and collapsible answers & explanations", async () => {
			await page.getByRole("button", { name: "Nộp bài" }).click();
			const guard = page.getByRole("alertdialog", {
				name: "Bạn còn câu hỏi chưa làm",
			});
			await expect(guard).toContainText("Bạn còn 1 câu hỏi chưa làm.");
			await guard.getByRole("button", { name: "Nộp bài" }).click();

			// Summary screen shows 2/5 (2 correct, 2 wrong, 1 skipped).
			await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
			await expect(page.getByTestId("attempt-correct-count")).toHaveText("2");
			await expect(page.getByTestId("attempt-correct")).toHaveText("2");
			await expect(page.getByTestId("attempt-wrong")).toHaveText("2");
			await expect(page.getByTestId("attempt-skipped")).toHaveText("1");

			await page.getByRole("link", { name: "Xem chi tiết bài làm" }).click();
			await expect(page).toHaveURL(/\/detail$/);
			await expect(progress).toHaveText("Đúng 2 câu · Sai 2 · Bỏ qua 1");

			// Inline containers remain bound with zero duplicated fieldsets.
			await expect(page.getByTestId("quiz-inline-instruction")).toHaveCount(2);
			await expect(page.getByTestId("quiz-inline-slot")).toHaveCount(5);
			await expect(page.locator("fieldset[data-question]")).toHaveCount(0);
			await expect(page.getByTestId("quiz-inline-badge")).toHaveText([
				"1",
				"2",
				"3",
				"4",
				"5",
			]);

			// Inline controls are disabled in review mode and preserve submitted values.
			await expect(inputQ1).toBeDisabled();
			await expect(inputQ1).toHaveValue("brass");
			await expect(inputQ2).toBeDisabled();
			await expect(inputQ2).toHaveValue("music");
			await expect(inputQ3).toBeDisabled();
			await expect(inputQ3).toHaveValue("");
			await expect(selectQ4).toBeDisabled();
			await expect(selectQ4).toHaveValue("C");
			await expect(selectQ5).toBeDisabled();
			await expect(selectQ5).toHaveValue("B");

			// Per-slot verdicts and inline key hints (only on wrong/skipped slots).
			const slot = (q: number) =>
				page.locator(`[data-testid="quiz-inline-slot"][data-question="${q}"]`);

			await expect(slot(0)).toHaveAttribute("data-verdict", "correct");
			await expect(slot(1)).toHaveAttribute("data-verdict", "wrong");
			await expect(slot(2)).toHaveAttribute("data-verdict", "skipped");
			await expect(slot(3)).toHaveAttribute("data-verdict", "correct");
			await expect(slot(4)).toHaveAttribute("data-verdict", "wrong");

			// Clicking question 2 in QuizNavigator during review mode focuses the slot wrapper anchor.
			await page.locator('footer button[data-question="1"]').click();
			await expect(slot(1)).toBeFocused();

			await expect(slot(0).getByTestId("quiz-inline-key")).toHaveCount(0);
			await expect(slot(1).getByTestId("quiz-inline-key")).toHaveText(
				"→ sports",
			);
			await expect(slot(2).getByTestId("quiz-inline-key")).toHaveText(
				"→ offices",
			);
			await expect(slot(3).getByTestId("quiz-inline-key")).toHaveCount(0);
			await expect(slot(4).getByTestId("quiz-inline-key")).toHaveText("→ A");

			// Collapsible "Đáp án & Giải thích" blocks for Group 1 and Group 2.
			const reviewDetails = page.getByTestId("quiz-inline-review-details");
			await expect(reviewDetails).toHaveCount(2);

			const group1Details = reviewDetails.nth(0);
			await expect(group1Details).not.toHaveAttribute("open", "");
			await group1Details.locator(":scope > summary").click();
			await expect(group1Details).toHaveAttribute("open", "");
			await expect(group1Details.getByTestId("quiz-review-chip")).toHaveText([
				"Đúng",
				"music",
				"Chưa trả lời",
			]);

			const group1Items = group1Details.getByTestId("quiz-review-item");
			await expect(group1Items).toHaveCount(3);
			await expectReviewItemAndExplanation(group1Items.nth(0), {
				verdict: "correct",
				key: "brass",
				alts: "metal",
				explanationText:
					"Brass instruments such as trumpets and tubas were played outdoors.",
			});
			await expectReviewItemAndExplanation(group1Items.nth(1), {
				verdict: "wrong",
				key: "sports",
				explanationText: "People enjoyed singing along at sports games.",
			});
			await expectReviewItemAndExplanation(group1Items.nth(2), {
				verdict: "skipped",
				key: "offices",
				explanationText:
					"Major music publishers had their offices on Tin Pan Alley.",
			});

			const group2Details = reviewDetails.nth(1);
			await expect(group2Details).not.toHaveAttribute("open", "");
			await group2Details.locator(":scope > summary").click();
			await expect(group2Details).toHaveAttribute("open", "");
			await expect(group2Details.getByTestId("quiz-review-chip")).toHaveText([
				"Đúng",
				"B",
			]);

			const group2Items = group2Details.getByTestId("quiz-review-item");
			await expect(group2Items).toHaveCount(2);
			await expectReviewItemAndExplanation(group2Items.nth(0), {
				verdict: "correct",
				key: "C",
				explanationText:
					"The first museum showcases interior design and sculptures.",
			});
			await expectReviewItemAndExplanation(group2Items.nth(1), {
				verdict: "wrong",
				key: "A",
				explanationText:
					"The second museum focuses on geology and earth science.",
			});
		});

		await test.step("responsive no-overflow check on review detail screen (375x812)", async () => {
			await assertNoMobileOverflow(page);
		});
	});
});
