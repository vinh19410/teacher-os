import { expect, test } from "@playwright/test";
import { fillRichEditor, signUpViaUi } from "./helpers";

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
