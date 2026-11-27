import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
	fillRichEditor,
	isoInDaysFromTodayVN,
	seedStudent,
	seedUserViaE2e,
	selectWritingTask2,
	signUpViaApi,
	vnWeekdayMon0,
} from "./helpers";
import { API_ORIGIN, LMS_ORIGIN, WEB_ORIGIN } from "./origins";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Issue #208 / #717 — Giao bài trên lớp:
 * class detail → Buổi học & luyện tập → mở AssignClassPromptModal → chọn đề,
 * kiểm tra Escape/backdrop/calendar popover, giao bài -> auto-expand item mới
 * trong #assigned-list → reload → verify "Đã dùng 1 lớp" in bank → reassign
 * warning → verify "Đã dùng 1 lớp" stays distinct after reassign.
 */
test("class detail → assign prompt → verify list, bank tag, and reassign", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 208 Lớp Writing";
	const STUDENT_NAME = "QC-208 Học viên";
	const PROMPT_TITLE = "QC-208 Prompt Ready";

	// 1. Sign-up & seed student
	const teacherEmail = await signUpViaApi(page);
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
	// 3. Create class
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

	// 4. Enroll student into class
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await option.click();
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
	// 5. Create 1 ready prompt and 1 draft prompt in the bank
	await page.goto("/teacher/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people think that university education should be free...",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-208 Draft Prompt");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Draft body not ready to assign...",
	);
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();

	// 6. Go to class detail → tab Bài tập
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);

	// Initial stats: chưa có bài nào → "bài chờ nộp" = 0, sub "Trên 0 bài đã giao".
	await expect(page.getByText("bài chờ nộp")).toBeVisible();
	await expect(page.getByText("Trên 0 bài đã giao")).toBeVisible();
	await expect(page.getByText(/^Từ \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();

	// #391, #520: tab gộp "Buổi học & luyện tập" chứa accordion bài đã giao.
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(page.getByText("Chưa giao bài nào cho lớp này.")).toBeVisible();

	// 7. Click "Giao bài tập" -> opens Modal over class page (list behind stays mounted)
	await page.getByRole("button", { name: "Giao bài tập", exact: true }).click();
	const assignDialog = page.getByRole("dialog", {
		name: new RegExp(`Giao bài tập · ${CLASS_NAME}`),
	});
	await expect(assignDialog).toBeVisible();
	await expect(page.getByText("Bài đã giao lớp này")).toBeAttached();

	// 7b. Cancel via "Huỷ" button and Escape key returns cleanly without mutating
	await assignDialog.getByLabel("Tìm đề sẵn sàng").fill(PROMPT_TITLE);
	await assignDialog
		.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
		.click();
	await assignDialog.getByRole("button", { name: "Huỷ", exact: true }).click();
	await expect(assignDialog).toBeHidden();
	await expect(page.getByText("Chưa giao bài nào cho lớp này.")).toBeVisible();

	await page.getByRole("button", { name: "Giao bài tập", exact: true }).click();
	await expect(assignDialog).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(assignDialog).toBeHidden();
	await expect(page.getByText("Chưa giao bài nào cho lớp này.")).toBeVisible();

	// Re-open cleanly (search reset) & verify ready vs draft prompts
	await page.getByRole("button", { name: "Giao bài tập", exact: true }).click();
	await expect(assignDialog).toBeVisible();
	await expect(assignDialog.getByLabel("Tìm đề sẵn sàng")).toHaveValue("");

	// Picker shows ready prompt, but DOES NOT show draft prompt
	await expect(assignDialog.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(assignDialog.getByText("QC-208 Draft Prompt")).toHaveCount(0);

	// Select ready prompt
	await assignDialog
		.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
		.click();

	// Preview bar appears when selected & action bar copy reflects selection
	await expect(assignDialog.getByText("Xem trước phía học viên")).toBeVisible();
	await expect(assignDialog.getByText("Giao cho 1 học viên")).toBeVisible();

	// 8. Submit assignment -> Modal closes immediately, toast shows, new item expanded at top
	await assignDialog
		.getByRole("button", { name: "Giao bài tập", exact: true })
		.click();
	await expect(assignDialog).toBeHidden();
	await expect(
		page.getByText(`Đã giao “${PROMPT_TITLE}” cho 1 học viên.`),
	).toBeVisible();
	await expect(page.getByText("Bài đã giao lớp này")).toBeVisible();
	await expect(
		page.locator(".assign-item button[aria-expanded]").first(),
	).toHaveAttribute("aria-expanded", "true");
	await expect(
		page.locator("#assigned-list").getByText(PROMPT_TITLE),
	).toBeVisible();
	await expect(page.getByText("Đang mở").first()).toBeVisible();
	await expect(page.getByText("Chưa có bài nộp").first()).toBeVisible();
	await expect(page.getByText("Chưa nộp").first()).toBeVisible();

	// 11. Full reload keeps the assignment (tab resets to roster, switch to Bài tập)
	await page.reload();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(page.getByText("Đang mở").first()).toBeVisible();

	// 12. Go to /assignments → prompt has tag "Đã giao 1 lớp"
	await page.goto("/teacher/assignments");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã giao 1 lớp").first()).toBeVisible();

	// 13. Return to class → reassign the SAME prompt to the SAME class
	await page.goto("/teacher/classes");
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Giao bài tập", exact: true }),
	).toHaveCount(0);
	await page
		.getByRole("button", { name: "+ Giao bài tập", exact: true })
		.click();
	await expect(assignDialog).toBeVisible();

	// Pick same prompt → warning note appears
	await assignDialog
		.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
		.click();
	await expect(
		assignDialog.getByText("Đề này đã giao lớp này, hạn"),
	).toBeVisible();
	await expect(
		assignDialog.getByText("Giao lại sẽ thêm lượt mới cho học viên đã chọn."),
	).toBeVisible();

	// Submit reassign
	await assignDialog
		.getByRole("button", { name: "Giao bài tập", exact: true })
		.click();
	await expect(assignDialog).toBeHidden();

	// Now there are 2 items in class assignments
	const items = page.locator(".assign-item");
	await expect(items).toHaveCount(2);

	// 14. Return to /assignments: tag MUST STILL BE "Đã giao 1 lớp" (distinct classId)
	await page.goto("/teacher/assignments");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã giao 1 lớp").first()).toBeVisible();
	await expect(page.getByText("Đã giao 2 lớp")).toHaveCount(0);
});

test("#572 (en-US locale): dd/mm/yyyy typing without segment jump, calendar popover, 24h dueTime, 3 viewports + 320px reflow, and VN overdue transition", async ({
	browser,
	request,
}) => {
	const CLASS_NAME = "E2E 572 Lớp Hạn Nộp";
	const STUDENT_NAME = "QC-572 Học viên";
	const PROMPT_TITLE = "QC-572 Prompt Timed";

	const context = await browser.newContext({
		locale: "en-US",
		timezoneId: "America/New_York",
		baseURL: WEB_ORIGIN,
	});
	const page = await context.newPage();

	try {
		const teacherEmail = await signUpViaApi(page);
		await seedStudent({ teacherEmail, name: STUDENT_NAME });

		// Create class & activate student
		await page.getByText("Lớp học", { exact: true }).first().click();
		await page.getByRole("button", { name: "+ Tạo lớp" }).click();
		const classDialog = page.getByRole("dialog");
		await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
		await classDialog
			.getByRole("button", { name: "Writing", exact: true })
			.click();
		await classDialog.getByRole("button", { name: "T2", exact: true }).click();
		await classDialog
			.getByRole("button", { name: "Tạo lớp", exact: true })
			.click();
		await expect(classDialog).toBeHidden();

		await page.getByText(CLASS_NAME).click();
		await page.getByRole("tab", { name: "Học viên", exact: true }).click();
		await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
		const enrollDialog = page.getByRole("dialog");
		await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
		await enrollDialog
			.getByRole("button", { name: "Lưu", exact: true })
			.click();
		await expect(enrollDialog).toBeHidden();
		await page.getByRole("button", { name: "Kích hoạt" }).click();
		const confirmModal = page
			.getByRole("dialog")
			.filter({ hasText: "Kích hoạt học viên?" });
		await expect(confirmModal).toBeVisible();
		await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
		await expect(confirmModal).toBeHidden();

		// Create 1 ready prompt
		await page.goto("/teacher/assignments/new");
		await selectWritingTask2(page);
		await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
		await fillRichEditor(
			page,
			"Nội dung đề",
			"Discuss both views and give your own opinion.",
		);
		await page
			.getByRole("button", { name: "Lưu vào ngân hàng" })
			.first()
			.click();
		await expect(
			page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
		).toBeVisible();

		// Navigate to class assign modal
		await page.goto("/teacher/classes");
		await page.getByText(CLASS_NAME).click();
		await page
			.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Giao bài tập", exact: true })
			.click();
		const assignDialog = page.getByRole("dialog", {
			name: new RegExp(`Giao bài tập · ${CLASS_NAME}`),
		});
		const calendarDialog = page.locator(
			"[data-base-ui-portal] [role='dialog']",
		);
		await expect(assignDialog).toBeVisible();
		await assignDialog
			.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
			.click();

		const dueInput = assignDialog.locator("#assignment-due-input");
		const calendarBtn = assignDialog.getByRole("button", { name: "Chọn ngày" });
		const dueTimeInput = assignDialog.locator("#assignment-due-time-input");

		// 1. Keyboard focus order & Escape closes calendar popover WITHOUT closing Modal
		await dueInput.focus();
		await expect(dueInput).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(calendarBtn).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(calendarDialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(calendarDialog).toBeHidden();
		await expect(assignDialog).toBeVisible();
		await expect(calendarBtn).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(dueTimeInput).toBeFocused();

		// Clicking outer dark overlay while calendar popover is open must close ONLY calendar popover, keeping Modal open
		await calendarBtn.click();
		await expect(calendarDialog).toBeVisible();
		await page.mouse.click(5, 5);
		await expect(calendarDialog).toBeHidden();
		await expect(assignDialog).toBeVisible();

		// 2. Sequential typing under en-US locale: "06/11/2027" stays Nov 6 (never June 11)
		await dueInput.click();
		await dueInput.fill("");
		await dueInput.pressSequentially("06/11/2027");
		await expect(dueInput).toHaveValue("06/11/2027");
		await expect(
			assignDialog.getByTestId("assignment-due-preview"),
		).toContainText("Thứ Bảy, 06/11/2027");

		// 3. 8-digit typing "09112027" never jumps segments ("10/09"); normalizes on blur
		await dueInput.fill("");
		await dueInput.pressSequentially("09112027");
		await dueInput.blur();
		await expect(dueInput).toHaveValue("09/11/2027");

		await dueTimeInput.fill("17:30");
		await dueTimeInput.blur();
		await expect(
			assignDialog.getByTestId("assignment-due-preview"),
		).toContainText("09/11/2027 lúc 17:30 (giờ Việt Nam)");

		// 4. Calendar popover opens on November 2027 & picking Nov 15 updates input + preview
		await calendarBtn.click();
		await expect(calendarDialog.getByText("Tháng 11, 2027")).toBeVisible();
		await calendarDialog.getByRole("button", { name: "15/11/2027" }).click();
		await expect(dueInput).toHaveValue("15/11/2027");
		await expect(
			assignDialog.getByTestId("assignment-due-preview"),
		).toContainText("15/11/2027 lúc 17:30 (giờ Việt Nam)");

		// 5. REVIEW.md: 3 viewports (1440×900, 768×1024, 375×812) + 320px reflow across light & dark
		const shotDir = "/tmp/572-screenshots";
		mkdirSync(shotDir, { recursive: true });
		const viewports = [
			{ name: "1440x900", width: 1440, height: 900, capture: true },
			{ name: "768x1024", width: 768, height: 1024, capture: true },
			{ name: "375x812", width: 375, height: 812, capture: true },
			{ name: "320x812", width: 320, height: 812, capture: false },
		] as const;

		for (const vp of viewports) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			for (const theme of ["light", "dark"] as const) {
				await page.evaluate((t) => {
					if (t === "dark") {
						window.localStorage.setItem("theme", "dark");
						document.documentElement.classList.add("dark");
					} else {
						window.localStorage.removeItem("theme");
						document.documentElement.classList.remove("dark");
					}
				}, theme);
				const hasDark = await page.evaluate(() =>
					document.documentElement.classList.contains("dark"),
				);
				expect(hasDark).toBe(theme === "dark");

				const overflowClosed = await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				);
				expect(overflowClosed).toBe(false);
				const modalOverflow = await assignDialog.evaluate(
					(el) => el.scrollWidth > el.clientWidth + 1,
				);
				expect(modalOverflow).toBe(false);
				await assignDialog
					.getByLabel("Tìm đề sẵn sàng")
					.scrollIntoViewIfNeeded();
				if (vp.capture) {
					await page.screenshot({
						path: `${shotDir}/assign-form-${vp.name}-${theme}.png`,
					});
				}

				await calendarBtn.click();
				await expect(calendarDialog).toBeVisible();
				const overflowOpen = await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				);
				expect(overflowOpen).toBe(false);

				if (vp.capture) {
					await page.screenshot({
						path: `${shotDir}/assign-calendar-${vp.name}-${theme}.png`,
					});
				}

				await page.keyboard.press("Escape");
				await expect(calendarDialog).toBeHidden();
				await expect(assignDialog).toBeVisible();
			}
		}

		await page.setViewportSize({ width: 1280, height: 800 });
		await page.evaluate(() => {
			window.localStorage.removeItem("theme");
			document.documentElement.classList.remove("dark");
		});

		// 6. Submit assignment and capture created assignmentId
		const createResPromise = page.waitForResponse(
			(r) =>
				r.url().includes("/api/classes/") &&
				r.url().endsWith("/assignments") &&
				r.request().method() === "POST",
		);
		await assignDialog
			.getByRole("button", { name: "Giao bài tập", exact: true })
			.click();
		const createRes = await createResPromise;
		expect(createRes.status()).toBe(201);
		const { id: assignmentId } = (await createRes.json()) as { id: string };
		expect(assignmentId).toBeTruthy();

		await expect(assignDialog).toBeHidden();
		await expect(page.getByText(/Hạn 17:30 15\/11\/2027/)).toBeVisible();
		await expect(page.getByText("Đang mở").first()).toBeVisible();
		await expect(
			page.locator("#assigned-list button[aria-expanded]").first(),
		).toHaveAttribute("aria-expanded", "true");
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.evaluate(() => {
			window.localStorage.removeItem("theme");
			document.documentElement.classList.remove("dark");
		});
		await page.screenshot({
			path: `${shotDir}/class-assigned-list-1440x900-light.png`,
		});
		for (const vp of [
			{ name: "1440x900", width: 1440, height: 900 },
			{ name: "768x1024", width: 768, height: 1024 },
			{ name: "375x812", width: 375, height: 812 },
			{ name: "320x812", width: 320, height: 812 },
		] as const) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			for (const theme of ["light", "dark"] as const) {
				await page.evaluate((t) => {
					if (t === "dark") {
						window.localStorage.setItem("theme", "dark");
						document.documentElement.classList.add("dark");
					} else {
						window.localStorage.removeItem("theme");
						document.documentElement.classList.remove("dark");
					}
				}, theme);
				const listOverflow = await page.evaluate(
					() => document.documentElement.scrollWidth > window.innerWidth,
				);
				expect(listOverflow).toBe(false);
			}
		}
		await page.evaluate(() => {
			window.localStorage.removeItem("theme");
			document.documentElement.classList.remove("dark");
		});
		await page.setViewportSize({ width: 1280, height: 800 });

		// 7. Shift due_at to 1 minute ago -> verify immediate VN overdue transition
		const shiftRes = await request.post(
			`${API_ORIGIN}/__e2e/study-pack-shift`,
			{
				data: {
					assignmentId,
					dueAtMs: Date.now() - 60_000,
				},
			},
		);
		expect(shiftRes.ok()).toBe(true);
		expect(await shiftRes.json()).toMatchObject({ ok: true, rowsAffected: 1 });

		await page.reload();
		await page
			.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
			.click();
		await expect(page.getByText("Quá hạn").first()).toBeVisible();
		await expect(page.getByText("Chưa nộp · quá hạn").first()).toBeVisible();
		await expect(page.getByText("15/11/2027")).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test("late activation auto-backfills class assignment (0/1 → 0/2 + Student Portal 200), overdue unsubmitted warns on dashboard grading card, and supplemental assign adds late joiner", async ({
	page,
	browser,
	request,
}) => {
	const CLASS_NAME = "E2E Lớp Backfill & Chấm bài";
	const STUDENT_1 = "Leah Học viên 1";
	const STUDENT_2 = "Alex Học viên 2";
	const STUDENT_3 = "Maya Học viên 3";
	const PROMPT_TITLE = "Bài kiểm nhanh GrammarI";
	const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
	// Pick tomorrow's Vietnam weekday so today has 0 pending attendance sessions (openTasks === 0).
	const tomorrowWeekdayLabel =
		DAY_LABELS[vnWeekdayMon0(isoInDaysFromTodayVN(1))];

	const teacherEmail = await signUpViaApi(page);
	const st2Email = `alex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@student.local`;
	await seedStudent({ teacherEmail, name: STUDENT_1 });
	await seedStudent({
		teacherEmail,
		name: STUDENT_2,
		email: st2Email,
		onboarded: true,
	});
	await seedStudent({ teacherEmail, name: STUDENT_3 });
	await seedUserViaE2e(request, {
		email: st2Email,
		name: STUDENT_2,
		role: "student",
		emailVerified: true,
	});

	// 1. Create class scheduled on a non-today Vietnam weekday
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog
		.getByRole("button", { name: tomorrowWeekdayLabel, exact: true })
		.click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 2. Enroll HV1 (active) and HV2 (stays invited)
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	let enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_1 }).click();
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

	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_2 }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	// 3. Create 1 ready prompt
	await page.goto("/teacher/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Complete the grammar review and write a short paragraph.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 4. Open class -> Assign prompt -> verify invited student notice -> initially 0/1 đã nộp
	await page.goto("/teacher/classes");
	await page.getByText(CLASS_NAME).click();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao bài tập", exact: true }).click();
	const assignDialog = page.getByRole("dialog", {
		name: new RegExp(`Giao bài tập · ${CLASS_NAME}`),
	});
	await expect(assignDialog).toBeVisible();
	await expect(
		assignDialog.getByTestId("assign-modal-invited-notice"),
	).toContainText(
		"Còn 1 học viên đang chờ xác nhận — sẽ tự nhận bài khi kích hoạt trước hạn nộp.",
	);

	await assignDialog
		.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
		.click();
	const createResPromise = page.waitForResponse(
		(r) =>
			r.url().includes("/api/classes/") &&
			r.url().endsWith("/assignments") &&
			r.request().method() === "POST",
	);
	await assignDialog
		.getByRole("button", { name: "Giao bài tập", exact: true })
		.click();
	const createRes = await createResPromise;
	expect(createRes.status()).toBe(201);
	const { id: assignmentId } = (await createRes.json()) as { id: string };
	await expect(assignDialog).toBeHidden();
	await expect(page.locator("#assigned-list")).toContainText("0/1 đã nộp");

	// 5. Activate HV2 -> denominator auto-updates to 0/2 đã nộp & HV2 opens quiz with 200
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();

	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(page.locator("#assigned-list")).toContainText("0/2 đã nộp");
	await expect(page.locator("#assigned-list")).toContainText(STUDENT_1);
	await expect(page.locator("#assigned-list")).toContainText(STUDENT_2);

	const studentContext = await browser.newContext({ baseURL: LMS_ORIGIN });
	try {
		const signInRes = await studentContext.request.post(
			`${API_ORIGIN}/api/auth/sign-in/email`,
			{
				headers: {
					"Content-Type": "application/json",
					Origin: LMS_ORIGIN,
				},
				data: {
					email: st2Email,
					password: "password-8chars",
				},
			},
		);
		expect(signInRes.status()).toBe(200);

		const quizRes = await studentContext.request.get(
			`${API_ORIGIN}/api/student/assignments/${assignmentId}/quiz`,
			{ headers: { Origin: LMS_ORIGIN } },
		);
		expect(quizRes.status()).toBe(200);
	} finally {
		await studentContext.close();
	}

	// 6. Shift due_at into the past -> verify Dashboard Card 2 & Hero summary
	const shiftRes = await request.post(`${API_ORIGIN}/__e2e/study-pack-shift`, {
		data: {
			assignmentId,
			dueAtMs: Date.now() - 60_000,
		},
	});
	expect(shiftRes.ok()).toBe(true);

	await page.goto("/teacher/dashboard");
	const gradingCard = page.getByTestId("reminder-card-grading");
	await expect(gradingCard).toBeVisible();
	await expect(gradingCard).toContainText("Không còn bài quá hạn chấm");
	await expect(gradingCard).not.toContainText("Đã hoàn tất hôm nay");
	await expect(
		gradingCard.getByTestId("reminder-card-grading-overdue-unsubmitted"),
	).toContainText("Còn 2 bài quá hạn chưa nộp (2 học viên)");

	const heroSummary = page.getByTestId("dashboard-hero-summary");
	await expect(heroSummary).toContainText("Còn 2 học viên cần kiểm tra.");
	await expect(heroSummary).not.toContainText("Mọi việc hôm nay đã xong.");

	// 7. Enroll & activate HV3 AFTER deadline -> shows "Giao 2/3 HV" + "Giao bổ sung" -> click -> 0/3 đã nộp
	await page.goto("/teacher/classes");
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_3 }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	await page.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();

	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const assignedList = page.locator("#assigned-list");
	await expect(assignedList).toContainText("0/2 đã nộp");
	await expect(assignedList).toContainText("Giao 2/3 HV");
	await expect(assignedList).toContainText("Còn 1 học viên chưa được giao");
	const addTargetsBtn = assignedList.getByRole("button", {
		name: "Giao bổ sung",
	});
	await expect(addTargetsBtn).toBeVisible();
	await addTargetsBtn.click();

	await expect(assignedList).toContainText("0/3 đã nộp");
	await expect(assignedList).toContainText(STUDENT_3);
	await expect(
		assignedList.getByRole("button", { name: "Giao bổ sung" }),
	).toHaveCount(0);
});

test("#982: checkbox học viên bấm trực tiếp không bị span chặn, hoạt động bàn phím, và Chọn tất cả 3 trạng thái", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 982 Lớp Checkbox";
	const STUDENT_1 = "An Học viên 1";
	const STUDENT_2 = "Bình Học viên 2";
	const PROMPT_TITLE = "QC-982 Prompt Checkbox";

	const teacherEmail = await signUpViaApi(page);
	await seedStudent({ teacherEmail, name: STUDENT_1 });
	await seedStudent({ teacherEmail, name: STUDENT_2 });

	// 1. Tạo lớp
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 2. Enroll & kích hoạt đúng thứ tự An trước -> Bình sau (khớp classGroup.studentIds)
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });

	for (const studentName of [STUDENT_1, STUDENT_2]) {
		await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
		const enrollDialog = page.getByRole("dialog");
		await enrollDialog.getByRole("option", { name: studentName }).click();
		await enrollDialog
			.getByRole("button", { name: "Lưu", exact: true })
			.click();
		await expect(enrollDialog).toBeHidden();

		await page.getByRole("button", { name: "Kích hoạt" }).first().click();
		await expect(confirmModal).toBeVisible();
		await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
		await expect(confirmModal).toBeHidden();
	}

	// 3. Tạo 1 đề ready
	await page.goto("/teacher/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people believe public libraries are essential.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 4. Mở hộp thoại Giao bài tập
	await page.goto("/teacher/classes");
	await page.getByText(CLASS_NAME).click();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao bài tập", exact: true }).click();
	const assignDialog = page.getByRole("dialog", {
		name: new RegExp(`Giao bài tập · ${CLASS_NAME}`),
	});
	await expect(assignDialog).toBeVisible();

	const selectAll = assignDialog.getByRole("checkbox", {
		name: "Chọn tất cả",
		exact: true,
	});
	const scopeBadge = assignDialog.getByTestId("assign-students-scope-badge");
	const submitBtn = assignDialog.getByRole("button", {
		name: "Giao bài tập",
		exact: true,
	});
	await expect(selectAll).toBeVisible();
	await expect(selectAll).toBeChecked();
	await expect(scopeBadge).toHaveText("Cả lớp");
	await expect(assignDialog.getByText("(2/2)")).toBeVisible();

	// Chọn đề sẵn sàng trước để kiểm chứng disabled tại (0/2) phản ánh đúng studentsOk === false
	await assignDialog
		.getByRole("button", { name: new RegExp(PROMPT_TITLE) })
		.click();
	await expect(submitBtn).toBeEnabled();

	// 5. Kiểm chứng accessible name sạch (không dính Avatar) và hit-test tâm checkbox trúng INPUT
	const st1Checkbox = assignDialog.getByRole("checkbox", {
		name: STUDENT_1,
		exact: true,
	});
	const st2Checkbox = assignDialog.getByRole("checkbox", {
		name: STUDENT_2,
		exact: true,
	});
	await st2Checkbox.scrollIntoViewIfNeeded();
	const st2Box = await st2Checkbox.boundingBox();
	expect(st2Box).not.toBeNull();
	if (!st2Box) throw new Error("Missing bounding box for st2Checkbox");
	expect(st2Box.width).toBeGreaterThanOrEqual(16);
	expect(st2Box.height).toBeGreaterThanOrEqual(16);

	const hitResult = await page.evaluate(
		({ cx, cy }) => {
			const el = document.elementFromPoint(cx, cy);
			return {
				tagName: el?.tagName ?? null,
				type: el instanceof HTMLInputElement ? el.type : null,
			};
		},
		{
			cx: st2Box.x + st2Box.width / 2,
			cy: st2Box.y + st2Box.height / 2,
		},
	);
	expect(hitResult).toEqual({ tagName: "INPUT", type: "checkbox" });

	// 6. Bỏ tick trực tiếp (KHÔNG force: true) -> indeterminate + Chọn lọc
	await st2Checkbox.uncheck();
	await expect(st2Checkbox).not.toBeChecked();
	await expect(selectAll).not.toBeChecked();
	await expect(selectAll).toHaveJSProperty("indeterminate", true);
	await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
	await expect(scopeBadge).toHaveText("Chọn lọc");
	await expect(assignDialog.getByText("(1/2)")).toBeVisible();

	// 7. Điều hướng bàn phím (Tab + Space) qua 3 trạng thái
	await selectAll.focus();
	await expect(selectAll).toBeFocused();
	await page.keyboard.press("Space");
	await expect(selectAll).toBeChecked();
	await expect(selectAll).toHaveJSProperty("indeterminate", false);
	await expect(scopeBadge).toHaveText("Cả lớp");
	await expect(submitBtn).toBeEnabled();

	await page.keyboard.press("Space");
	await expect(selectAll).not.toBeChecked();
	await expect(selectAll).toHaveJSProperty("indeterminate", false);
	await expect(scopeBadge).toHaveText("Chưa chọn");
	await expect(assignDialog.getByText("(0/2)")).toBeVisible();
	await expect(assignDialog.getByText("Chưa chọn học viên")).toBeVisible();
	await expect(submitBtn).toBeDisabled();

	await page.keyboard.press("Tab");
	await expect(st1Checkbox).toBeFocused();
	await page.keyboard.press("Space");
	await expect(st1Checkbox).toBeChecked();
	await expect(selectAll).toHaveJSProperty("indeterminate", true);
	await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
	await expect(scopeBadge).toHaveText("Chọn lọc");
	await expect(assignDialog.getByText("(1/2)")).toBeVisible();
	await expect(submitBtn).toBeEnabled();

	// 8. Kiểm tra reflow 4 viewport × 2 theme Light/Dark + chụp 6 ảnh POT opt-in
	const capturePot = process.env.CAPTURE_POT_982 === "1";
	const potDir = resolve(REPO_ROOT, "plans/reports");
	if (capturePot) {
		mkdirSync(potDir, { recursive: true });
	}
	const studentsFieldset = assignDialog.locator(
		'fieldset[aria-labelledby="assignment-students-heading"]',
	);
	const modalBody = assignDialog.locator("> div.overflow-y-auto");
	const studentScrollList = studentsFieldset.locator(".overflow-y-auto");

	for (const vp of [
		{ name: "1440x900", width: 1440, height: 900, capture: true },
		{ name: "768x1024", width: 768, height: 1024, capture: true },
		{ name: "375x812", width: 375, height: 812, capture: true },
		{ name: "320x812", width: 320, height: 812, capture: false },
	] as const) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate((t) => {
				if (t === "dark") {
					window.localStorage.setItem("theme", "dark");
					document.documentElement.classList.add("dark");
				} else {
					window.localStorage.removeItem("theme");
					document.documentElement.classList.remove("dark");
				}
			}, theme);
			const hasDark = await page.evaluate(() =>
				document.documentElement.classList.contains("dark"),
			);
			expect(hasDark).toBe(theme === "dark");

			await studentsFieldset.scrollIntoViewIfNeeded();
			const docOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth,
			);
			expect(docOverflow).toBe(false);
			const dialogOverflow = await assignDialog.evaluate(
				(el) => el.scrollWidth > el.clientWidth + 1,
			);
			expect(dialogOverflow).toBe(false);
			const bodyOverflow = await modalBody.evaluate(
				(el) => el.scrollWidth > el.clientWidth + 1,
			);
			expect(bodyOverflow).toBe(false);
			const listOverflow = await studentScrollList.evaluate(
				(el) => el.scrollWidth > el.clientWidth + 1,
			);
			expect(listOverflow).toBe(false);

			if (capturePot && vp.capture) {
				await page.screenshot({
					path: resolve(potDir, `982-assign-modal-${vp.name}-${theme}.png`),
				});
			}
		}
	}

	await page.evaluate(() => {
		window.localStorage.removeItem("theme");
		document.documentElement.classList.remove("dark");
	});
	await page.setViewportSize({ width: 1280, height: 800 });

	// 9. Giao chọn lọc (1/2 học viên) -> kiểm chứng payload targetScope: "selected" & danh sách đã giao
	const createResPromise = page.waitForResponse(
		(r) =>
			r.url().includes("/api/classes/") &&
			r.url().endsWith("/assignments") &&
			r.request().method() === "POST",
	);
	await submitBtn.click();
	const createRes = await createResPromise;
	expect(createRes.status()).toBe(201);
	const submittedBody = createRes.request().postDataJSON() as {
		studentIds?: string[];
		targetScope?: string;
	} | null;
	expect(submittedBody).not.toBeNull();
	expect(submittedBody?.studentIds).toHaveLength(1);
	expect(submittedBody?.targetScope).toBe("selected");

	await expect(assignDialog).toBeHidden();
	await expect(
		page.getByText(`Đã giao “${PROMPT_TITLE}” cho 1 học viên.`),
	).toBeVisible();
	const assignedList = page.locator("#assigned-list");
	const assignedRows = assignedList.locator(".sub-row");
	const missingBanner = assignedList.locator(
		'[data-testid^="assign-missing-students-"]',
	);
	await expect(assignedList).toContainText("0/1 đã nộp");
	await expect(assignedList).toContainText("Giao 1/2 HV");
	await expect(assignedRows).toHaveCount(1);
	await expect(
		assignedRows.getByText(STUDENT_1, { exact: true }),
	).toBeVisible();
	await expect(assignedRows.getByText(STUDENT_2)).toHaveCount(0);
	await expect(missingBanner).toContainText(
		`Còn 1 học viên chưa được giao: ${STUDENT_2}`,
	);
	await expect(
		missingBanner.getByRole("button", { name: "Giao bổ sung", exact: true }),
	).toBeVisible();
});
