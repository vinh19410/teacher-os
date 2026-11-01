import { expect, test } from "@playwright/test";
import {
	fillRichEditor,
	readVerificationEmails,
	seedStudent,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN } from "./origins";

const vnMs = (date: string, time: string) =>
	Date.parse(`${date}T${time}:00+07:00`);

/**
 * #526 — Self study plan end-to-end trên libsql:
 * 1. Giáo viên tạo lớp, kích hoạt học viên, tạo đề ngân hàng `ready`.
 * 2. Giáo viên mở "Kế hoạch tự học" trong `/classes/$classId`, kiểm tra 3 viewport
 *    (1440×900, 768×1024, 375×812) + keyboard focus, lập và công bố plan.
 * 3. Trước `releaseAt` (05:55 VN): học viên vào cổng học viên chưa thấy bài.
 * 4. Đến `releaseAt` (06:00 VN): kích hoạt `POST /__e2e/self-study-tick` -> học viên
 *    nhận email + thông báo trong app và thấy bài tự học.
 * 5. Khi tới mốc hạn nộp (`>= dueAt` 17:00 VN): cổng học viên hiện "Quá hạn".
 * 6. Học viên vẫn nộp được bài sau hạn -> cổng học viên và màn tiến độ giáo viên
 *    đều hiển thị nhãn nộp trễ.
 */
test("self study plan: create & publish on 3 viewports -> pre-release hidden -> tick releases & notifies -> overdue at 17:00 -> late submission", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const CLASS_NAME = `E2E 526 Lớp Tự Học ${runToken}`;
	const STUDENT_NAME = `HV Tự Học ${runToken}`;
	const studentEmail = `ssp.student.${runToken}@test.local`;
	const PROMPT_TITLE = `Đề Writing Tự Học ${runToken}`;
	const todayVN = vietnamTodayISO();

	// 1. Giáo viên đăng ký & seed học viên có email
	const teacherEmail = await signUpViaUi(page);
	await seedStudent({
		teacherEmail,
		name: STUDENT_NAME,
		email: studentEmail,
		onboarded: true,
	});

	// 2. Tạo lớp và ghi danh + kích hoạt học viên
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();

	// 3. Tạo đề ngân hàng `ready`
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Discuss both views and give your own opinion on daily self-study habits.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 4. Mở trang chi tiết lớp -> chuyển sang "Kế hoạch tự học" -> tạo & công bố plan
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByText(CLASS_NAME).click();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();

	const selfStudySwitchBtn = page.getByTestId("practice-mode-self-study");
	await selfStudySwitchBtn.focus();
	await expect(selfStudySwitchBtn).toBeFocused();
	await selfStudySwitchBtn.click();

	await page.getByTestId("self-study-create-open").click();
	await expect(page.getByLabel("Giờ giao bài")).toHaveValue("06:00");
	await expect(page.getByLabel("Giờ hạn nộp")).toHaveValue("17:00");

	// Chọn đề cho ngày hôm nay (`todayVN`)
	const todayGroup = page.getByRole("group", {
		name: `Chọn đề ngày ${todayVN}`,
	});
	await todayGroup.getByRole("button", { name: PROMPT_TITLE }).click();

	await page.getByTestId("self-study-publish-submit").click();
	await expect(page.getByTestId("self-study-plan-detail")).toBeVisible();
	await expect(page.getByText("Đang chạy")).toBeVisible();

	// Kiểm tra 3 viewport (1440×900, 768×1024, 375×812) không tràn ngang
	for (const vp of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await page.setViewportSize(vp);
		await expect(page.getByTestId("self-study-plan-detail")).toBeVisible();
		const hasOverflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(hasOverflow).toBe(false);
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	// 5. Học viên đăng ký tài khoản cổng học viên
	const studentCtx = await browser.newContext();
	const studentPage = await studentCtx.newPage();
	await studentPage.goto(`${STUDENT_ORIGIN}/login`);
	await studentPage.locator("#tab-signup").click();
	await studentPage.locator("#signup-name").fill(STUDENT_NAME);
	await studentPage.locator("#signup-email").fill(studentEmail);
	await studentPage.locator("#signup-password").fill("password-8chars");
	await studentPage.locator("#panel-signup button[type='submit']").click();
	await verifyStudentEmailFromMailLog(studentPage, studentEmail);
	await expect(
		studentPage.getByRole("heading", { name: "Bài tập" }),
	).toBeVisible();

	// 6. Trước `releaseAt` (05:55 VN): chạy tick lúc 05:55 -> học viên chưa thấy bài
	const preTickRes = await page.request.post(
		`${API_ORIGIN}/__e2e/self-study-tick`,
		{
			data: { now: vnMs(todayVN, "05:55") },
		},
	);
	expect(preTickRes.ok()).toBe(true);
	await studentPage.reload();
	await expect(studentPage.getByText(PROMPT_TITLE)).toHaveCount(0);

	// 7. Đến `releaseAt` (06:00 VN): chạy tick lúc 06:00 (đặt dueAt còn +1 giờ để kiểm tra trước hạn)
	const releaseTickRes = await page.request.post(
		`${API_ORIGIN}/__e2e/self-study-tick`,
		{
			data: {
				now: vnMs(todayVN, "06:00"),
				setReleasedDueAt: Date.now() + 3600_000,
			},
		},
	);
	expect(releaseTickRes.ok()).toBe(true);

	// Kiểm tra email thông báo đã gửi trong .mail-log.jsonl
	await expect
		.poll(async () => {
			const mails = await readVerificationEmails();
			return mails.some(
				(m) =>
					m.to === studentEmail &&
					typeof m.subject === "string" &&
					m.subject.includes("Bài tự học hôm nay"),
			);
		})
		.toBe(true);

	await studentPage.reload();
	await expect(studentPage.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(studentPage.getByText("Sắp đến hạn").first()).toBeVisible();

	// 8. Đến mốc 17:00 (`dueAt` đã qua): cổng học viên hiện "Quá hạn"
	const overdueTickRes = await page.request.post(
		`${API_ORIGIN}/__e2e/self-study-tick`,
		{
			data: {
				now: vnMs(todayVN, "17:05"),
				setReleasedDueAt: Date.now() - 60_000,
			},
		},
	);
	expect(overdueTickRes.ok()).toBe(true);

	await studentPage.reload();
	await expect(studentPage.getByText("Quá hạn").first()).toBeVisible();

	// 9. Học viên vẫn vào làm và nộp được bài sau hạn -> đánh dấu nộp trễ
	await studentPage
		.getByRole("link", { name: `Làm bài: ${PROMPT_TITLE}` })
		.click();
	const startDialog = studentPage.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(startDialog).toBeVisible();
	await startDialog.getByRole("button", { name: "Bắt đầu" }).click();

	const essayBox = studentPage.getByLabel("Bài viết của bạn");
	await expect(essayBox).toBeVisible();
	await essayBox.fill(
		"Daily self-study is essential for long-term language acquisition and steady band score improvement.",
	);
	await expect(studentPage.getByTestId("save-state")).toHaveAttribute(
		"data-state",
		"saved",
	);
	await studentPage.getByRole("button", { name: "Nộp bài" }).click();
	const guard = studentPage.getByRole("alertdialog", {
		name: "Bài viết chưa đủ số từ",
	});
	await expect(guard).toBeVisible();
	await guard.getByRole("button", { name: "Nộp bài" }).click();

	await expect(studentPage).toHaveURL(/\/learn\/quizzes\/attempt\//, {
		timeout: 20_000,
	});
	await studentPage.goto(`${STUDENT_ORIGIN}/assignments`);
	await expect(
		studentPage.getByText(/Đã nộp trễ — Đang chờ giáo viên chấm/),
	).toBeVisible();

	// 10. Màn hình Self Study Plan của giáo viên hiển thị "1 nộp trễ"
	await page.reload();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByTestId("practice-mode-self-study").click();
	await expect(page.getByText("1 nộp trễ")).toBeVisible();

	await studentCtx.close();
});
