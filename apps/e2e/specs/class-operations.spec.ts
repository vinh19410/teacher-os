import { expect, test } from "@playwright/test";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";
import {
	addDaysISO,
	gotoWeek,
	openClassScheduleTab,
	signUpViaUi,
	vietnamTodayISO,
	vnWeekdayMon0,
} from "./helpers";

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
 * - Tab "Buổi học" (Issue #89) renders "Đã học"/"Sắp tới" badges on the timeline;
 *   the exact-count asserts below only run while standing on "Buổi học".
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

	// 4. See the generated sessions: "Buổi học" tab → 12 "Sắp tới".
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(12);
	// Issue #91: the class starts tomorrow → the VN date gate keeps every
	// occurrence future → badges only, never an in-place check-in button.
	await expect(page.getByRole("button", { name: "Điểm danh" })).toHaveCount(0);

	// 5. Check in on /schedule. The class starts TOMORROW, so its dated rows
	// live in the week containing the first T2/T4 occurrence — pin that week
	// explicitly (issue #121): on a VN Sunday run "tomorrow" is a Monday and
	// the current-week grid would be empty once /schedule renders dated rows
	// only in their own week.
	const seedStartISO = addDaysISO(vietnamTodayISO(), 1);
	const firstSessionISO = Array.from({ length: 7 }, (_, i) =>
		addDaysISO(seedStartISO, i),
	).find((iso) => {
		const weekday = vnWeekdayMon0(iso);
		return weekday === 0 || weekday === 2; // T2 or T4
	});
	if (!firstSessionISO) throw new Error("no T2/T4 within 7 days — impossible");
	await gotoWeek(
		page,
		addDaysISO(firstSessionISO, -vnWeekdayMon0(firstSessionISO)),
	);
	await expect(page).toHaveURL(/\/schedule\?week=/);
	// The pinned week holds only the week's dated blocks (≤2: first T2 + T4),
	// all carrying the student name → strict mode needs .first().
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
	// Badge counts live on the class "Buổi học" tab, never on /schedule.
	await openClassScheduleTab(page, CLASS_NAME);
	await expect(page.getByText("Đã học", { exact: true })).toHaveCount(1);
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(11);
});

/**
 * Issue #91: in-place attendance on the "Buổi học" tab.
 *
 * The create-class UI never offers a start date ≤ today, so the class is
 * seeded through POST /api/classes directly (schema has no future-only
 * guard). Load-bearing details:
 * - API is API_ORIGIN (mặc định :8000) while Playwright's baseURL is the Vite
 *   origin :8001 — a relative page.request.post would 404.
 * - CSRF demands the Vite Origin header plus the session cookie that
 *   page.request carries after signUpViaUi.
 * - The ['kernel'] query cache is staleTime: Infinity — only a reload (never
 *   a goto-heal) makes the SPA refetch the seeded class.
 * - Lessons are generated when a STUDENT is added, not at class creation.
 * - One weekly slot starting today: after the first check-in the next head
 *   is 7 days out → future → badge, 0 buttons.
 */
test("điểm danh tại chỗ trên tab Buổi học (lớp start hôm nay)", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Attendance CTA ${Date.now()}`;
	const STUDENT_NAME = "Trần Atten E2E";

	await signUpViaUi(page);

	const startDate = vietnamTodayISO();
	const response = await page.request.post(
		`${API_ORIGIN}/api/classes`,
		{
			data: {
				name: CLASS_NAME,
				type: "ielts",
				level: "",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedule: {
					days: [vnWeekdayMon0(startDate)],
					start: "19:00",
					end: "20:30",
				},
				sessionsTotal: 12,
				startDate,
			},
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
		},
	);
	// 403 = Origin, 401 = cookie, 415 = content-type — fail loud with the code.
	expect(response.status(), await response.text()).toBe(201);

	// goto would reuse the SPA's ['kernel'] cache — reload refetches instead.
	await page.reload();
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();

	// Lessons appear only after a student joins the class. Add the student on
	// the roster tab — the name would match all 12 rows of "Buổi học".
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await expect(page.getByText("Thêm học viên mới")).toBeVisible();
	await page.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await page.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 1:1 class → sequential head today renders a one-click button.
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	const checkInButton = page.getByRole("button", { name: "Điểm danh" });
	await expect(checkInButton).toHaveCount(1);
	await checkInButton.click();
	await expect(page.getByText("Đã điểm danh.")).toBeVisible();
	// Badge flip is the deterministic completion barrier (toast is transient).
	await expect(page.getByText("Đã học", { exact: true })).toHaveCount(1);
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(11);

	// Persisted server-side: survives a reload; next head is a week out →
	// future → no CTA left on the tab.
	await page.reload();
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText("Đã học", { exact: true })).toHaveCount(1);
	await expect(page.getByRole("button", { name: "Điểm danh" })).toHaveCount(0);
});
