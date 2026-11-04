import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
	fillRichEditor,
	orgIdForTeacherEmail,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const PASSWORD = "password-8chars";
const REPORT_DIR = resolve(
	new URL("../../../plans/reports", import.meta.url).pathname,
);

const VIEWPORTS = [
	{ name: "desktop-1440", width: 1440, height: 900 },
	{ name: "tablet-768", width: 768, height: 1024 },
	{ name: "mobile-375", width: 375, height: 812 },
] as const;

async function assertNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth + 1,
	);
	expect(overflow).toBe(false);
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

test("hybrid Grammar + Writing assignment: author, preview, assign, student take/submit, teacher grade, student summary + detail + 3-viewport dark/light (#574)", async ({
	browser,
}) => {
	test.setTimeout(180_000);
	mkdirSync(REPORT_DIR, { recursive: true });

	const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const studentEmail = `hybrid.st.${runToken}@test.local`;
	const PROMPT_TITLE = `E2E-574 Grammar + Writing ${runToken}`;
	const CLASS_NAME = `Lớp Gộp ${runToken}`;

	// 1. Teacher signs up via real UI and seeds a class + enrolled student
	const teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN });
	const teacherPage = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacherPage, { name: "Cô Mỹ" });
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	const fixture = await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: CLASS_NAME,
		studentName: "Minh Học Viên",
		studentEmail,
		prompts: [],
	});

	// 2. Teacher authors Grammar + Writing Task 2 prompt on /assignments/new
	await teacherPage.goto(`${WEB_ORIGIN}/assignments/new`);
	await teacherPage
		.getByRole("button", { name: "Grammar", exact: true })
		.click();
	await teacherPage.getByLabel("Tiêu đề").fill(PROMPT_TITLE);

	// Question 1 (answer B)
	await teacherPage
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("She ___ coffee every morning.");
	await teacherPage.getByLabel("Lựa chọn A câu 1").fill("drink");
	await teacherPage.getByLabel("Lựa chọn B câu 1").fill("drinks");
	await teacherPage.getByLabel("Lựa chọn C câu 1").fill("drinking");
	await teacherPage.getByLabel("Lựa chọn D câu 1").fill("drank");
	await teacherPage.getByRole("button", { name: "Câu 1: B" }).click();

	// Question 2 (answer C)
	await teacherPage.getByRole("button", { name: "Thêm câu" }).click();
	await teacherPage
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("They ___ the project yesterday.");
	await teacherPage.getByLabel("Lựa chọn A câu 2").fill("finish");
	await teacherPage.getByLabel("Lựa chọn B câu 2").fill("finishes");
	await teacherPage.getByLabel("Lựa chọn C câu 2").fill("finished");
	await teacherPage.getByLabel("Lựa chọn D câu 2").fill("finishing");
	await teacherPage.getByRole("button", { name: "Câu 2: C" }).click();

	// Enable optional Writing section -> blocks save while prompt is empty
	await teacherPage.getByRole("button", { name: "Thêm phần Writing" }).click();
	await expect(
		teacherPage.getByTestId("composer-writing-section"),
	).toBeVisible();
	await expect(teacherPage.getByText("Thiếu đề phần Writing")).toBeVisible();
	await expect(
		teacherPage.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();

	await fillRichEditor(
		teacherPage,
		"Đề bài phần Writing",
		"Some people prefer online classes while others prefer traditional classrooms. Discuss both views and give your opinion.",
	);
	await expect(
		teacherPage.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();

	// Responsive + Light/Dark verification on /assignments/new
	for (const vp of VIEWPORTS) {
		await teacherPage.setViewportSize({ width: vp.width, height: vp.height });
		await assertNoHorizontalOverflow(teacherPage);
		await teacherPage.screenshot({
			path: resolve(REPORT_DIR, `574-author-${vp.name}-light.png`),
		});
	}
	await teacherPage.setViewportSize({ width: 320, height: 812 });
	await assertNoHorizontalOverflow(teacherPage);
	await teacherPage.setViewportSize({ width: 1440, height: 900 });
	await teacherPage.getByRole("switch", { name: "Giao diện tối" }).click();
	await teacherPage.screenshot({
		path: resolve(REPORT_DIR, "574-author-desktop-1440-dark.png"),
	});
	await teacherPage.getByRole("switch", { name: "Giao diện tối" }).click();

	// Preview check (both Paper and Sim tabs show both sections!)
	await teacherPage.getByRole("button", { name: "Xem trước" }).click();
	await expect(teacherPage).toHaveURL(/\/assignments\/preview$/);
	await expect(
		teacherPage.getByText("Phần 2 · Writing (Task 2)"),
	).toBeVisible();
	await teacherPage.getByRole("tab", { name: "Làm thử & Soi bài" }).click();
	await expect(teacherPage.getByTestId("hybrid-writing-section")).toBeVisible();
	await teacherPage.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(teacherPage).toHaveURL(/\/assignments\/new$/);

	// Save prompt to bank
	await teacherPage
		.getByRole("button", { name: "Lưu vào ngân hàng" })
		.first()
		.click();
	await expect(
		teacherPage.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 3. Teacher assigns the hybrid prompt to the class
	await teacherPage.goto(`${WEB_ORIGIN}/classes/${fixture.classId}`);
	await teacherPage
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await teacherPage
		.getByRole("button", { name: "Giao bài tập" })
		.first()
		.click();

	// Filter by Grammar chip -> see hybrid prompt with + Writing tag
	await teacherPage
		.getByRole("button", { name: "Grammar", exact: true })
		.click();
	const promptOption = teacherPage.getByRole("button", {
		name: PROMPT_TITLE,
	});
	await expect(promptOption).toContainText("+ Writing");
	await promptOption.click();
	await teacherPage
		.getByRole("button", { name: "Giao bài tập" })
		.last()
		.click();
	await expect(
		teacherPage.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await teacherPage.getByRole("button", { name: "Xem bài đã giao" }).click();
	await expect(teacherPage.getByText(PROMPT_TITLE).first()).toBeVisible();

	// 4. Student signs up on student portal, opens hybrid assignment, answers 1 right + 1 wrong + writes essay, submits
	const studentContext = await browser.newContext();
	const studentPage = await studentContext.newPage();
	await studentPage.goto(`${STUDENT_ORIGIN}/login`);
	await studentPage.locator("#tab-signup").click();
	await studentPage.locator("#signup-name").fill("Minh Học Viên");
	await studentPage.locator("#signup-email").fill(studentEmail);
	await studentPage.locator("#signup-password").fill(PASSWORD);
	await studentPage.locator("#panel-signup button[type='submit']").click();
	await expect(studentPage.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(studentPage, studentEmail);
	await expect(studentPage).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});

	await studentPage
		.getByRole("link", { name: `Làm bài: ${PROMPT_TITLE}` })
		.click();
	const startDialog = studentPage.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(startDialog).toBeVisible();
	await expect(
		studentPage.getByText("2 câu hỏi + Bài viết · Band 7.0"),
	).toBeVisible();
	await startDialog.getByRole("button", { name: "Bắt đầu" }).click();

	await expect(studentPage.getByTestId("hybrid-writing-section")).toBeVisible();

	// Q1 -> B (correct), Q2 -> A (wrong)
	const q1Group = studentPage.getByRole("radiogroup", { name: "Câu 1" });
	await q1Group.locator('input[value="B"]').check({ force: true });
	const q2Group = studentPage.getByRole("radiogroup", { name: "Câu 2" });
	await q2Group.locator('input[value="A"]').check({ force: true });

	// Fill Writing essay
	const essayText =
		"Online education offers remarkable flexibility for adult learners, whereas traditional classrooms foster deeper face-to-face collaboration.";
	await studentPage
		.getByTestId("hybrid-writing-section")
		.getByRole("textbox")
		.fill(essayText);
	await expect(
		studentPage.getByTestId("hybrid-essay-word-count"),
	).toContainText("15 từ · tối thiểu 250");

	// Capture 3-viewport screenshots on student hybrid take screen
	for (const vp of VIEWPORTS) {
		await studentPage.setViewportSize({ width: vp.width, height: vp.height });
		await assertNoHorizontalOverflow(studentPage);
		await studentPage.screenshot({
			path: resolve(REPORT_DIR, `574-student-take-${vp.name}-light.png`),
		});
	}
	await studentPage.setViewportSize({ width: 1440, height: 900 });

	// Submit (short essay warning dialog -> confirm)
	await studentPage.getByRole("button", { name: "Nộp bài" }).click();
	const guardDialog = studentPage.getByRole("alertdialog");
	await expect(guardDialog).toContainText("Bài viết chưa đủ số từ");
	await guardDialog.getByRole("button", { name: "Nộp bài" }).click();

	// 5. Student summary immediately shows 1/2 MCQ score + awaiting teacher grade + essay
	await expect(studentPage).toHaveURL(/\/learn\/quizzes\/attempt\/[^/]+$/, {
		timeout: 20_000,
	});
	await expect(studentPage.getByTestId("attempt-correct-count")).toHaveText(
		"1",
	);
	await expect(studentPage.getByTestId("awaiting-grade")).toBeVisible();
	await expect(studentPage.getByTestId("essay-frame")).toContainText(
		"Online education offers remarkable flexibility",
	);

	// 6. Teacher opens class assignments tab -> sees Chấm bài -> grades Writing seeing objective 1/2 score
	await teacherPage.goto(
		`${WEB_ORIGIN}/classes/${fixture.classId}?tab=assignments`,
	);
	const assignRow = teacherPage.locator("article.assign-item", {
		hasText: PROMPT_TITLE,
	});
	await expect(assignRow).toContainText("+ Writing");
	await assignRow.getByRole("link", { name: "Chấm bài" }).click();
	await expect(teacherPage).toHaveURL(/\/grading\/[^/]+$/);

	await expect(teacherPage.getByTestId("hybrid-objective-score")).toContainText(
		"1/2 câu đúng",
	);
	await expect(
		teacherPage.getByText("Discuss both views").first(),
	).toBeVisible();

	for (const vp of VIEWPORTS) {
		await teacherPage.setViewportSize({ width: vp.width, height: vp.height });
		await assertNoHorizontalOverflow(teacherPage);
		await teacherPage.screenshot({
			path: resolve(REPORT_DIR, `574-teacher-grade-${vp.name}-light.png`),
		});
	}
	await teacherPage.setViewportSize({ width: 1440, height: 900 });

	await setBand(teacherPage, "Task Response", "6.5");
	await setBand(teacherPage, "Coherence & Cohesion", "6.5");
	await setBand(teacherPage, "Lexical Resource", "6.5");
	await setBand(teacherPage, "Grammatical Range & Accuracy", "6.5");
	await teacherPage
		.locator("#grade-feedback")
		.fill("Bài viết đúng trọng tâm, cần viết đủ 250 từ.");
	await teacherPage.getByTestId("publish-grade").click();
	await expect(teacherPage.getByTestId("grade-saved")).toBeVisible();

	// 7. Student reloads summary -> sees BOTH 1/2 MCQ score AND Band 6.5 + feedback, and /detail preserves Q1 answer + Band 6.5!
	await studentPage.reload();
	await expect(studentPage.getByTestId("attempt-correct-count")).toHaveText(
		"1",
	);
	await expect(studentPage.getByTestId("grade-band")).toHaveText("6.5");
	await expect(studentPage.getByTestId("grade-feedback")).toContainText(
		"cần viết đủ 250 từ",
	);

	await studentPage
		.getByRole("link", { name: "Xem giải thích chi tiết" })
		.click();
	await expect(studentPage).toHaveURL(/\/detail$/);
	// Q1 answer B ("drinks") was NOT overwritten by essay at index 0!
	await expect(
		studentPage
			.getByRole("radiogroup", { name: "Câu 1" })
			.locator('input[value="B"]'),
	).toBeChecked();
	await expect(
		studentPage.getByTestId("detail-hybrid-writing-section"),
	).toBeVisible();
	await expect(studentPage.getByTestId("grade-band")).toHaveText("6.5");

	// 8. Student opens /history -> Grammar + Writing entry appears with combined score + "Xem nhận xét" (both All & Writing tabs)
	await studentPage.goto(`${STUDENT_ORIGIN}/history`);
	await expect(studentPage.getByText("1/2 · Band 6.5")).toBeVisible();
	await expect(
		studentPage.getByRole("button", { name: "Xem nhận xét" }),
	).toBeVisible();
	await studentPage.getByRole("tab", { name: "Writing" }).click();
	await expect(studentPage.getByText("1/2 · Band 6.5")).toBeVisible();

	// Mechanical file existence verification of viewport screenshots
	expect(
		existsSync(resolve(REPORT_DIR, "574-author-desktop-1440-light.png")),
	).toBe(true);
	expect(
		existsSync(resolve(REPORT_DIR, "574-author-desktop-1440-dark.png")),
	).toBe(true);
	expect(
		existsSync(resolve(REPORT_DIR, "574-student-take-mobile-375-light.png")),
	).toBe(true);
	expect(
		existsSync(resolve(REPORT_DIR, "574-teacher-grade-tablet-768-light.png")),
	).toBe(true);

	await studentContext.close();
	await teacherContext.close();
});
