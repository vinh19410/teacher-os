import { expect, test } from "@playwright/test";
import {
	fillRichEditor,
	orgIdForTeacherEmail,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * Issue #202 — bank-first assignment prompt creation: compose → save to the
 * bank → see it listed → survive a reload. Both statuses (ready + draft)
 * must create real kernel rows.
 */
test("create a ready prompt, list it, and survive reload", async ({ page }) => {
	const TITLE = "QC-202 Discuss both views";

	await signUpViaUi(page);
	await page.goto("/assignments");
	await page.getByRole("button", { name: "+ Tạo bài tập" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);

	// Design v3 + form-trống (29eee03): blank form blocks ready save.
	await expect(page.getByRole("heading", { name: TITLE })).toBeHidden();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }),
	).toBeDisabled();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people think that all university students should study whatever they like.\n\nDiscuss both these views and give your own opinion.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();

	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// "Tạo đề khác" returns to the form (#213: the create page no longer
	// shows the bank — persistence is asserted on the assignments page instead).
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.goto("/assignments");
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(page.getByText("Sẵn sàng").first()).toBeVisible();

	// Persist for real: a full reload keeps the prompt in the list.
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a draft prompt with the draft tag", async ({ page }) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-202 Bản nháp");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people believe that unpaid community service…",
	);
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();

	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.goto("/assignments");
	await expect(page.getByText("QC-202 Bản nháp").first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();
});

test("preview as a student, return to the form without losing it, then save ready", async ({
	page,
}) => {
	const TITLE = "QC-202 Preview Flow";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people believe that preview should match the student view…",
	);

	// Preview is a page handoff now, not an inline paper.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(
		page.getByText(/Some people believe that preview/).first(),
	).toBeVisible();
	await expect(
		page.getByText("Bản xem trước — bài làm không được lưu."),
	).toBeVisible();
	await expect(page.getByText("Bài làm của học viên (mô phỏng)")).toBeVisible();

	// readPreviewDraft must not clear: reload keeps the paper.
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();

	// Back to composing: the form survives the round trip.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	// contenteditable: assert rendered text, not textarea value
	await expect(page.getByLabel("Nội dung đề")).toHaveText(
		/Some people believe that preview/,
	);

	// And the restored form still saves for real.
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await page.goto("/assignments");
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a ready reading prompt with answer key, survive reload", async ({
	page,
}) => {
	const TITLE = "QC-218 Reading TFNG";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	// Select Reading skill
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText("Reading Academic")).toBeVisible();

	// The form starts blank: ready save is blocked until core content exists.
	const submitBtn = page
		.getByRole("button", { name: "Lưu vào ngân hàng" })
		.first();
	await expect(submitBtn).toBeDisabled();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs found across India...",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("The first statement describes the stepwells.");
	// TFNG key: pick the TRUE chip from the answer-key grid (phase-01 FR1 —
	// chips carry per-row aria-labels `Câu n: <choice>`).
	await page.getByRole("button", { name: "Câu 1: TRUE" }).click();

	await expect(submitBtn).toBeEnabled();
	await submitBtn.click();

	// Success card assertions
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 1/1 đáp án đã khóa")).toBeVisible();

	// Assert the post-save view does not leak the answer key: the locked-in
	// answer ("TRUE") must be absent from the success view, not just the
	// editor's key-scan header.
	expect(await page.getByText("TRUE", { exact: true }).count()).toBe(0);
	expect(
		await page.getByText("Đáp án đúng · học viên không thấy").count(),
	).toBe(0);

	// Navigate to assignments and filter by Reading
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();

	// Persist across reload
	await page.reload();
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("create a listening draft without audio; ready is blocked", async ({
	page,
}) => {
	const TITLE = "QC-218 Listening Draft";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	// Select Listening skill
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);

	// Ready mode is blocked because audio is missing
	await page.getByRole("button", { name: "Sẵn sàng giao" }).click();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu file nghe")).toBeVisible();

	// Attach an audio file through the real file input (no sample content —
	// the form ships blank since commit 29eee03).
	await page.locator('input[type="file"]').setInputFiles({
		name: "qc-218-listening.mp3",
		mimeType: "audio/mpeg",
		buffer: Buffer.from("fake audio bytes"),
	});

	// Audio alone is not enough: the blank question still blocks ready —
	// the answer-key gate outranks the core-content copy.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu đáp án chấm tự động")).toBeVisible();

	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Clarke speaks about the community project.");
	await page.getByLabel("Đáp án chấm tự động").first().fill("Clarke");
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();

	// Clear the answer: ready blocks again
	await page.getByLabel("Đáp án chấm tự động").first().fill("");
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu đáp án chấm tự động")).toBeVisible();

	// Restore answer and remove audio
	await page.getByLabel("Đáp án chấm tự động").first().fill("Clarke");
	await page.getByRole("button", { name: "Gỡ file" }).click();

	// Switch to draft mode allows saving without audio
	await page.getByRole("button", { name: "Bản nháp" }).click();
	const draftSubmit = page
		.getByRole("button", { name: "Lưu bản nháp" })
		.first();
	await expect(draftSubmit).toBeEnabled();
	await draftSubmit.click();

	// Success card assertions
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();
	await expect(page.getByText("Chưa đính file").first()).toBeVisible();
	await expect(page.getByText("Tự động · 1/1 đáp án đã khóa")).toBeVisible();

	// Check assignments page
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await expect(page.getByText(TITLE).first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();
});

/**
 * Phase-01 (authoring UX quick wins): answer-key grid + chống mất dữ liệu +
 * autosave draft. The scenarios below pin the FR1/FR3/FR5/FR6/FR7 behaviors.
 */

test("author a 3-question tfng set with grid clicks only (FR1)", async ({
	page,
}) => {
	const TITLE = "QC-271 Grid TFNG";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs…",
	);

	// Row 1 exists out of the box; add two more via the gated button.
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("The first statement matches the passage.");
	await page.getByRole("button", { name: "Câu 1: TRUE" }).click();
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("The second statement contradicts the passage.");
	await page.getByRole("button", { name: "Câu 2: FALSE" }).click();
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(2)
		.fill("The third statement is not covered.");
	await page.getByRole("button", { name: "Câu 3: NOT GIVEN" }).click();

	// The key-scan footer mirrors real question numbers (reading p1 → 1..3).
	await expect(page.getByText("1 TRUE · 2 FALSE · 3 NOT GIVEN")).toBeVisible();

	const submitBtn = page
		.getByRole("button", { name: "Lưu vào ngân hàng" })
		.first();
	await expect(submitBtn).toBeEnabled();
	await submitBtn.click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 3/3 đáp án đã khóa")).toBeVisible();

	await page.goto("/assignments");
	await page.reload();
	await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("grid keyboard shortcuts: letter keys pick chips, Enter adds, Backspace removes (FR3)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill("QC-271 Grid Keyboard");

	const row0 = page.locator('[data-qindex="0"]');
	// Typing inside the stem input must never hijack letters into chips.
	await row0
		.getByLabel("Nội dung câu hỏi phía học viên")
		.fill("Statement with t and n letters");
	await expect(
		page.getByRole("button", { name: "Câu 1: TRUE" }),
	).toHaveAttribute("aria-pressed", "false");

	// Row-focused letter key picks the chip (t → TRUE).
	await row0.focus();
	await page.keyboard.press("t");
	await expect(
		page.getByRole("button", { name: "Câu 1: TRUE" }),
	).toHaveAttribute("aria-pressed", "true");

	// Enter adds the next question; Backspace on an empty row removes it.
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await expect(page.locator('[data-qindex="1"]')).toBeVisible();
	await row0.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator('[data-qindex="2"]')).toBeVisible();
	await page.locator('[data-qindex="2"]').focus();
	await page.keyboard.press("Backspace");
	await expect(page.locator('[data-qindex="2"]')).toHaveCount(0);
	// The authored row and key survived the row churn.
	await expect(
		page.getByRole("button", { name: "Câu 1: TRUE" }),
	).toHaveAttribute("aria-pressed", "true");
});

test("refresh mid-edit restores the autosave draft; Hủy clears it for good (FR6)", async ({
	page,
}) => {
	const TITLE = "QC-271 Draft Restore";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs…",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("The first statement describes the stepwells.");
	await page.getByRole("button", { name: "Câu 1: TRUE" }).click();

	// Wait for the 1s autosave debounce to actually land, then simulate an
	// accidental reload.
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("assignment-draft")))
		.not.toBeNull();
	await page.reload();

	await expect(page.getByText("Đã phục hồi bản nháp")).toBeVisible();
	await page.getByRole("button", { name: "Tiếp tục" }).click();
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue(/first statement describes/);
	await expect(
		page.getByRole("button", { name: "Câu 1: TRUE" }),
	).toHaveAttribute("aria-pressed", "true");

	// Editing again re-arms autosave; this time discard via the banner Hủy.
	await page.getByLabel("Tiêu đề").fill(`${TITLE} v2`);
	await expect
		.poll(() =>
			page.evaluate(() =>
				localStorage.getItem("assignment-draft")?.includes("v2"),
			),
		)
		.toBe(true);
	await page.reload();
	await expect(page.getByText("Đã phục hồi bản nháp")).toBeVisible();
	// Scope to the banner: the form toolbar also has a Hủy button.
	await page.getByRole("status").getByRole("button", { name: "Hủy" }).click();
	await expect(page.getByLabel("Tiêu đề")).toHaveValue("");
	// The discarded draft must not resurrect on the next visit.
	await page.reload();
	await expect(page.getByText("Đã phục hồi bản nháp")).toBeHidden();
});

test("preview draft beats the autosave restore banner (FR6 precedence)", async ({
	page,
}) => {
	const TITLE = "QC-271 Preview Beats Banner";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	// Listening so the transcript round trip is exercised (FR6 bug fix).
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Transcript (chỉ giáo viên)",
		"W: Good morning. M: Hello!",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Name of caller:");
	await page.getByLabel("Đáp án chấm tự động").first().fill("Clarke");
	// Autosave lands in localStorage too (1s debounce).
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("assignment-draft")))
		.not.toBeNull();

	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);

	// Preview draft won: no banner, form fully restored including transcript.
	await expect(page.getByText("Đã phục hồi bản nháp")).toBeHidden();
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await expect(page.getByLabel("Transcript (chỉ giáo viên)")).toHaveText(
		/Good morning/,
	);
});

test("type change with authored content confirms; same-skill keeps transcript (FR5)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill("QC-271 Carry Transcript");
	await fillRichEditor(
		page,
		"Transcript (chỉ giáo viên)",
		"W: Good morning. M: Hello!",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Name of caller:");
	await page.getByLabel("Đáp án chấm tự động").first().fill("Clarke");

	let confirms = 0;
	// First confirm is cancelled, the retry is accepted — both branches of
	// the confirm gate get exercised (a type-based handler would always
	// dismiss and leave the accept path untested, review #1).
	page.on("dialog", (dialog) => {
		confirms += 1;
		void (confirms === 2 ? dialog.accept() : dialog.dismiss());
	});

	// Re-clicking the already-selected type chip must NOT confirm nor wipe
	// (ChipFilter re-fire guard, #269). Wait out the async dialog event
	// before counting — a sync assert can false-pass mid-race.
	await page.getByRole("button", { name: "Form completion" }).click();
	await page.waitForTimeout(300);
	await expect.poll(() => confirms).toBe(0);
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("Name of caller:");
	await expect(page.getByLabel("Đáp án chấm tự động").first()).toHaveValue(
		"Clarke",
	);

	// First real change: teacher cancels → nothing is wiped.
	await page.getByRole("button", { name: "Multiple choice" }).click();
	await expect.poll(() => confirms).toBe(1);
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("Name of caller:");

	// Second change: teacher accepts → type changes, transcript carries over
	// within the same skill, answers reset.
	await page.getByRole("button", { name: "Multiple choice" }).click();
	await expect.poll(() => confirms).toBe(2);
	await expect(
		page.getByRole("button", { name: "Câu 1: A" }).first(),
	).toBeVisible();
	await expect(page.getByLabel("Transcript (chỉ giáo viên)")).toHaveText(
		/Good morning/,
	);
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("");
});

test("skill change with authored content confirms and resets on accept (FR5)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill("QC-271 Skill Confirm");
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs…",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("The first statement describes the stepwells.");
	await page.getByRole("button", { name: "Câu 1: TRUE" }).click();

	let confirms = 0;
	// Cancel first, accept on retry — see the FR5 type-change test above.
	page.on("dialog", (dialog) => {
		confirms += 1;
		void (confirms === 2 ? dialog.accept() : dialog.dismiss());
	});

	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await expect.poll(() => confirms).toBe(1);
	// Dismissed: authored content untouched.
	await expect(page.getByLabel("Đoạn đọc")).toHaveText(/Stepwells/);
	await expect(
		page.getByRole("button", { name: "Câu 1: TRUE" }),
	).toHaveAttribute("aria-pressed", "true");

	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await expect.poll(() => confirms).toBe(2);
	// Accepted: reading fields are gone, fresh single listening row.
	await expect(page.getByLabel("Đoạn đọc")).toHaveCount(0);
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("");
});

test("bulk key paste maps by question number and reports per-line errors (FR7)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill("QC-271 Bulk Paste");
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page.getByRole("button", { name: "Thêm câu" }).click();

	await page.getByRole("button", { name: "Thêm key hàng loạt" }).click();
	// Line 3 targets Q3 (not the 3rd pasted line); Q9 is out of range; the
	// last line is unparsable — valid lines must still apply.
	await page
		.getByLabel("Nội dung key dán vào")
		.fill("1. TRUE\n2. TRUE\n3. FALSE\n9. NOT GIVEN\nhello");
	await page.getByRole("button", { name: "Áp dụng" }).click();

	await expect(page.getByText("3/5 dòng đã áp dụng")).toBeVisible();
	await expect(page.getByText(/Dòng 4: Q9 ngoài phạm vi/)).toBeVisible();
	await expect(page.getByText(/Dòng 5: .*không đọc được/)).toBeVisible();
	// Keys landed on the right rows: 1 TRUE, 2 TRUE, 3 FALSE.
	await expect(page.getByText("1 TRUE · 2 TRUE · 3 FALSE")).toBeVisible();
});

test("author answer explanation, preserve through preview and test-builder update, and deliver to student review (#571)", async ({
	page,
	browser,
}) => {
	test.setTimeout(180_000);
	const TITLE = `QC-571 Explanation ${Date.now()}`;
	const INITIAL_EXPLANATION = "Đoạn 1 nói rõ thông tin này sai.";
	const UPDATED_EXPLANATION = "Đoạn 1 nói rõ thông tin này sai (bản cập nhật).";
	const studentEmail = `student-571-${Date.now()}@test.local`;

	const teacherEmail = await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Stepwells are underground reservoirs found across western India.",
	);
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Stepwells were built above ground.");
	await page.getByRole("button", { name: "Câu 1: FALSE", exact: true }).click();

	// Gõ từng phím thật (có chữ 'n' và 't') để khóa chống lỗi phím tắt đáp án lật FALSE -> NOT GIVEN / TRUE.
	const explanationEditor = page.getByLabel("Giải thích câu 1", {
		exact: true,
	});
	await explanationEditor.click();
	await explanationEditor.pressSequentially(INITIAL_EXPLANATION);
	await expect(
		page.getByRole("button", { name: "Câu 1: FALSE", exact: true }),
	).toHaveAttribute("aria-pressed", "true");

	// Xem trước -> Làm thử & Soi bài: ẩn ở take, hiện ở review, giữ nguyên khi quay lại.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await page.getByRole("tab", { name: "Làm thử & Soi bài" }).click();
	await expect(page.getByText(INITIAL_EXPLANATION)).toHaveCount(0);
	await page.getByRole("button", { name: /Nộp bài/ }).click();
	await page.getByText("Giải thích", { exact: true }).click();
	await expect(page.getByText(INITIAL_EXPLANATION)).toBeVisible();

	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(
		page.getByLabel("Giải thích câu 1", { exact: true }),
	).toContainText(INITIAL_EXPLANATION);

	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Full-Test Builder: gán vào Passage 1 -> Chỉnh sửa -> sửa giải thích -> Cập nhật đề.
	await page.goto("/assignments/tests/new");
	await page.getByRole("button", { name: "Chọn từ ngân hàng" }).first().click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: new RegExp(TITLE) })
		.click();
	await page.getByRole("button", { name: "Chỉnh sửa" }).click();
	await expect(
		page.getByLabel("Giải thích câu 1", { exact: true }),
	).toContainText(INITIAL_EXPLANATION);
	await fillRichEditor(page, "Giải thích câu 1", UPDATED_EXPLANATION);
	await page.getByRole("button", { name: "Cập nhật đề" }).click();
	await expect(page.getByRole("button", { name: "Cập nhật đề" })).toBeHidden();

	// Seed lớp + học viên active trong cùng org của giáo viên rồi giao đề vừa cập nhật.
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	const fixture = await seedQuizFixture({
		orgName: "Org 571",
		orgId,
		className: "Lớp Reading 571",
		studentName: "Học viên 571",
		studentEmail,
		prompts: [],
	});
	await page.goto(`/classes/${fixture.classId}`);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao bài tập" }).first().click();
	await page.getByRole("button", { name: new RegExp(TITLE) }).click();
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();

	// Browser context riêng cho học viên tránh đụng cookie localhost với giáo viên.
	const studentCtx = await browser.newContext();
	try {
		const studentPage = await studentCtx.newPage();
		const quizPayloadPromises: Promise<string>[] = [];
		studentPage.on("response", (res) => {
			if (
				res.request().method() === "GET" &&
				/\/api\/student\/assignments\/[^/]+\/quiz$/.test(res.url())
			) {
				quizPayloadPromises.push(res.text().catch(() => ""));
			}
		});

		await studentPage.goto(`${STUDENT_ORIGIN}/login`);
		await studentPage.locator("#tab-signup").click();
		await studentPage.locator("#signup-name").fill("Học viên 571");
		await studentPage.locator("#signup-email").fill(studentEmail);
		await studentPage.locator("#signup-password").fill("password-8chars");
		await studentPage.locator("#panel-signup button[type='submit']").click();
		await expect(studentPage.getByText("Email chưa được xác thực")).toBeVisible(
			{ timeout: 15_000 },
		);
		await verifyStudentEmailFromMailLog(studentPage, studentEmail);
		await expect(studentPage).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
			timeout: 30_000,
		});

		await studentPage.getByRole("link", { name: `Làm bài: ${TITLE}` }).click();
		const startDialog = studentPage.getByRole("alertdialog", {
			name: "Bắt đầu làm bài",
		});
		const progress = studentPage.getByTestId("navigator-progress");
		await expect(progress.or(startDialog)).toBeVisible();
		if (await startDialog.isVisible()) {
			await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
		}
		await expect(progress).toBeVisible();

		// Không lộ giải thích trên DOM hoặc wire payload khi đang làm bài (in_progress).
		await expect(studentPage.getByText(UPDATED_EXPLANATION)).toHaveCount(0);
		const quizPayloads = await Promise.all(quizPayloadPromises);
		expect(quizPayloads.length).toBeGreaterThan(0);
		for (const raw of quizPayloads) {
			expect(raw).not.toContain("explanation");
			expect(raw).not.toContain("Đoạn 1 nói rõ");
		}

		await studentPage
			.locator('[data-question="0"] label', { hasText: "FALSE" })
			.click();
		await expect(studentPage.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);
		await studentPage.getByRole("button", { name: "Nộp bài" }).click();
		await expect(studentPage).toHaveURL(/\/learn\/quizzes\/attempt\//);

		await studentPage
			.getByRole("link", { name: "Xem chi tiết bài làm" })
			.click();
		await expect(studentPage).toHaveURL(/\/detail$/);
		await studentPage.getByText("Giải thích", { exact: true }).click();
		await expect(studentPage.getByText(UPDATED_EXPLANATION)).toBeVisible();
	} finally {
		await studentCtx.close();
	}
});
