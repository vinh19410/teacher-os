import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fillRichEditor, seedStudent, signUpViaUi } from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * Issue #208 — Giao bài trên lớp:
 * class detail → tab Bài tập → assign view → submit → success → list view with
 * derived submission status → reload → verify "Đã dùng 1 lớp" in bank → reassign
 * warning → verify "Đã dùng 1 lớp" stays distinct after reassign.
 */
test("class detail → assign prompt → verify list, bank tag, and reassign", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 208 Lớp Writing";
	const STUDENT_NAME = "QC-208 Học viên";
	const PROMPT_TITLE = "QC-208 Prompt Ready";

	// 1. Sign-up & seed student
	const teacherEmail = await signUpViaUi(page);
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
	await page.goto("/assignments/new");
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

	// 7. Click "Giao bài tập"
	await page.getByRole("button", { name: "Giao bài tập" }).first().click();

	// Picker shows ready prompt, but DOES NOT show draft prompt
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
	await expect(page.getByText("QC-208 Draft Prompt")).toHaveCount(0);

	// Select ready prompt
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();

	// Action bar copy reflects selection
	await expect(page.getByText("Giao cho 1 học viên")).toBeVisible();

	// 8. Submit assignment
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();

	// 9. Success view
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await expect(page.getByText("0/1", { exact: true }).first()).toBeVisible();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 10. Click "Xem bài đã giao" → List view
	await page.getByRole("button", { name: "Xem bài đã giao" }).click();
	await expect(page.getByText("Bài đã giao lớp này")).toBeVisible();
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();
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

	// 12. Go to /assignments → prompt has tag "Đã dùng 1 lớp"
	await page.goto("/assignments");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã dùng 1 lớp")).toBeVisible();

	// 13. Return to class → reassign the SAME prompt to the SAME class
	await page.goto("/classes");
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao thêm đề" }).click();

	// Pick same prompt → warning note appears
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await expect(page.getByText("Đề này đã giao lớp này, hạn")).toBeVisible();
	await expect(
		page.getByText("Giao lại sẽ thêm lượt mới cho học viên đã chọn."),
	).toBeVisible();

	// Submit reassign
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Xem bài đã giao" }).click();

	// Now there are 2 items in class assignments
	const items = page.locator(".assign-item");
	await expect(items).toHaveCount(2);

	// 14. Return to /assignments: tag MUST STILL BE "Đã dùng 1 lớp" (distinct classId)
	await page.goto("/assignments");
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
	await expect(page.getByText("Đã dùng 1 lớp")).toBeVisible();
	await expect(page.getByText("Đã dùng 2 lớp")).toHaveCount(0);
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
		const teacherEmail = await signUpViaUi(page);
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
		await page.goto("/assignments/new");
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

		// Navigate to class assign form
		await page.goto("/classes");
		await page.getByText(CLASS_NAME).click();
		await page
			.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
			.click();
		await page.getByRole("button", { name: "Giao bài tập" }).first().click();
		await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();

		const dueInput = page.locator("#assignment-due-input");
		const calendarBtn = page.getByRole("button", { name: "Chọn ngày" });
		const dueTimeInput = page.locator("#assignment-due-time-input");

		// 1. Keyboard focus order & Escape restore
		await dueInput.focus();
		await expect(dueInput).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(calendarBtn).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toBeHidden();
		await expect(calendarBtn).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(dueTimeInput).toBeFocused();

		// 2. Sequential typing under en-US locale: "06/11/2027" stays Nov 6 (never June 11)
		await dueInput.click();
		await dueInput.fill("");
		await dueInput.pressSequentially("06/11/2027");
		await expect(dueInput).toHaveValue("06/11/2027");
		await expect(page.getByTestId("assignment-due-preview")).toContainText(
			"Thứ Bảy, 06/11/2027",
		);

		// 3. 8-digit typing "09112027" never jumps segments ("10/09"); normalizes on blur
		await dueInput.fill("");
		await dueInput.pressSequentially("09112027");
		await dueInput.blur();
		await expect(dueInput).toHaveValue("09/11/2027");

		await dueTimeInput.fill("17:30");
		await dueTimeInput.blur();
		await expect(page.getByTestId("assignment-due-preview")).toContainText(
			"09/11/2027 lúc 17:30 (giờ Việt Nam)",
		);

		// 4. Calendar popover opens on November 2027 & picking Nov 15 updates input + preview
		await calendarBtn.click();
		await expect(page.getByText("Tháng 11, 2027")).toBeVisible();
		await page.getByRole("button", { name: "15/11/2027" }).click();
		await expect(dueInput).toHaveValue("15/11/2027");
		await expect(page.getByTestId("assignment-due-preview")).toContainText(
			"15/11/2027 lúc 17:30 (giờ Việt Nam)",
		);

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
				if (vp.capture) {
					await page.screenshot({
						path: `${shotDir}/assign-form-${vp.name}-${theme}.png`,
					});
				}

				await calendarBtn.click();
				await expect(page.getByRole("dialog")).toBeVisible();
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
				await expect(page.getByRole("dialog")).toBeHidden();
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
		await page.getByRole("button", { name: "Giao bài tập" }).last().click();
		const createRes = await createResPromise;
		expect(createRes.status()).toBe(201);
		const { id: assignmentId } = (await createRes.json()) as { id: string };
		expect(assignmentId).toBeTruthy();

		await expect(
			page.getByRole("heading", { name: "Đã giao bài tập" }),
		).toBeVisible();
		await expect(page.getByText("17:30 15/11/2027")).toBeVisible();

		await page.getByRole("button", { name: "Xem bài đã giao" }).click();
		await expect(page.getByText(/Hạn 17:30 15\/11\/2027/)).toBeVisible();
		await expect(page.getByText("Đang mở").first()).toBeVisible();

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
