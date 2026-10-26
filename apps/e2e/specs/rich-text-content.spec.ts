import { expect, test } from "@playwright/test";
import {
	adminOpenNewTestPage,
	ensureAdminAccount,
	fillRichEditor,
	signUpViaUi,
} from "./helpers";

/**
 * Rich text plan (issue #280) — end-to-end proof of the three headline
 * guarantees: formatting survives the save/reload round trip, XSS payloads
 * are stored but neutralized at render, and multi-line content keeps its
 * line breaks through the editor round trip.
 */

test("bold formatting persists through save and renders in the preview", async ({
	page,
}) => {
	const TITLE = "QC-280 Rich Bold Persist";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people believe that boldme formatting should survive.",
	);

	// Bold one word: select the editor content with a keyboard select-all
	// (ProseMirror applies it to its own state, so the toolbar click below
	// reliably bolds the selection; a native dblclick selection can race the
	// state sync). Two editors live on this page — scope to the toolbar that
	// belongs to the "Nội dung đề" editor.
	const promptEditor = page.getByLabel("Nội dung đề");
	const promptToolbar = promptEditor.locator(
		"xpath=../preceding-sibling::div[@role='toolbar']",
	);
	await promptEditor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await promptToolbar.getByRole("button", { name: "In đậm" }).click();
	await expect(promptEditor.locator("strong")).toContainText("boldme");

	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Bank row → aside preview renders real bold markup for students.
	await page.goto("/assignments");
	await page.getByRole("button", { name: new RegExp(TITLE) }).click();
	await expect(page.getByText("Xem trước phía học viên")).toBeVisible();
	await expect(
		page.locator("strong", { hasText: "boldme" }).first(),
	).toBeVisible();
});

test("XSS payload in rich text is stored but never executes at render", async ({
	page,
}) => {
	const TITLE = "QC-280 Rich XSS Neutralize";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);

	// fill() cannot inject HTML — dispatch a real paste event carrying HTML in
	// clipboardData so ProseMirror parses it into the document model.
	const editor = page.getByLabel("Nội dung đề");
	await editor.click();
	await page.evaluate(() => {
		const target = document.querySelector(".ProseMirror");
		if (!target) throw new Error("editor not mounted");
		const data = new DataTransfer();
		data.setData(
			"text/html",
			'<img src=x onerror="window.__pwned=1"><p>safe text</p>',
		);
		target.dispatchEvent(
			new ClipboardEvent("paste", {
				clipboardData: data,
				bubbles: true,
				cancelable: true,
			}),
		);
	});
	await expect(editor).toContainText("safe text");

	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Render the stored payload through the preview surface.
	await page.goto("/assignments");
	await page.getByRole("button", { name: new RegExp(TITLE) }).click();
	await expect(page.getByText("Xem trước phía học viên")).toBeVisible();
	await expect(page.getByText("safe text").first()).toBeVisible();
	// The handler never ran and no <img> element exists in the rendered paper.
	expect(
		await page.evaluate(() => (window as { __pwned?: string }).__pwned),
	).toBeUndefined();
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	await expect(page.locator("[onerror]")).toHaveCount(0);
});

test("multi-line prompt keeps its line breaks through the editor round trip", async ({
	page,
}) => {
	const TITLE = "QC-280 Rich Newlines";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(page, "Nội dung đề", "Dòng thứ nhất");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Dòng thứ hai");

	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	const paper = page.getByText("Xem trước phía học viên").locator("..");
	await expect(paper.getByText("Dòng thứ nhất")).toBeVisible();
	await expect(paper.getByText("Dòng thứ hai")).toBeVisible();
	// Two separate block lines, not one merged paragraph.
	const lines = await paper.evaluateAll((els) => {
		const el = els[0];
		return el?.textContent ?? "";
	});
	expect(lines).toContain("Dòng thứ nhất");
	expect(lines).toContain("Dòng thứ hai");
});

test("full-option toolbar structures persist and render for students", async ({
	page,
}) => {
	const TITLE = "QC-436 Rich Full Option";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(page, "Nội dung đề", "Phần giảng dạy chính");

	const promptEditor = page.getByLabel("Nội dung đề");
	const promptToolbar = promptEditor.locator(
		"xpath=../preceding-sibling::div[@role='toolbar']",
	);
	await promptEditor.click();
	await page.keyboard.press("ControlOrMeta+a");

	// Heading 2 on the whole line, then type a blockquote paragraph below.
	await promptToolbar.getByRole("button", { name: "Đề mục cấp 2" }).click();
	await expect(promptEditor.locator("h2")).toContainText(
		"Phần giảng dạy chính",
	);
	// Collapse the select-all range to its right edge (`End` on macOS Chromium
	// contenteditable only scrolls the viewport without collapsing a range).
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await promptToolbar.getByRole("button", { name: "Trích dẫn" }).click();
	await page.keyboard.type("Trích dẫn từ tài liệu");
	await expect(promptEditor.locator("blockquote")).toContainText(
		"Trích dẫn từ tài liệu",
	);

	// Horizontal rule after the quote — momentary button, no aria-pressed.
	await promptToolbar.getByRole("button", { name: "Đường kẻ ngang" }).click();
	await expect(promptEditor.locator("hr")).toHaveCount(1);

	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Student-facing preview keeps the structure (h2 + blockquote + hr).
	await page.goto("/assignments");
	await page.getByRole("button", { name: new RegExp(TITLE) }).click();
	await expect(page.getByText("Xem trước phía học viên")).toBeVisible();
	const paper = page.getByText("Xem trước phía học viên").locator("..");
	await expect(paper.locator("h2")).toContainText("Phần giảng dạy chính");
	await expect(paper.locator("blockquote")).toContainText(
		"Trích dẫn từ tài liệu",
	);
	await expect(paper.locator("hr")).toHaveCount(1);
});

// Issue #438 — link popover replaces window.prompt: authoring side gets an
// in-app popover with a scheme allowlist, and the link must survive the
// save/render round trip for students.
test("link popover persists an allowlisted href and renders for students", async ({
	page,
}) => {
	const TITLE = "QC-438 Rich Link Popover";

	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(page, "Nội dung đề", "Tài liệu đọc thêm");

	const promptEditor = page.getByLabel("Nội dung đề");
	const promptToolbar = promptEditor.locator(
		"xpath=../preceding-sibling::div[@role='toolbar']",
	);
	await promptEditor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await promptToolbar.getByRole("button", { name: "Chèn liên kết" }).click();

	const linkInput = page.getByLabel("Địa chỉ liên kết");
	await expect(linkInput).toBeFocused();
	await linkInput.fill("https://example.com/de-tai");
	await linkInput.press("Enter");
	await expect(linkInput).toHaveCount(0);
	await expect(promptEditor.locator("a")).toHaveAttribute(
		"href",
		"https://example.com/de-tai",
	);

	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.goto("/assignments");
	await page.getByRole("button", { name: new RegExp(TITLE) }).click();
	await expect(page.getByText("Xem trước phía học viên")).toBeVisible();
	const paper = page.getByText("Xem trước phía học viên").locator("..");
	await expect(
		paper.locator("a[href='https://example.com/de-tai']"),
	).toContainText("Tài liệu đọc thêm");
});

// Case (d)+(h) e2e: an empty-selection apply becomes a stored mark — text
// typed next wraps in the link at the caret position — and the modal popover
// traps Tab focus inside its own dialog.
test("empty-selection link applies as a stored mark at the caret and traps focus", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");
	await fillRichEditor(page, "Nội dung đề", "Mở đầu");

	const promptEditor = page.getByLabel("Nội dung đề");
	const promptToolbar = promptEditor.locator(
		"xpath=../preceding-sibling::div[@role='toolbar']",
	);
	await promptEditor.click();
	await page.keyboard.press("End");
	await promptToolbar.getByRole("button", { name: "Chèn liên kết" }).click();

	const linkInput = page.getByLabel("Địa chỉ liên kết");
	await expect(linkInput).toBeFocused();
	// Modal trap: every Tab (and Shift+Tab) must stay inside the dialog. The
	// trap arms with the popup mount, so poll instead of asserting the instant
	// a Tab lands (first-Tab race seen once in CI).
	const dialog = page.getByRole("dialog");
	for (let i = 0; i < 3; i += 1) {
		await page.keyboard.press("Tab");
		await expect
			.poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
			.toBe(true);
	}
	await page.keyboard.press("Shift+Tab");
	await expect
		.poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
		.toBe(true);

	// Empty caret: apply a link, close, then type — the typed text must
	// become the link exactly at the caret, without swallowing "Mở đầu".
	await linkInput.fill("https://example.com/them");
	await linkInput.press("Enter");
	await expect(linkInput).toHaveCount(0);
	await expect(promptEditor).toBeFocused();
	await page.keyboard.type("XYZ");
	await expect(promptEditor.locator("a")).toHaveText("XYZ");
	await expect(promptEditor).toContainText("Mở đầu");
});

// Issue #438 cascade fix: the base `.ProseMirror` block now lives in
// @layer components, so per-callsite min-height utilities win. Baseline was
// 5rem = 70px everywhere (unlayered rule beat every utility).
test("callsite min-height utilities override the layered ProseMirror base", async ({
	page,
	request,
}) => {
	await signUpViaUi(page);

	// test-header-form "Mô tả" carries min-h-22 = 5.5rem = 77px @14px root.
	await page.goto("/assignments/tests/new");
	await expect(page.getByLabel("Mô tả")).toBeVisible();
	expect(
		await page
			.getByLabel("Mô tả")
			.evaluate((el) => getComputedStyle(el).minHeight),
	).toBe("77px");

	// prompt-composer main prompt carries min-h-42 = 10.5rem = 147px.
	await page.goto("/assignments/new");
	await expect(page.getByLabel("Nội dung đề")).toBeVisible();
	expect(
		await page
			.getByLabel("Nội dung đề")
			.evaluate((el) => getComputedStyle(el).minHeight),
	).toBe("147px");

	// Admin library part editor: PartContentFields "Ghi chú nội bộ" and
	// AnswerKeyGrid "Giải thích câu 1" both carry min-h-16 = 4rem = 56px.
	await ensureAdminAccount(request);
	await adminOpenNewTestPage(page);
	await page.getByLabel("Tiêu đề", { exact: true }).fill("QC-438 MinH16");
	await page.getByLabel("Kỹ năng").selectOption({ label: "Reading (Đọc)" });
	await page.getByRole("button", { name: "Tạo bộ đề" }).click();
	await expect(page).toHaveURL(/\/library\/tests\/(?!new)[^/]+$/);
	await page
		.getByRole("navigation", { name: "Mục lục đề" })
		.getByRole("button", { name: "Passage 1", exact: true })
		.click();
	await page.getByRole("button", { name: "Thêm nội dung" }).click();
	await expect(page.getByLabel("Ghi chú nội bộ")).toBeVisible();
	expect(
		await page
			.getByLabel("Ghi chú nội bộ")
			.evaluate((el) => getComputedStyle(el).minHeight),
	).toBe("56px");
	await page
		.getByRole("tablist", { name: "Các tab Passage 1" })
		.getByRole("tab", { name: "Câu hỏi", exact: true })
		.click();
	await expect(page.getByLabel("Giải thích câu 1")).toBeVisible();
	expect(
		await page
			.getByLabel("Giải thích câu 1")
			.evaluate((el) => getComputedStyle(el).minHeight),
	).toBe("56px");
});
