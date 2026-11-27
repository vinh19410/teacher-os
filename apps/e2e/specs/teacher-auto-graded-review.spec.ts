import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { orgIdForTeacherEmail, signUpViaApi } from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { TEACHER_BASE_URL, WEB_ORIGIN } from "./origins";

const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `auto.review.${runToken}@test.local`;
const CAPTURE_POT = process.env.CAPTURE_POT_ISSUE === "978";
const REPORT_DIR = new URL("../../../plans/reports", import.meta.url).pathname;

let teacherContext: BrowserContext;
let teacherPage: Page;
let fixture: QuizFixture;
let autoAttemptId = "";

const GRAMMAR_QUESTIONS = [
	{
		stem: "She ___ coffee every morning.",
		opts: ["drink", "drinks", "drinking", "drank"],
		answer: "B",
		alts: "",
	},
	{
		stem: "They ___ the project yesterday.",
		opts: ["finish", "finishes", "finished", "finishing"],
		answer: "C",
		alts: "",
		explanation: "Yesterday requires simple past.",
	},
	{
		stem: "We ___ here since 2020.",
		opts: ["live", "lived", "have lived", "living"],
		answer: "C",
		alts: "",
	},
];

async function seedSubmittedAutoQuizAttempt(opts: {
	orgId: string;
	assignmentId: string;
	studentId: string;
	answers: Record<string, string>;
	correctCount: number;
}): Promise<string> {
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const attemptId = crypto.randomUUID();
		const now = Date.now();
		await db.execute({
			sql: `INSERT INTO quiz_attempt
					(id, org_id, assignment_id, student_id, mode, status, questions_snapshot, answers, essay, correct_count, started_at, submitted_at)
				VALUES (?,?,?,?, 'assignment', 'submitted', ?, ?, '', ?, ?, ?)`,
			args: [
				attemptId,
				opts.orgId,
				opts.assignmentId,
				opts.studentId,
				JSON.stringify(GRAMMAR_QUESTIONS),
				JSON.stringify(opts.answers),
				opts.correctCount,
				now - 300_000,
				now,
			],
		});
		await db.execute({
			sql: `UPDATE class_assignment_target SET submitted_at = ?
				WHERE assignment_id = ? AND student_id = ?`,
			args: [new Date(now).toISOString(), opts.assignmentId, opts.studentId],
		});
		return attemptId;
	} finally {
		db.close();
	}
}

async function assertResponsiveLayouts(
	page: Page,
	captureBaseName?: string,
): Promise<void> {
	const viewports: Array<[string, number, number, boolean]> = [
		["desktop", 1440, 900, true],
		["tablet", 768, 1024, true],
		["mobile", 375, 812, true],
		["reflow-320", 320, 812, false],
	];

	try {
		if (captureBaseName) {
			mkdirSync(REPORT_DIR, { recursive: true });
		}
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate((t) => {
				localStorage.setItem("theme", t);
				document.documentElement.classList.toggle("dark", t === "dark");
			}, theme);

			for (const [label, width, height, shouldCapture] of viewports) {
				await page.setViewportSize({ width, height });
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth + 1,
				);
				expect(
					overflow,
					`horizontal overflow at ${label} (${width}x${height}) ${theme}`,
				).toBe(false);

				if (
					CAPTURE_POT &&
					captureBaseName &&
					shouldCapture &&
					(theme === "light" || label === "desktop")
				) {
					await page.screenshot({
						path: `${REPORT_DIR}/${captureBaseName}-${label}-${theme}.png`,
						animations: "disabled",
					});
				}
			}
		}
	} finally {
		await page.evaluate(() => {
			localStorage.setItem("theme", "light");
			document.documentElement.classList.remove("dark");
		});
		await page.setViewportSize({ width: 1280, height: 720 });
	}
}

test.describe("Teacher reviews auto-graded submissions (#978)", () => {
	test.beforeAll(async ({ browser }) => {
		test.setTimeout(120_000);
		teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN });
		teacherPage = await teacherContext.newPage();
		const teacherEmail = await signUpViaApi(teacherPage, {
			name: "Cô Kiểm Bài",
		});
		const orgId = await orgIdForTeacherEmail(teacherEmail);

		fixture = await seedQuizFixture({
			orgId,
			orgName: "unused",
			className: `IELTS Foundation 5.5 (${runToken})`,
			studentName: "Học Viên Tự Chấm",
			studentEmail,
			prompts: [
				{
					title: "Grammar quick check #978",
					skill: "grammar",
					part: "tenses",
					type: "mcq",
					prompt: "<p>Choose the correct option.</p>",
					note: "",
					passage: "",
					questions: GRAMMAR_QUESTIONS,
				},
				{
					title: "Reading open task #978",
					skill: "reading",
					part: "p1",
					type: "tfng",
					prompt: "",
					note: "",
					passage: "<p>A short open reading passage.</p>",
					questions: [
						{
							stem: "Statement 1",
							opts: null,
							answer: "TRUE",
							alts: "",
						},
					],
				},
			],
		});

		autoAttemptId = await seedSubmittedAutoQuizAttempt({
			orgId,
			assignmentId: fixture.assignmentIds[0] ?? "",
			studentId: fixture.studentId,
			answers: { "0": "B", "1": "A", "2": "C" },
			correctCount: 2,
		});
	});

	test.afterAll(async () => {
		await teacherContext?.close();
	});

	test("opens auto-graded submission from Class, Student Bài tập (click & Enter), and /grading with proper back-navigation and 0 manual awaiting count", async () => {
		// 1) Lối vào từ Lớp -> tab Bài tập
		await teacherPage.goto(
			`${TEACHER_BASE_URL}/classes/${fixture.classId}?tab=assignments`,
		);
		await expect(teacherPage.locator("#assigned-list")).toBeVisible();
		const classCard = teacherPage.locator("article.assign-item", {
			hasText: "Grammar quick check #978",
		});
		await expect(classCard).toBeVisible();
		await classCard.getByRole("link", { name: /Xem bài làm/ }).click();

		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${autoAttemptId}\\?from=class$`),
		);
		await expect(teacherPage.getByTestId("auto-submission-view")).toBeVisible();
		await expect(teacherPage.getByTestId("auto-submission-score")).toHaveText(
			"2/3",
		);
		await expect(teacherPage.getByText(/Học viên trả lời:/)).toBeVisible();
		await expect(teacherPage.getByText("Học viên chọn")).toBeVisible();
		await expect(teacherPage.getByText(/Bạn trả lời:/)).toHaveCount(0);
		await expect(teacherPage.getByText("Bạn chọn")).toHaveCount(0);
		await expect(teacherPage.getByTestId("grade-form")).toHaveCount(0);

		const explanationDetails = teacherPage.getByTestId(
			"quiz-review-explanation",
		);
		await explanationDetails.locator("summary").click();
		await expect(
			teacherPage.getByText("Yesterday requires simple past."),
		).toBeVisible();

		// Kiểm chứng responsive 1440/768/375/320 x light/dark + chụp POT màn review
		await assertResponsiveLayouts(teacherPage, "978-auto-review");

		// Quay lại lớp giữ ?tab=assignments
		await teacherPage.getByRole("link", { name: "← Về lớp" }).click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/classes/${fixture.classId}\\?tab=assignments$`),
		);

		// 2) Lối vào từ Học viên -> tab Bài tập (không nested Link, hỗ trợ Enter + click)
		await teacherPage.goto(
			`${TEACHER_BASE_URL}/students/${fixture.studentId}?tab=assign`,
		);
		const grammarRow = teacherPage.locator("tr", {
			hasText: "Grammar quick check #978",
		});
		await expect(grammarRow).toBeVisible();
		await expect(grammarRow).toContainText("Xem bài làm");
		await expect(grammarRow.locator("a")).toHaveCount(0);

		const openRow = teacherPage.locator("tr", {
			hasText: "Reading open task #978",
		});
		await expect(openRow).toBeVisible();
		await expect(openRow).not.toHaveAttribute("tabindex", "0");

		if (CAPTURE_POT) {
			mkdirSync(REPORT_DIR, { recursive: true });
			await teacherPage.setViewportSize({ width: 1440, height: 900 });
			await teacherPage.screenshot({
				path: `${REPORT_DIR}/978-student-assign-desktop-light.png`,
				animations: "disabled",
			});
			await teacherPage.setViewportSize({ width: 1280, height: 720 });
		}

		// Keyboard focus + Enter mở đúng bài làm
		await grammarRow.focus();
		await expect(grammarRow).toBeFocused();
		await grammarRow.press("Enter");
		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${autoAttemptId}\\?from=student$`),
		);
		await expect(teacherPage.getByTestId("auto-submission-view")).toBeVisible();
		await teacherPage.getByRole("link", { name: "← Về học viên" }).click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/students/${fixture.studentId}\\?tab=assign$`),
		);

		// Click chuột cũng mở đúng bài làm và quay lại được tab Bài tập
		await teacherPage
			.locator("tr", { hasText: "Grammar quick check #978" })
			.click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${autoAttemptId}\\?from=student$`),
		);
		await teacherPage.getByRole("link", { name: "← Về học viên" }).click();
		await expect(teacherPage).toHaveURL(
			new RegExp(`/students/${fixture.studentId}\\?tab=assign$`),
		);

		// 3) Lối vào từ /grading — 0 bài chờ chấm, chip lọc Grammar & Tự chấm, hiển thị Tự chấm · 2/3
		await teacherPage.goto(`${TEACHER_BASE_URL}/grading`);
		await expect(
			teacherPage.getByText("0 bài chờ chấm · 1 bài đã nộp"),
		).toBeVisible();

		await teacherPage
			.getByRole("group", { name: "Kỹ năng" })
			.getByRole("button", { name: /Grammar/ })
			.click();
		await teacherPage
			.getByRole("group", { name: "Trạng thái" })
			.getByRole("button", { name: /Tự chấm/ })
			.click();

		const queueRow = teacherPage
			.getByTestId("grading-queue-table")
			.getByRole("row")
			.filter({ hasText: "Grammar quick check #978" });
		await expect(queueRow).toContainText("Tự chấm · 2/3");
		await expect(queueRow).not.toContainText("Grammar · Grammar");

		if (CAPTURE_POT) {
			mkdirSync(REPORT_DIR, { recursive: true });
			await teacherPage.setViewportSize({ width: 1440, height: 900 });
			await teacherPage.screenshot({
				path: `${REPORT_DIR}/978-grading-queue-desktop-light.png`,
				animations: "disabled",
			});
			await teacherPage.setViewportSize({ width: 1280, height: 720 });
		}

		const queueLink = queueRow.getByRole("link", { name: /Xem bài làm/ });
		await queueLink.focus();
		await expect(queueLink).toBeFocused();
		await queueLink.click();

		await expect(teacherPage).toHaveURL(
			new RegExp(`/grading/${autoAttemptId}\\?from=grading$`),
		);
		await teacherPage.getByRole("link", { name: "← Về hàng chờ chấm" }).click();
		await expect(teacherPage).toHaveURL(/\/grading(\?|$)/);
	});
});
