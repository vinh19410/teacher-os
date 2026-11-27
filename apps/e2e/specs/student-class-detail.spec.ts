import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

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
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
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
		classMeta: {
			level: "Band 6.5",
			mode: "Online",
			schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}',
			startDate: "2026-12-15",
		},
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
				sessionDate: addDaysISO(today, 1),
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
		studyPack: {
			title: "Bộ đề tự học E2E",
			startDate: today,
			releaseTime: "00:00",
			dueTime: "23:59",
			items: [
				{
					dayIndex: 1,
					prompt: {
						title: "Study Pack Ngày 1",
						skill: "reading",
						part: "p1",
						type: "mcq",
						note: "",
						passage: "<p>Day 1 study pack passage.</p>",
						questions: [
							{
								stem: "Day 1 Q1?",
								opts: ["Yes", "No"],
								answer: "A",
								alts: "",
							},
						],
					},
				},
				{
					dayIndex: 3,
					prompt: {
						title: "Study Pack Ngày 3",
						skill: "reading",
						part: "p1",
						type: "mcq",
						note: "",
						passage: "<p>Day 3 study pack passage.</p>",
						questions: [
							{
								stem: "Day 3 Q1?",
								opts: ["Yes", "No"],
								answer: "A",
								alts: "",
							},
						],
					},
				},
			],
		},
	});

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Class Detail Student");
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
			`${STUDENT_BASE_URL}/classes/${fixture.classId}`,
		);
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();
		const infoCard = page.getByRole("region", { name: "Thông tin lớp học" });
		await expect(infoCard).toBeVisible();
		await expect(infoCard).toContainText("Lịch");
		await expect(infoCard).toContainText("T3 & T6 · 19:00–20:30");
		await expect(infoCard).toContainText("Hình thức");
		await expect(infoCard).toContainText("Online");
		await expect(infoCard).toContainText("Giáo viên");
		await expect(infoCard).toContainText(teacherName);
		const mailtoLink = infoCard.getByRole("link", { name: teacherEmail });
		await expect(mailtoLink).toHaveAttribute("href", `mailto:${teacherEmail}`);
		await expect(infoCard).toContainText("Khai giảng");
		await expect(infoCard).toContainText("Thứ Ba, 15/12/2026");
		await expect(infoCard).not.toContainText("Khoá");
		await expect(infoCard).not.toContainText("Band 6.5");
		await expect(infoCard).not.toContainText("Số buổi đã học");
		await expect(infoCard).not.toContainText(/\d+\/\d+\s*buổi/);
		await expect(infoCard).not.toContainText("Buổi tới:");
		await expect(infoCard).not.toContainText("18:30");
		await expect(infoCard).not.toContainText(/\d+\s*tháng/);

		// Khẳng định dữ liệu buổi học thật vẫn hiện tại RingStat
		// (tránh negative false-pass khi gỡ mục khỏi ClassInfoCard & JourneySummitCard).
		const sessionsRing = page
			.getByText("Buổi đã diễn ra", { exact: true })
			.locator("..");
		await expect(sessionsRing).toContainText("1/4");
		await expect(sessionsRing).toContainText("Buổi học");

		// Keyboard Tab từ nút "Nhắn giáo viên" tới link mailto trong ClassInfoCard
		await page.getByRole("link", { name: "Nhắn giáo viên" }).focus();
		await page.keyboard.press("Tab");
		await expect(mailtoLink).toBeFocused();

		if (process.env.CAPTURE_POT === "1") {
			const reportsDir = fileURLToPath(
				new URL("../../../plans/reports/", import.meta.url),
			);
			const prefix = process.env.POT_PREFIX?.trim() || "class-info";

			// Desktop Light (1440×900)
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.waitForTimeout(150);
			expect(
				await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				),
			).toBe(false);
			await page.screenshot({
				path: `${reportsDir}${prefix}-class-info-card-desktop.png`,
				fullPage: false,
			});

			// Bật Dark mode qua ThemeToggle & reload kiểm chứng localStorage.theme
			const themeSwitch = page.getByRole("switch", { name: "Giao diện tối" });
			await themeSwitch.click();
			await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
			await page.reload();
			await expect(
				page.getByRole("region", { name: "Thông tin lớp học" }),
			).toBeVisible();
			const darkState = await page.evaluate(() => ({
				hasDarkClass: document.documentElement.classList.contains("dark"),
				storedTheme: localStorage.getItem("theme"),
			}));
			expect(darkState).toEqual({ hasDarkClass: true, storedTheme: "dark" });
			await page.waitForTimeout(150);
			await page.screenshot({
				path: `${reportsDir}${prefix}-class-info-card-dark.png`,
				fullPage: false,
			});

			// Tắt Dark mode trở lại Light cho ảnh Tablet & Mobile
			await page.getByRole("switch", { name: "Giao diện tối" }).click();
			await expect(
				page.getByRole("switch", { name: "Giao diện tối" }),
			).toHaveAttribute("aria-checked", "false");

			for (const [w, h, suffix] of [
				[768, 1024, "tablet"],
				[375, 812, "mobile"],
			] as const) {
				await page.setViewportSize({ width: w, height: h });
				await page.waitForTimeout(150);
				expect(
					await page.evaluate(
						() =>
							document.documentElement.scrollWidth >
							document.documentElement.clientWidth,
					),
				).toBe(false);
				await page.screenshot({
					path: `${reportsDir}${prefix}-class-info-card-${suffix}.png`,
					fullPage: false,
				});
			}

			// Kiểm chứng 320px reflow không tràn ngang
			await page.setViewportSize({ width: 320, height: 812 });
			await page.waitForTimeout(150);
			expect(
				await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				),
			).toBe(false);

			await page.setViewportSize({ width: 1440, height: 900 });
		}

		const lessonSection = page.locator("section").filter({
			has: page.getByRole("heading", { name: "Buổi học", exact: true }),
		});
		await expect(
			lessonSection.getByTestId("journey-syllabus-header"),
		).toHaveCount(0);
		await expect(lessonSection.getByText("Đích đến của bạn")).toHaveCount(0);
		await expect(lessonSection.getByRole("progressbar")).toHaveCount(0);
		await expect(lessonSection.getByTestId("journey-next-hero")).toBeVisible();
		await expect(lessonSection.getByText("Lộ trình chinh phục")).toBeVisible();

		const lessons = lessonSection.locator("li");
		await expect(lessons).toHaveCount(4);
		// Buổi upcoming đã qua giờ kết thúc (chưa ai check-in) → "Đã kết thúc".
		await expect(lessons.nth(0)).toContainText("Đã kết thúc");
		await expect(lessons.nth(0)).not.toContainText("Buổi tới");
		await expect(lessons.nth(1)).toContainText("Đã học");
		await expect(lessons.nth(2)).toContainText("Buổi tới");
		await expect(lessons.nth(2)).toHaveAttribute("aria-current", "true");
		await expect(lessons.nth(3)).not.toContainText("Buổi tới");

		// Bài tập gắn buổi mở trực tiếp 1-click trong Tab Hành trình học (#1026).
		await page
			.getByRole("link", { name: `Làm bài: ${assignmentTitle}` })
			.click();
		await expect(page).toHaveURL(
			`${STUDENT_BASE_URL}/learn/quizzes/${fixture.assignmentIds[0]}`,
		);
		await page.goBack();
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		// Tab Bài tập chỉ hiển thị bộ đề tự học (ẩn homework gắn buổi) và mở làm trước được.
		await page.getByRole("tab", { name: "Bài tập" }).click();
		await expect(page.getByText(assignmentTitle)).toHaveCount(0);
		await expect(
			page.getByRole("listitem").filter({ hasText: "Study Pack Ngày 1" }),
		).toBeVisible();
		const day3Row = page
			.getByRole("listitem")
			.filter({ hasText: "Study Pack Ngày 3" });
		await expect(day3Row).toBeVisible();
		await expect(day3Row).toContainText("Có thể làm trước");
		await day3Row
			.getByRole("link", { name: "Làm bài: Study Pack Ngày 3" })
			.click();
		await expect(page).toHaveURL(
			`${STUDENT_BASE_URL}/learn/quizzes/${fixture.studyPackAssignmentIds?.[1]}`,
		);
		await page.goBack();
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		await page.getByRole("link", { name: "Trang chủ", exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`));
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
			`${STUDENT_BASE_URL}/classes/${fixture.classId}`,
		);
	});

	test("class detail of an invited class shows not found", async ({ page }) => {
		await signIn(page);
		await page.goto(`${STUDENT_BASE_URL}/classes/${fixture.invitedClassId}`);
		await expect(
			page.getByRole("heading", { name: "Không tìm thấy lớp" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Về trang chủ" }).click();
		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`));
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
		await expect(page).toHaveURL(`${STUDENT_BASE_URL}/classes`);
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
			`${STUDENT_BASE_URL}/classes/${fixture.classId}`,
		);
		await expect(nav.getByRole("link", { name: "Lớp học" })).toHaveAttribute(
			"aria-current",
			"page",
		);

		// 2. Bài tập (/assignments) + filter ?status=
		await nav.getByRole("link", { name: "Bài tập" }).click();
		await expect(page).toHaveURL(`${STUDENT_BASE_URL}/assignments`);
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
			`${STUDENT_BASE_URL}/assignments?status=submitted`,
		);
		await expect(page.getByRole("tab", { name: "Đã nộp" })).toHaveAttribute(
			"aria-selected",
			"true",
		);

		// 3. Từ vựng (/practice/vocabulary, không còn mục nav "Từ vựng" riêng)
		await expect(nav.getByRole("link", { name: "Từ vựng" })).toHaveCount(0);
		await nav.getByRole("button", { name: "Luyện tập" }).click();
		await nav.getByRole("link", { name: "Vocabulary" }).click();
		await expect(page).toHaveURL(`${STUDENT_BASE_URL}/practice/vocabulary`);
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
		await expect(page).toHaveURL(`${STUDENT_BASE_URL}/tuition`);
		await expect(nav.getByRole("link", { name: "Học phí" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(
			page.getByRole("heading", { level: 1, name: "Học phí của tôi" }),
		).toBeVisible();
		await expect(page.getByText("Chưa có hóa đơn học phí")).toBeVisible();

		// 5. Tổng quan (/student)
		await nav.getByRole("link", { name: "Tổng quan" }).click();
		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`));
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
		const screenshots = fileURLToPath(
			new URL(
				"../../../plans/261019-0648-student-portal-nav-menu/screenshots/",
				import.meta.url,
			),
		);
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
