import { expect, test } from "@playwright/test";
import { openClassScheduleTab, signUpViaUi } from "./helpers";

/**
 * M1 DOD scenario (issue #59, docs/project-roadmap.md:44):
 * login → tạo lớp có lịch → thấy buổi sinh → check-in → reload giữ data.
 *
 * Load-bearing facts (verified against the DOM):
 * - Lessons are generated when a STUDENT is added to the class
 *   (POST /api/students with classId), not at class creation.
 * - Tabs render plain buttons (no role="tab") — use getByRole("button").
 * - 12 lesson-blocks carry the student name → always .first().
 * - "Điểm danh" closes the modal fire-and-forget; the opacity-60 class on
 *   the lesson block is the deterministic completion barrier.
 * - Tab "Lịch học" renders "Đã học"/"Sắp tới" badges; the "Giáo trình" tab
 *   ($classId.tsx) renders "Đã dạy"/"Đang học"/"Sắp tới" per lesson. The
 *   exact-count asserts below only run while standing on "Lịch học".
 */
test("login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data", async ({
	page,
}) => {
	const CLASS_NAME = "E2E IELTS Writing nhóm tối";
	const STUDENT_NAME = "Nguyễn Văn E2E";

	// 1. Sign-up (org bootstrap happens on the first GET /api/kernel).
	await signUpViaUi(page);

	// 2. Create a scheduled class (T2+T4, Writing; keep defaults:
	// 19:00–20:30, 12 buổi, start tomorrow).
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible();
	await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	await dialog.getByRole("button", { name: "T4", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	// The modal only closes after the kernel refresh applies.
	await expect(dialog).toBeHidden();
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText("0/12 buổi")).toBeVisible();

	// 3. Open the class and add a student — THIS generates the lessons.
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await expect(page.getByText("Thêm học viên mới")).toBeVisible();
	await page.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await page.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 4. See the generated sessions: "Lịch học" tab → 12 "Sắp tới".
	await page.getByRole("button", { name: "Lịch học", exact: true }).click();
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(12);

	// 5. Check in on /schedule.
	await page.getByText("Lịch dạy", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/schedule$/);
	// All 12 blocks contain the student name → strict mode needs .first().
	const lesson = page
		.locator("button.lesson-block", { hasText: STUDENT_NAME })
		.first();
	await expect(lesson).toBeVisible();
	await lesson.click();
	await expect(page.getByText(`${STUDENT_NAME} — 1:1`)).toBeVisible();
	await page.getByRole("button", { name: "Điểm danh" }).click();
	// Modal close is NOT a success signal (fire-and-forget action).
	await expect(page.getByText(`${STUDENT_NAME} — 1:1`)).toBeHidden();
	// Completion barrier: the block gains opacity-60 only after the
	// check-in POST finished and the kernel refetch applied.
	await expect(lesson).toHaveClass(/opacity-60/);

	// 6. Reload keeps the data — proof it was persisted server-side.
	await page.reload();
	await expect(
		page.locator("button.lesson-block", { hasText: STUDENT_NAME }).first(),
	).toHaveClass(/opacity-60/);
	// Badge counts live on the class "Lịch học" tab, never on /schedule.
	await openClassScheduleTab(page, CLASS_NAME);
	await expect(page.getByText("Đã học", { exact: true })).toHaveCount(1);
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(11);
});
