// @vitest-environment jsdom

import { htmlToPlainText } from "@teacher-os/api/rich-text";
import { cleanup, render } from "@testing-library/react";
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
		expect(getByRole("button", { name: "In nghiêng" })).toBeTruthy();
		expect(getByRole("button", { name: "Gạch chân" })).toBeTruthy();
		expect(
			getByRole("button", { name: "Danh sách gạch đầu dòng" }),
		).toBeTruthy();
		expect(getByRole("button", { name: "Danh sách đánh số" })).toBeTruthy();
		expect(getByRole("button", { name: "Chèn liên kết" })).toBeTruthy();
	});
});
