import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * #307 — Student class card shows the teacher and opens the class detail
 * page. Kernel rows are seeded direct-DB (`helpers-quiz.ts`); the student
 * account is real auth (portal signup + mail-log verification) done once in
 * beforeAll, then each test signs in through the login form.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `class.detail.${runToken}@test.local`;
const teacherName = "Cô Lan";
const teacherEmail = `lan.teacher.${runToken}@e2e.local`;
const className = "IELTS Detail E2E";
const invitedClassName = "IELTS Invited E2E";
const assignmentTitle = "Reading: Một ngày của An";

let fixture: QuizFixture;

async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(
		page.getByRole("heading", { name: "Lớp học của tôi" }),
	).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
	const today = vietnamTodayISO();
	fixture = await seedQuizFixture({
		orgName: `Class Detail E2E ${runToken}`,
		className,
		studentName: "Class Detail Student",
		studentEmail,
		teacher: { name: teacherName, email: teacherEmail },
		invitedClassName,
		lessons: [
			{
				date: addDaysISO(today, -1),
				time: "18:30",
				dur: 90,
				status: "completed",
				topic: "Buổi hôm qua: Skimming",
			},
			{
				date: addDaysISO(today, 1),
				time: "18:30",
				dur: 90,
				status: "upcoming",
				topic: "Buổi ngày mai: Scanning",
			},
			{
				date: addDaysISO(today, 7),
				time: "18:30",
				dur: 90,
				status: "upcoming",
				topic: "Buổi tuần sau: Matching",
			},
		],
		prompts: [
			{
				title: assignmentTitle,
				skill: "reading",
				part: "p1",
				type: "mcq",
				note: "",
				passage: "<p>An là học sinh chăm chỉ.</p>",
				questions: [
					{
						stem: "An là người như thế nào?",
						opts: ["Chăm chỉ", "Lười biếng"],
						answer: "A",
						alts: "",
					},
				],
			},
		],
	});

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Class Detail Student");
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
	await context.close();
});

test.describe("Student class card & class detail page", () => {
	test("class card shows the teacher and opens the class detail page", async ({
		page,
	}) => {
		await signIn(page);

		const card = page.getByTestId("class-card").filter({ hasText: className });
		await expect(card).toContainText(teacherName);
		await expect(card).toContainText(teacherEmail);
		await expect(card.getByRole("link")).toHaveText(className);

		// Lớp chờ kích hoạt: card không có link, vẫn có nút "Tham gia lớp".
		const invitedCard = page
			.getByTestId("class-card")
			.filter({ hasText: invitedClassName });
		await expect(invitedCard.getByRole("link")).toHaveCount(0);
		await expect(
			invitedCard.getByRole("button", { name: "Tham gia lớp" }),
		).toBeVisible();

		// Keyboard: Tab tới link của card rồi Enter mở trang lớp; bấm chuột vào
		// vùng giáo viên (ngoài chữ tên lớp) cũng mở được — kiểm tra ở test sau.
		await card.getByRole("link").focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(
			`${STUDENT_ORIGIN}/classes/${fixture.classId}`,
		);
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: teacherEmail }),
		).toHaveAttribute("href", `mailto:${teacherEmail}`);

		const lessons = page
			.locator("section")
			.filter({ has: page.getByRole("heading", { name: "Buổi học" }) })
			.locator("li");
		await expect(lessons).toHaveCount(3);
		await expect(lessons.nth(0)).toContainText("Đã học");
		await expect(lessons.nth(1)).toContainText("Buổi tới");
		await expect(lessons.nth(1)).toHaveAttribute("aria-current", "true");
		await expect(lessons.nth(2)).not.toContainText("Buổi tới");

		await page
			.getByRole("link", { name: `Làm bài: ${assignmentTitle}` })
			.click();
		await expect(page).toHaveURL(
			`${STUDENT_ORIGIN}/learn/quizzes/${fixture.assignmentIds[0]}`,
		);
		await page.goBack();
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		await page.getByRole("link", { name: "Trang chủ", exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));
		await expect(
			page.getByRole("heading", { name: "Lớp học của tôi" }),
		).toBeVisible();
	});

	test("clicking anywhere on an active class card opens the class page", async ({
		page,
	}) => {
		await signIn(page);
		// Lớp phủ của stretched link nằm trên email, nên click chuột thật vào
		// toạ độ dòng email (ngoài chữ tên lớp) phải mở trang lớp.
		const email = page
			.getByTestId("class-card")
			.filter({ hasText: className })
			.getByText(teacherEmail);
		const box = await email.boundingBox();
		if (!box) throw new Error("teacher email row is not rendered");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page).toHaveURL(
			`${STUDENT_ORIGIN}/classes/${fixture.classId}`,
		);
	});

	test("class detail of an invited class shows not found", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_ORIGIN}/classes/${fixture.invitedClassId}`);
		await expect(
			page.getByRole("heading", { name: "Không tìm thấy lớp" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Về trang chủ" }).click();
		await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));
	});
});
