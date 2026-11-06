import { expect, type Page, test } from "@playwright/test";
import {
	acceptAllClassEnrollments,
	fillRichEditor,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const PASSWORD = "password-8chars";

const REVIEW_VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 375, height: 812 },
] as const;

async function assertNoHorizontalOverflow(
	page: Page,
	screenshotPrefix?: string,
): Promise<void> {
	for (const vp of REVIEW_VIEWPORTS) {
		await page.setViewportSize(vp);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		);
		expect(overflow, `horizontal overflow at ${vp.width}x${vp.height}`).toBe(
			false,
		);
		if (screenshotPrefix) {
			await page.screenshot({
				path: `../../plans/261101-1357-533-study-pack-scheduled-release/screenshots/${screenshotPrefix}-${vp.width}x${vp.height}.png`,
				fullPage: true,
			});
		}
	}
	await page.setViewportSize({ width: 1280, height: 720 });
}

async function signUpAndVerifyStudent(
	page: Page,
	name: string,
	email: string,
): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(name);
	await page.locator("#signup-email").fill(email);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, email);
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
}

test("study pack end-to-end: create grammar & reading prompts -> build 2-day pack -> assign to class -> read-time gate -> shift available_at -> late enrollment backfill", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);

	const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const CLASS_NAME = `E2E 533 Lớp Tự Học ${runToken}`;
	const STUDENT_1_NAME = "Học viên Một 533";
	const STUDENT_1_EMAIL = `st1.533.${runToken}@test.local`;
	const STUDENT_2_NAME = "Học viên Muộn 533";
	const STUDENT_2_EMAIL = `st2.533.${runToken}@test.local`;
	const GRAMMAR_TITLE = `QC-533 Grammar Day 1 ${runToken}`;
	const READING_TITLE = `QC-533 Reading Day 2 ${runToken}`;
	const PACK_TITLE = `Bộ đề 2 ngày ${runToken}`;

	// 1. Teacher signs up & seeds 2 students in the org
	const teacherEmail = await signUpViaApi(page);
	await seedStudent({
		teacherEmail,
		name: STUDENT_1_NAME,
		email: STUDENT_1_EMAIL,
		onboarded: true,
	});
	await seedStudent({
		teacherEmail,
		name: STUDENT_2_NAME,
		email: STUDENT_2_EMAIL,
		onboarded: true,
	});

	// 2. Teacher creates class and enrolls + activates Student 1
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Reading", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);
	const classId = page.url().split("/classes/")[1]?.split("?")[0] ?? "";
	expect(classId.length).toBeGreaterThan(0);

	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_1_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	await acceptAllClassEnrollments(page, classId);

	// 3. Teacher creates a ready Grammar MCQ prompt (Day 1)
	await page.goto("/assignments/new");
	await page.getByRole("button", { name: "Grammar", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(GRAMMAR_TITLE);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("She ____ in London since 2018.");
	await page.getByLabel("Lựa chọn A câu 1").fill("lives");
	await page.getByLabel("Lựa chọn B câu 1").fill("has lived");
	await page.getByLabel("Lựa chọn C câu 1").fill("lived");
	await page.getByLabel("Lựa chọn D câu 1").fill("is living");
	await page.getByRole("button", { name: "Câu 1: B" }).click();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 4. Teacher creates a ready Reading TFNG prompt (Day 2)
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(READING_TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs found across India.",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Stepwells are found across India.");
	await page.getByRole("button", { name: "Câu 1: TRUE" }).click();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 5. Teacher creates a 2-day Study Pack at /assignments/packs
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Bộ đề tự học" }).click();
	await expect(page).toHaveURL(/\/assignments\/packs$/);

	await page.getByRole("button", { name: "Tạo bộ đề", exact: true }).click();
	const packDialog = page.getByRole("dialog");
	await packDialog.getByLabel(/Tiêu đề bộ đề/).fill(PACK_TITLE);

	// Day 1: Grammar
	await packDialog.getByLabel("Ngày học").fill("1");
	await packDialog
		.getByLabel("Bài tập")
		.selectOption({ label: `[Grammar] ${GRAMMAR_TITLE}` });
	await packDialog.getByRole("button", { name: "+ Thêm bài vào ngày" }).click();

	// Day 2: Reading (dayIndex auto-increments to 2)
	await expect(packDialog.getByLabel("Ngày học")).toHaveValue("2");
	await packDialog
		.getByLabel("Bài tập")
		.selectOption({ label: `[Reading] ${READING_TITLE}` });
	await packDialog.getByRole("button", { name: "+ Thêm bài vào ngày" }).click();

	await packDialog.getByRole("button", { name: "Lưu bộ đề" }).click();
	await expect(packDialog).toBeHidden();
	await expect(page.getByText(PACK_TITLE)).toBeVisible();
	await expect(page.getByText("2 ngày · 2 bài tập")).toBeVisible();

	await assertNoHorizontalOverflow(page);

	// 6. Teacher assigns the 2-day Study Pack to the class starting today (00:00 - 23:59)
	const todayISO = vietnamTodayISO();
	await page.goto(`/classes/${classId}`);
	await page.getByRole("button", { name: "Bộ đề tự học", exact: true }).click();
	await page.getByRole("button", { name: "Gán bộ đề" }).first().click();

	const assignDialog = page.getByRole("dialog");
	await assignDialog.getByLabel(/Ngày bắt đầu/).fill(todayISO);
	await assignDialog.getByLabel(/Giờ mở bài/).fill("00:00");
	await assignDialog.getByLabel(/Giờ hạn nộp/).fill("23:59");
	await assignDialog
		.getByRole("button", { name: "Xác nhận gán bộ đề" })
		.click();
	await expect(assignDialog).toBeHidden();

	await expect(page.getByText(GRAMMAR_TITLE)).toBeVisible();
	await expect(page.getByText(READING_TITLE)).toBeVisible();
	await expect(page.getByText("Đã mở")).toBeVisible();
	await expect(page.getByText("Chưa đến giờ")).toBeVisible();

	await assertNoHorizontalOverflow(page, "class-study-pack");

	// Fetch class study packs via API to get Day 1 and Day 2 assignmentIds
	const packsRes = await page.request.get(
		`${API_ORIGIN}/api/classes/${classId}/study-packs`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(packsRes.status()).toBe(200);
	const packsJson: unknown = await packsRes.json();
	let day1AssignmentId = "";
	let day2AssignmentId = "";
	if (
		packsJson &&
		typeof packsJson === "object" &&
		"packs" in packsJson &&
		Array.isArray(packsJson.packs) &&
		packsJson.packs[0] &&
		typeof packsJson.packs[0] === "object" &&
		"assignments" in packsJson.packs[0] &&
		Array.isArray(packsJson.packs[0].assignments)
	) {
		for (const a of packsJson.packs[0].assignments) {
			if (
				a &&
				typeof a === "object" &&
				"dayIndex" in a &&
				"assignmentId" in a
			) {
				if (a.dayIndex === 1 && typeof a.assignmentId === "string") {
					day1AssignmentId = a.assignmentId;
				}
				if (a.dayIndex === 2 && typeof a.assignmentId === "string") {
					day2AssignmentId = a.assignmentId;
				}
			}
		}
	}
	expect(day1AssignmentId.length).toBeGreaterThan(0);
	expect(day2AssignmentId.length).toBeGreaterThan(0);

	// 7. Student 1 opens portal: sees Day 1 Grammar, does NOT see Day 2 Reading
	const studentContext = await browser.newContext();
	const studentPage = await studentContext.newPage();
	await signUpAndVerifyStudent(studentPage, STUDENT_1_NAME, STUDENT_1_EMAIL);

	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${GRAMMAR_TITLE}` }),
	).toBeVisible();
	await expect(studentPage.getByText(READING_TITLE)).toHaveCount(0);

	// Direct GET /api/student/assignments/<day2Id>/quiz returns 404 before available_at
	const day2DirectRes = await studentPage.request.get(
		`${API_ORIGIN}/api/student/assignments/${day2AssignmentId}/quiz`,
		{ headers: { Origin: STUDENT_ORIGIN } },
	);
	expect(day2DirectRes.status()).toBe(404);

	// 8. Student 1 completes and submits Day 1 Grammar quiz -> auto-graded immediately
	await studentPage
		.getByRole("link", { name: `Làm bài: ${GRAMMAR_TITLE}` })
		.click();
	const paper = studentPage.getByTestId("navigator-progress");
	const startDialog = studentPage.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(paper.or(startDialog)).toBeVisible();
	if (await startDialog.isVisible()) {
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
	}
	await expect(paper).toBeVisible();

	await studentPage
		.locator('[data-question="0"] label', { hasText: "has lived" })
		.click();
	await expect(studentPage.getByTestId("save-state")).toHaveAttribute(
		"data-state",
		"saved",
	);
	await studentPage.getByRole("button", { name: "Nộp bài" }).click();

	await expect(studentPage).toHaveURL(/\/learn\/quizzes\/attempt\//);
	await expect(studentPage.getByTestId("attempt-correct-count")).toHaveText(
		"1",
	);
	await expect(studentPage.getByTestId("attempt-correct")).toHaveText("1");
	await expect(studentPage.getByTestId("attempt-wrong")).toHaveText("0");

	// 9. Shift Day 2 available_at to the past via POST /__e2e/study-pack-shift
	const shiftRes = await page.request.post(
		`${API_ORIGIN}/__e2e/study-pack-shift`,
		{
			data: {
				assignmentId: day2AssignmentId,
				availableAtMs: Date.now() - 60_000,
			},
			headers: { "Content-Type": "application/json" },
		},
	);
	expect(shiftRes.status()).toBe(200);

	// Student 1 reloads overview and immediately sees Day 2 without any cron tick
	await studentPage.goto(`${STUDENT_ORIGIN}/`);
	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${READING_TITLE}` }),
	).toBeVisible();
	await studentContext.close();

	// 10. Late student enrollment activated into the class receives active pack targets (due_at > now)
	await page.goto(`/classes/${classId}`);
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog2 = page.getByRole("dialog");
	await enrollDialog2.getByRole("option", { name: STUDENT_2_NAME }).click();
	await enrollDialog2.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog2).toBeHidden();

	await acceptAllClassEnrollments(page, classId);

	// Verify in class study pack section that targetsTotal is now 2
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Bộ đề tự học", exact: true }).click();
	await expect(page.getByText("1/2 đã nộp")).toBeVisible();
	await expect(page.getByText("0/2 đã nộp")).toBeVisible();
});
