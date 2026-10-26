// @vitest-environment jsdom

import { htmlToPlainText, isEmptyRichText } from "@teacher-os/api/rich-text";
import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeLegacyRichText } from "@/lib/rich-text-legacy";
import { Field } from "./field";
import { RichTextEditor } from "./rich-text-editor";

afterEach(cleanup);

describe("Tiptap editor (headless Commands API)", () => {
	it("toggleBold produces <strong> markup", () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content: "<p>hello</p>",
		});
		editor.commands.setTextSelection({ from: 1, to: 6 });
		editor.commands.toggleBold();
		expect(editor.getHTML()).toContain("<strong>");
		editor.destroy();
	});

	it("keeps a legacy 3-line draft's line breaks through a full editor round-trip", () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content: normalizeLegacyRichText("Dòng 1\nDòng 2\nDòng 3"),
		});
		const html = editor.getHTML();
		expect(html.match(/<br>/g)?.length).toBeGreaterThanOrEqual(2);
		expect(htmlToPlainText(html).split("\n")).toEqual([
			"Dòng 1",
			"Dòng 2",
			"Dòng 3",
		]);
		editor.destroy();
	});

	it("does not turn an escaped literal < into a tag", () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content: normalizeLegacyRichText("a < b"),
		});
		const html = editor.getHTML();
		expect(html).not.toMatch(/<[a-z]+[^>]*>a\s*</);
		expect(htmlToPlainText(html)).toBe("a < b");
		editor.destroy();
	});

	// Full-option toolbar wiring (issue #436): every new toolbar button maps
	// to a StarterKit command that emits exactly one allowlisted tag.
	it("emits one allowlisted tag per full-option command", () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content: "<p>đoạn</p>",
		});
		editor.commands.setTextSelection({ from: 1, to: 5 });

		editor.commands.toggleStrike();
		expect(editor.getHTML()).toContain("<s>đoạn</s>");
		editor.commands.toggleStrike();

		editor.commands.toggleBlockquote();
		expect(editor.getHTML()).toContain("<blockquote>");
		editor.commands.toggleBlockquote();

		editor.commands.toggleCode();
		expect(editor.getHTML()).toContain("<code>đoạn</code>");
		editor.commands.toggleCode();

		editor.commands.toggleCodeBlock();
		expect(editor.getHTML()).toContain("<pre><code>đoạn</code></pre>");
		editor.commands.toggleCodeBlock();

		editor.commands.setHeading({ level: 2 });
		expect(editor.getHTML()).toContain("<h2>đoạn</h2>");
		editor.commands.setHeading({ level: 3 });
		expect(editor.getHTML()).toContain("<h3>đoạn</h3>");
		editor.commands.setParagraph();

		editor.commands.setHorizontalRule();
		expect(editor.getHTML()).toContain("<hr>");
		// UndoRedo ships inside StarterKit — one undo removes the rule.
		editor.commands.undo();
		expect(editor.getHTML()).not.toContain("<hr>");

		editor.destroy();
	});

	it("keeps every full-option tag through the render sanitizer", () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content:
				"<h2>Mục</h2><h3>Nhánh</h3><blockquote><p>trích</p></blockquote><ul><li>gạch</li></ul><pre><code>code()</code></pre><p><code>n</code> <s>cũ</s></p><hr>",
		});
		const out = sanitizeRichText(editor.getHTML());
		for (const tag of [
			"<h2>",
			"<h3>",
			"<blockquote>",
			"<ul>",
			"<pre><code>",
			"<code>n</code>",
			"<s>",
			"<hr>",
		]) {
			expect(out).toContain(tag);
		}
		editor.destroy();
	});

	it("treats a bare horizontal rule as empty content", () => {
		expect(isEmptyRichText("<hr>")).toBe(true);
		expect(isEmptyRichText("<p><hr></p>")).toBe(true);
		expect(isEmptyRichText("<blockquote><p>trích</p></blockquote>")).toBe(
			false,
		);
	});
});

describe("RichTextEditor component", () => {
	it("exposes the editor to getByLabelText via the Field a11y contract", async () => {
		const { getByLabelText } = render(
			<Field label="Nội dung đề">
				<RichTextEditor
					value="<p>x</p>"
					onChange={() => {}}
					placeholder="test"
				/>
			</Field>,
		);
		const editable = await getByLabelText("Nội dung đề");
		expect(editable.className).toContain("ProseMirror");
	});

	// Regression (issue #436 red-team F1): toggling bold on an empty document
	// only sets the stored mark — the doc does not change, so a controlled
	// parent does not re-render and the toolbar must still update its own
	// state. Fails while the toolbar reads isActive during parent render.
	it("reflects a stored-mark toggle in aria-pressed without a doc change", async () => {
		const { getByRole } = render(
			<RichTextEditor value="" onChange={() => {}} placeholder="test" />,
		);
		const bold = await getByRole("button", { name: "In đậm" });
		fireEvent.click(bold);
		await waitFor(() =>
			expect(
				getByRole("button", { name: "In đậm" }).getAttribute("aria-pressed"),
			).toBe("true"),
		);
	});

	// Regression (issue #436 advisory): the initial value sync ("" vs the
	// empty doc's "<p></p>") dispatched a setContent that polluted the undo
	// history — an untouched editor arrived with an enabled Undo button, and
	// one undo on a reopened assignment wiped all saved content.
	it("leaves Undo disabled on an untouched editor", async () => {
		const { getByRole } = render(
			<RichTextEditor value="" onChange={() => {}} placeholder="test" />,
		);
		const undo = await getByRole("button", { name: "Hoàn tác" });
		expect(undo.getAttribute("disabled")).not.toBeNull();
	});

	it("renders Vietnamese toolbar buttons with pressed state", async () => {
		const { getByRole } = render(
			<RichTextEditor
				value="<p>x</p>"
				onChange={() => {}}
				placeholder="test"
			/>,
		);
		const bold = getByRole("button", { name: "In đậm" });
		expect(bold.getAttribute("aria-pressed")).toBe("false");
		const toggles = [
			"In nghiêng",
			"Gạch chân",
			"Gạch ngang chữ",
			"Đề mục cấp 2",
			"Đề mục cấp 3",
			"Danh sách gạch đầu dòng",
			"Danh sách đánh số",
			"Trích dẫn",
			"Đoạn mã",
			"Khối mã",
			"Chèn liên kết",
		];
		for (const name of toggles) {
			expect(getByRole("button", { name })).toBeTruthy();
		}
		// Momentary actions are not toggles — no aria-pressed (a screen reader
		// must not announce them as on/off switches).
		for (const name of ["Đường kẻ ngang", "Hoàn tác", "Làm lại"]) {
			expect(
				getByRole("button", { name }).getAttribute("aria-pressed"),
			).toBeNull();
		}
	});
});
