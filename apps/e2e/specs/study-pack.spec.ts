import { expect, type Page, test } from "@playwright/test";
import {
	acceptAllClassEnrollments,
	fillRichEditor,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import {
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
	STUDENT_ORIGIN,
	WEB_ORIGIN,
} from "./origins";

const PASSWORD = "password-8chars";

const REVIEW_VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 375, height: 812 },
] as const;

/** Modal nhắc kiểm tra đầu vào (#748) chỉ hiện khi org đã có bài kiểm tra; đóng nếu xuất hiện để không chặn click. */
async function dismissPlacementPromptIfPresent(page: Page): Promise<void> {
	const later = page.getByRole("button", { name: "Để sau" });
	if (await later.isVisible({ timeout: 3000 }).catch(() => false)) {
		await later.click();
		await expect(page.getByTestId("placement-prompt-backdrop")).toBeHidden();
	}
}

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
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(name);
	await page.locator("#signup-email").fill(email);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, email);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
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
	await page.goto("/teacher/assignments/new");
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
	await page.goto("/teacher/assignments");
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
	await page.goto(`/teacher/classes/${classId}`);
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

	// 7. Student 1 opens portal: overview shows Day 1 Grammar & hides unstarted Day 2 Reading,
	//    while class tab ?tab=assignments shows both + direct /quiz unlocks early (200)
	const studentContext = await browser.newContext();
	const studentPage = await studentContext.newPage();
	await signUpAndVerifyStudent(studentPage, STUDENT_1_NAME, STUDENT_1_EMAIL);

	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${GRAMMAR_TITLE}` }),
	).toBeVisible();
	await expect(studentPage.getByText(READING_TITLE)).toHaveCount(0);

	// Direct GET /api/student/assignments/<day2Id>/quiz is unlocked (200) before available_at
	const day2DirectRes = await studentPage.request.get(
		`${API_ORIGIN}/api/student/assignments/${day2AssignmentId}/quiz`,
		{ headers: { Origin: STUDENT_ORIGIN } },
	);
	expect(day2DirectRes.status()).toBe(200);

	await dismissPlacementPromptIfPresent(studentPage);

	// Class tab ?tab=assignments displays both Day 1 & upcoming Day 2 with expected date & allows starting early
	await studentPage.goto(
		`${STUDENT_BASE_URL}/classes/${classId}?tab=assignments`,
	);
	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${GRAMMAR_TITLE}` }),
	).toBeVisible();
	const day2ClassRow = studentPage
		.getByRole("listitem")
		.filter({ hasText: READING_TITLE });
	await expect(day2ClassRow).toBeVisible();
	await expect(day2ClassRow).toContainText("Có thể làm trước");
	await expect(day2ClassRow).toContainText("Dự kiến:");

	// 8. Student 1 completes and submits Day 1 Grammar quiz, then submits Day 2 early BEFORE available_at
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

	// Làm trước & nộp Day 2 ngay từ tab Bài tập khi chưa đến available_at
	await studentPage.goto(
		`${STUDENT_BASE_URL}/classes/${classId}?tab=assignments`,
	);
	await studentPage
		.getByRole("link", { name: `Làm bài: ${READING_TITLE}` })
		.click();
	await expect(paper.or(startDialog)).toBeVisible();
	if (await startDialog.isVisible()) {
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
	}
	await expect(paper).toBeVisible();
	await studentPage
		.locator('[data-question="0"] label', { hasText: "TRUE" })
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

	// 9. After early submission (even before available_at shift), Day 2 appears on `/` overview
	await studentPage.goto(`${STUDENT_BASE_URL}/`);
	await expect(
		studentPage.getByRole("link", {
			name: `Xem lại kết quả: ${READING_TITLE}`,
		}),
	).toBeVisible();

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
	await studentPage.goto(`${STUDENT_BASE_URL}/`);
	await expect(
		studentPage.getByRole("link", {
			name: `Xem lại kết quả: ${READING_TITLE}`,
		}),
	).toBeVisible();
	await studentContext.close();

	// 10. Late student enrollment activated into the class receives active pack targets (due_at > now)
	await page.goto(`/teacher/classes/${classId}`);
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog2 = page.getByRole("dialog");
	await enrollDialog2.getByRole("option", { name: STUDENT_2_NAME }).click();
	await enrollDialog2.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog2).toBeHidden();

	await acceptAllClassEnrollments(page, classId);

	// Verify in class study pack section that both Day 1 & Day 2 show 1/2 submitted (strict-mode safe)
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Bộ đề tự học", exact: true }).click();
	await expect(page.getByText("1/2 đã nộp")).toHaveCount(2);
});

test("built-in Course Foun/GT1 IELTS Foundation study pack: filter, detail page preview & simulation, assign, class pack link, student listening blob audio & post-submit transcript (#702, #720)", async ({
	page,
	browser,
}) => {
	test.setTimeout(180_000);

	const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const CLASS_NAME = `E2E 702 Foundation ${runToken}`;
	const STUDENT_NAME = "Học viên Foundation 702";
	const STUDENT_EMAIL = `st.702.${runToken}@test.local`;
	const PACK_TITLE = "Course Foun/GT1 — Mô hình Kỷ luật (15 phút/ngày)";
	const DAY_1_TITLE = "Buổi 1 — The Importance of Education";

	// 1. Teacher signs up & seeds + activates a student in a fresh class
	const teacherEmail = await signUpViaApi(page);
	await seedStudent({
		teacherEmail,
		name: STUDENT_NAME,
		email: STUDENT_EMAIL,
		onboarded: true,
	});

	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Listening", exact: true })
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
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await acceptAllClassEnrollments(page, classId);

	// 2. Navigate to /assignments/packs -> System Library -> IELTS Foundation chip filter
	await page.goto("/teacher/assignments/packs");
	await page.getByRole("button", { name: "Hệ thống" }).click();
	await expect(page).toHaveURL(/scope=system/);

	const foundationChip = page.getByRole("button", {
		name: /^IELTS Foundation/,
	});
	await expect(foundationChip).toBeVisible();
	await foundationChip.click();
	await foundationChip.focus();
	await expect(foundationChip).toBeFocused();
	await expect(page).toHaveURL(/scope=system/);
	await expect(page).toHaveURL(/level=IELTS/);

	await expect(page.getByText(PACK_TITLE)).toBeVisible();
	await expect(page.getByText("69 ngày · 69 bài tập")).toBeVisible();

	// Capture POT screenshots across 3 viewports + dark mode with zero overflow
	for (const vp of REVIEW_VIEWPORTS) {
		await page.setViewportSize(vp);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			),
			`horizontal overflow at ${vp.width}x${vp.height}`,
		).toBe(false);
		await page.screenshot({
			path: `../../plans/reports/702-packs-system-${vp.width}x${vp.height}-light.png`,
			fullPage: true,
		});
		await page.evaluate(() => document.documentElement.classList.add("dark"));
		await page.screenshot({
			path: `../../plans/reports/702-packs-system-${vp.width}x${vp.height}-dark.png`,
			fullPage: true,
		});
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	// Navigate to dedicated study pack detail page (/assignments/packs/$packId)
	const packCard = page.locator("div").filter({ hasText: PACK_TITLE }).first();
	await packCard.getByRole("link", { name: "Xem chi tiết" }).first().click();
	await expect(page).toHaveURL(
		/\/assignments\/packs\/syspack-foun-gt1-discipline/,
	);
	await expect(
		page.getByRole("heading", { level: 1, name: PACK_TITLE }),
	).toBeVisible();
	await expect(page.getByRole("tab", { name: "Đề & Đáp án" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Explicitly select Day 1 in the left rail so ?item= is synced across mobile/desktop
	await page
		.getByRole("navigation", { name: "Danh sách buổi học" })
		.getByRole("button", { name: new RegExp(DAY_1_TITLE) })
		.click();
	await expect(page).toHaveURL(/item=/);
	await expect(
		page.getByRole("heading", { level: 2, name: DAY_1_TITLE }),
	).toBeVisible();
	await expect(page.getByText("Đáp án đúng").first()).toBeVisible();
	await expect(page.getByText("Giải thích").first()).toBeVisible();
	await expect(page.getByText(/Mẹo tự học:/)).toBeVisible();

	await page.getByRole("button", { name: /Transcript/i }).click();
	await expect(
		page.getByText(
			/Education is one of the most important things in our lives\./,
		),
	).toBeVisible();

	await page.getByRole("button", { name: "Nghe thử" }).click();
	const previewAudio = page.getByTestId("study-pack-preview-audio");
	await expect(previewAudio).toBeVisible();
	await expect(previewAudio).toHaveAttribute("src", /^blob:/);

	// Capture #720 POT screenshots across 3 viewports (light & dark) + 320px reflow check
	for (const vp of REVIEW_VIEWPORTS) {
		await page.setViewportSize(vp);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			),
			`pack detail horizontal overflow (light) at ${vp.width}x${vp.height}`,
		).toBe(false);
		await page.screenshot({
			path: `../../plans/reports/720-pack-detail-${vp.width}x${vp.height}-light.png`,
			fullPage: true,
		});
		await page.evaluate(() => document.documentElement.classList.add("dark"));
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			),
			`pack detail horizontal overflow (dark) at ${vp.width}x${vp.height}`,
		).toBe(false);
		await page.screenshot({
			path: `../../plans/reports/720-pack-detail-${vp.width}x${vp.height}-dark.png`,
			fullPage: true,
		});
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
	}

	await page.setViewportSize({ width: 320, height: 800 });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		),
		"pack detail horizontal overflow at 320x800",
	).toBe(false);
	await page.getByRole("button", { name: /Danh sách buổi/ }).click();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		),
		"pack master list horizontal overflow at 320x800",
	).toBe(false);
	await page
		.getByRole("navigation", { name: "Danh sách buổi học" })
		.getByRole("button", { name: new RegExp(DAY_1_TITLE) })
		.click();
	await page.setViewportSize({ width: 1440, height: 900 });

	// Test "Làm thử" interactive quiz simulation tab + URL ?tab=sim
	await page.getByRole("tab", { name: "Làm thử" }).click();
	await expect(page).toHaveURL(/tab=sim/);
	const simAudio = page.getByTestId("quiz-audio-player");
	await expect(simAudio).toBeVisible({ timeout: 10_000 });
	await expect(simAudio).toHaveAttribute("aria-label", "Bài nghe");
	await expect(simAudio).toHaveAttribute("src", /^blob:/);
	await expect(page.getByText("education.mp3")).toHaveCount(0);
	await expect(page.getByText(/🔊/)).toHaveCount(0);
	await page
		.locator('[data-question="0"] label', { hasText: "Success and failure" })
		.click();
	await page.getByRole("button", { name: /^Nộp bài/ }).click();
	await expect(page.getByRole("button", { name: "Làm lại" })).toBeVisible();
	await page.getByRole("tab", { name: "Đề & Đáp án" }).click();

	// Test skill filter chip URL sync & reset
	await page
		.locator('[aria-label="Lọc kỹ năng trong bộ đề"]')
		.getByRole("button", { name: /^Reading/ })
		.click();
	await expect(page).toHaveURL(/skill=reading/);
	await page.getByRole("button", { name: "Xoá bộ lọc" }).click();
	await expect(page).not.toHaveURL(/skill=reading/);

	// 3. Assign the 69-day system study pack to the class starting today (00:00 - 23:59)
	const todayISO = vietnamTodayISO();
	await page.goto(`/teacher/classes/${classId}`);
	await page.getByRole("button", { name: "Bộ đề tự học", exact: true }).click();
	await page.getByRole("button", { name: "Gán bộ đề" }).first().click();

	const assignDialog = page.getByRole("dialog");
	await assignDialog.locator("#assign-pack-id").selectOption({
		label: `[IELTS Foundation] ${PACK_TITLE} (69 ngày · 69 bài · Hệ thống)`,
	});
	await assignDialog.getByLabel(/Ngày bắt đầu/).fill(todayISO);
	await assignDialog.getByLabel(/Giờ mở bài/).fill("00:00");
	await assignDialog.getByLabel(/Giờ hạn nộp/).fill("23:59");
	await assignDialog
		.getByRole("button", { name: "Xác nhận gán bộ đề" })
		.click();
	await expect(assignDialog).toBeHidden();

	// Wait for Day 1 to render in class table and verify class pack title links to detail page
	await expect(page.getByText(DAY_1_TITLE)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole("link", { name: PACK_TITLE })).toHaveAttribute(
		"href",
		"/teacher/assignments/packs/syspack-foun-gt1-discipline",
	);

	// Fetch Day 1, Day 2 (Reading) & Day 3 (Listening) assignmentIds from API
	const packsRes = await page.request.get(
		`${API_ORIGIN}/api/classes/${classId}/study-packs`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(packsRes.status()).toBe(200);
	const packsJson = (await packsRes.json()) as {
		packs?: Array<{
			assignments?: Array<{ dayIndex: number; assignmentId: string }>;
		}>;
	};
	const assignments = packsJson.packs?.[0]?.assignments ?? [];
	const day1AssignmentId =
		assignments.find((a) => a.dayIndex === 1)?.assignmentId ?? "";
	const day2AssignmentId =
		assignments.find((a) => a.dayIndex === 2)?.assignmentId ?? "";
	const day3AssignmentId =
		assignments.find((a) => a.dayIndex === 3)?.assignmentId ?? "";
	expect(day1AssignmentId.length).toBeGreaterThan(0);
	expect(day2AssignmentId.length).toBeGreaterThan(0);
	expect(day3AssignmentId.length).toBeGreaterThan(0);

	// 4. Student opens portal, verifies Day 2 quiz (200) and Day 3 audio (200) unlock early, inspects ?tab=assignments, opens Day 1 Listening
	const studentContext = await browser.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const studentPage = await studentContext.newPage();
	await signUpAndVerifyStudent(studentPage, STUDENT_NAME, STUDENT_EMAIL);

	const day2QuizRes = await studentPage.request.get(
		`${API_ORIGIN}/api/student/assignments/${day2AssignmentId}/quiz`,
		{ headers: { Origin: STUDENT_ORIGIN } },
	);
	expect(day2QuizRes.status()).toBe(200);

	const day3AudioRes = await studentPage.request.get(
		`${API_ORIGIN}/api/student/assignments/${day3AssignmentId}/audio`,
		{ headers: { Origin: STUDENT_ORIGIN } },
	);
	expect(day3AudioRes.status()).toBe(200);
	expect(day3AudioRes.headers()["content-type"]).toContain("audio/mpeg");

	await dismissPlacementPromptIfPresent(studentPage);

	// Check class Tab Bài tập renders full 69-day pack schedule + expected dates + early access
	await studentPage.goto(
		`${STUDENT_BASE_URL}/classes/${classId}?tab=assignments`,
	);
	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${DAY_1_TITLE}` }),
	).toBeVisible();
	const upcomingGroup = studentPage.getByRole("region", {
		name: "Lịch sắp tới · Có thể làm trước",
	});
	await expect(upcomingGroup).toBeVisible();
	await expect(upcomingGroup).toContainText("Ngày 2");
	await expect(upcomingGroup).toContainText("Có thể làm trước");
	await expect(upcomingGroup).toContainText("Dự kiến:");

	const potIssue = process.env.CAPTURE_POT_ISSUE?.trim();
	const potViewports = [
		{ key: "desktop-1440x900", width: 1440, height: 900 },
		{ key: "tablet-768x1024", width: 768, height: 1024 },
		{ key: "mobile-375x812", width: 375, height: 812 },
	] as const;

	if (potIssue === "1026") {
		try {
			for (const vp of potViewports) {
				await studentPage.setViewportSize({
					width: vp.width,
					height: vp.height,
				});
				await expect(upcomingGroup).toBeVisible();
				for (const theme of ["light", "dark"] as const) {
					await studentPage.evaluate((t) => {
						document.documentElement.classList.toggle("dark", t === "dark");
						window.localStorage.setItem("theme", t);
					}, theme);
					expect(
						await studentPage.evaluate(
							() => document.documentElement.scrollWidth > window.innerWidth,
						),
						`student study-pack tab overflow (${theme}) at ${vp.width}x${vp.height}`,
					).toBe(false);
					await studentPage.screenshot({
						path: `../../plans/reports/${potIssue}-student-study-pack-tab-${vp.key}-${theme}.png`,
						fullPage: true,
					});
				}
			}
			await studentPage.evaluate(() => {
				document.documentElement.classList.remove("dark");
				window.localStorage.setItem("theme", "light");
			});
			await studentPage.setViewportSize({ width: 320, height: 568 });
			expect(
				await studentPage.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				),
				"student study-pack tab horizontal overflow at 320x568",
			).toBe(false);
		} finally {
			await studentPage.evaluate(() => {
				document.documentElement.classList.remove("dark");
				window.localStorage.setItem("theme", "light");
			});
			await studentPage.setViewportSize({ width: 1440, height: 900 });
		}
	}

	await studentPage.goto(`${STUDENT_BASE_URL}/`);
	await expect(
		studentPage.getByRole("link", { name: `Làm bài: ${DAY_1_TITLE}` }),
	).toBeVisible();
	await studentPage
		.getByRole("link", { name: `Làm bài: ${DAY_1_TITLE}` })
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

	await expect(studentPage.getByText("IELTS Foundation")).toBeVisible();
	const takeAudio = studentPage.getByTestId("quiz-audio-player");
	await expect(takeAudio).toBeVisible();
	await expect(takeAudio).toHaveAttribute(
		"src",
		/\/api\/student\/assignments\/[^/]+\/audio/,
	);
	await expect(takeAudio).toHaveAttribute("crossorigin", "use-credentials");
	await expect(studentPage.getByText("Đang tải file nghe…")).toHaveCount(0);
	await expect(studentPage.getByText("Không tải được file nghe.")).toHaveCount(
		0,
	);
	await expect
		.poll(() => takeAudio.evaluate((el: HTMLAudioElement) => el.readyState))
		.toBeGreaterThanOrEqual(1);
	const rangeRes = await studentPage.request.get(
		`${API_ORIGIN}/api/student/assignments/${day1AssignmentId}/audio`,
		{ headers: { Origin: STUDENT_ORIGIN, Range: "bytes=0-3" } },
	);
	expect(rangeRes.status()).toBe(206);
	expect(rangeRes.headers()["accept-ranges"]).toBe("bytes");
	expect(rangeRes.headers()["content-range"]).toBe("bytes 0-3/4170");
	expect(rangeRes.headers()["content-length"]).toBe("4");
	await expect(studentPage.getByTestId("quiz-review-transcript")).toHaveCount(
		0,
	);
	await studentPage.screenshot({
		path: "../../plans/reports/702-student-listening-take-1440x900.png",
		fullPage: true,
	});
	await expect(takeAudio).toHaveAttribute("aria-label", "Bài nghe");
	await expect(studentPage.getByText("education.mp3")).toHaveCount(0);
	await expect(studentPage.getByText(/🔊/)).toHaveCount(0);

	const captureAudioPot = potIssue && potIssue !== "1026";
	try {
		for (const vp of potViewports) {
			await studentPage.setViewportSize({
				width: vp.width,
				height: vp.height,
			});
			await expect(takeAudio).toBeVisible();
			for (const theme of ["light", "dark"] as const) {
				await studentPage.evaluate((isDark) => {
					document.documentElement.classList.toggle("dark", isDark);
				}, theme === "dark");
				expect(
					await studentPage.evaluate(
						() => document.documentElement.scrollWidth > window.innerWidth,
					),
					`student listening take overflow (${theme}) at ${vp.width}x${vp.height}`,
				).toBe(false);
				if (captureAudioPot) {
					await studentPage.screenshot({
						path: `../../plans/reports/${potIssue}-quiz-audio-take-${vp.key}-${theme}.png`,
						fullPage: true,
					});
				}
			}
		}
		await studentPage.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await studentPage.setViewportSize({ width: 320, height: 568 });
		expect(
			await studentPage.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			),
			"student listening take horizontal overflow at 320x568",
		).toBe(false);
	} finally {
		await studentPage.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await studentPage.setViewportSize({ width: 1440, height: 900 });
	}

	// Answer Q1 correctly, submit, then open detail review and verify transcript reveals
	await studentPage
		.locator('[data-question="0"] label', { hasText: "Success and failure" })
		.click();
	await expect(studentPage.getByTestId("save-state")).toHaveAttribute(
		"data-state",
		"saved",
	);
	await studentPage.getByRole("button", { name: "Nộp bài" }).click();
	const confirmSubmitDialog = studentPage.getByRole("alertdialog", {
		name: "Bạn còn câu hỏi chưa làm",
	});
	await expect(confirmSubmitDialog).toBeVisible();
	await confirmSubmitDialog.getByRole("button", { name: "Nộp bài" }).click();
	await expect(studentPage).toHaveURL(/\/learn\/quizzes\/attempt\//);

	await studentPage.getByRole("link", { name: "Xem chi tiết bài làm" }).click();
	await expect(studentPage).toHaveURL(/\/detail$/);

	const transcriptBox = studentPage.getByTestId("quiz-review-transcript");
	await expect(transcriptBox).toBeVisible();
	await expect(transcriptBox).toContainText(
		"Education is one of the most important things in our lives.",
	);
	const reviewAudio = studentPage.getByTestId("quiz-audio-player");
	await expect(reviewAudio).toBeVisible();
	await expect(reviewAudio).toHaveAttribute(
		"src",
		/\/api\/student\/assignments\/[^/]+\/audio/,
	);
	await expect(reviewAudio).toHaveAttribute("crossorigin", "use-credentials");
	await expect(studentPage.getByText("Đang tải file nghe…")).toHaveCount(0);
	await expect(studentPage.getByText("Không tải được file nghe.")).toHaveCount(
		0,
	);
	await expect
		.poll(() => reviewAudio.evaluate((el: HTMLAudioElement) => el.readyState))
		.toBeGreaterThanOrEqual(1);
	await expect(reviewAudio).toHaveAttribute("aria-label", "Bài nghe");
	await expect(studentPage.getByText("education.mp3")).toHaveCount(0);
	await expect(studentPage.getByText(/🔊/)).toHaveCount(0);
	expect(
		await studentPage.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		),
	).toBe(false);
	await studentPage.screenshot({
		path: "../../plans/reports/702-student-listening-review-1440x900.png",
		fullPage: true,
	});
	if (captureAudioPot) {
		await studentPage.screenshot({
			path: `../../plans/reports/${potIssue}-quiz-audio-review-desktop-1440x900-light.png`,
			fullPage: true,
		});
	}

	await studentContext.close();
});
