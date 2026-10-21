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
				// Quá hạn 2 ngày mà chưa ai check-in → badge "Đã kết thúc" (#393).
				date: addDaysISO(today, -2),
				time: "08:00",
				dur: 90,
				status: "upcoming",
				topic: "Buổi quá hạn chưa điểm danh",
			},
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
		await expect(card.getByRole("link", { name: className })).toHaveText(
			className,
		);

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
		await card.getByRole("link", { name: className }).focus();
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
		await expect(lessons).toHaveCount(4);
		// Buổi upcoming đã qua giờ kết thúc (chưa ai check-in) → "Đã kết thúc".
		await expect(lessons.nth(0)).toContainText("Đã kết thúc");
		await expect(lessons.nth(0)).not.toContainText("Buổi tới");
		await expect(lessons.nth(1)).toContainText("Đã học");
		await expect(lessons.nth(2)).toContainText("Buổi tới");
		await expect(lessons.nth(2)).toHaveAttribute("aria-current", "true");
		await expect(lessons.nth(3)).not.toContainText("Buổi tới");

		// Bài tập đã chuyển vào tab riêng ("Bài tập") theo design-v2 #378.
		await page.getByRole("tab", { name: "Bài tập" }).click();
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
		// Card v2 cao hơn (dòng lịch + bảng bài tập) — email có thể dưới fold,
		// mouse.click không tự scroll nên phải đưa vào view trước.
		await email.scrollIntoViewIfNeeded();
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

	test("student header navigation switches across 5 pages and syncs assignment status filter in URL", async ({
		page,
	}) => {
		await signIn(page);

		const nav = page.getByRole("navigation", { name: "Điều hướng học viên" });
		await expect(nav).toBeVisible();
		await expect(nav.getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		// 1. Lớp học (/classes)
		await nav.getByRole("link", { name: "Lớp học" }).click();
		await expect(page).toHaveURL(`${STUDENT_ORIGIN}/classes`);
		await expect(nav.getByRole("link", { name: "Lớp học" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(
			page.getByRole("heading", { level: 1, name: "Lớp học của tôi" }),
		).toBeVisible();
		await expect(
			page.getByTestId("class-card").filter({ hasText: className }),
		).toBeVisible();

		// Child route (/classes/$classId) keeps "Lớp học" active in nav
		await page
			.getByTestId("class-card")
			.filter({ hasText: className })
			.getByRole("link", { name: className })
			.click();
		await expect(page).toHaveURL(
			`${STUDENT_ORIGIN}/classes/${fixture.classId}`,
		);
		await expect(nav.getByRole("link", { name: "Lớp học" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		// 2. Bài tập (/assignments) + filter ?status=
		await nav.getByRole("link", { name: "Bài tập" }).click();
		await expect(page).toHaveURL(`${STUDENT_ORIGIN}/assignments`);
		await expect(nav.getByRole("link", { name: "Bài tập" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(
			page.getByRole("heading", { level: 1, name: "Bài tập của tôi" }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: `Làm bài: ${assignmentTitle}` }),
		).toBeVisible();

		await page.getByRole("tab", { name: "Đã nộp" }).click();
		await expect(page).toHaveURL(
			`${STUDENT_ORIGIN}/assignments?status=submitted`,
		);
		await expect(page.getByRole("tab", { name: "Đã nộp" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// 3. Từ vựng (/practice/vocabulary, không còn mục nav "Từ vựng" riêng)
		await expect(nav.getByRole("link", { name: "Từ vựng" })).toHaveCount(0);
		await nav.getByRole("button", { name: "Luyện tập" }).click();
		await nav.getByRole("link", { name: "Vocabulary" }).click();
		await expect(page).toHaveURL(`${STUDENT_ORIGIN}/practice/vocabulary`);
		await expect(
			nav.getByRole("button", { name: "Luyện tập" }),
		).toHaveAttribute("aria-expanded", "true");
		await expect(
			page.getByRole("navigation", { name: "Breadcrumb" }),
		).toContainText("Luyện tập");
		await expect(
			page.getByRole("heading", { level: 1, name: "Từ vựng", exact: true }),
		).toBeVisible();

		// 4. Học phí (/tuition) — empty state when no invoice
		await nav.getByRole("link", { name: "Học phí" }).click();
		await expect(page).toHaveURL(`${STUDENT_ORIGIN}/tuition`);
		await expect(nav.getByRole("link", { name: "Học phí" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(
			page.getByRole("heading", { level: 1, name: "Học phí của tôi" }),
		).toBeVisible();
		await expect(page.getByText("Chưa có hóa đơn học phí")).toBeVisible();

		// 5. Tổng quan (/)
		await nav.getByRole("link", { name: "Tổng quan" }).click();
		await expect(page).toHaveURL(`${STUDENT_ORIGIN}/`);
		await expect(
			page.getByRole("heading", { name: "Lớp học của tôi" }),
		).toBeVisible();
		await expect(nav.getByRole("link", { name: "Tổng quan" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		// Keyboard focus & 3 viewports (1440x900, 768x1024, 375x812)
		await nav.getByRole("link", { name: "Tổng quan" }).focus();
		await expect(nav.getByRole("link", { name: "Tổng quan" })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(nav.getByRole("link", { name: "Lớp học" })).toBeFocused();
		const screenshots = new URL(
			"../../../plans/261019-0648-student-portal-nav-menu/screenshots/",
			import.meta.url,
		).pathname;
		for (const [w, h, name] of [
			[1440, 900, "student-nav-1440"],
			[768, 1024, "student-nav-768"],
			[375, 812, "student-nav-375"],
		] as const) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForTimeout(200);
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow).toBe(false);
			await page.screenshot({
				path: `${screenshots}${name}.png`,
				fullPage: true,
			});
		}
	});
});
