// @vitest-environment jsdom

import { htmlToPlainText, isEmptyRichText } from "@teacher-os/api/rich-text";
import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLegacyRichText } from "@/lib/rich-text-legacy";
import { Field } from "./field";
import { RichTextEditor } from "./rich-text-editor";

// jsdom has no layout — ProseMirror's scrollToSelection reads Range rects on
// focus changes and would otherwise throw an unhandled TypeError.
const emptyRectList = (): DOMRectList =>
	({
		length: 0,
		item: () => null,
		[Symbol.iterator]: [][Symbol.iterator],
	}) as DOMRectList;
Element.prototype.getClientRects ??= emptyRectList;
Range.prototype.getClientRects ??= emptyRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);

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

// ---------------------------------------------------------------------------
// Issue #438 — toolbar a11y, H4, popover link. Tests written first (TDD red):
// they fail against the pre-#438 component (15 tabbable buttons, no H4,
// window.prompt link) and must pass after the Base UI Toolbar + Popover swap.
// ---------------------------------------------------------------------------

const TOOLBAR_LABELS = [
	"In đậm",
	"In nghiêng",
	"Gạch chân",
	"Gạch ngang chữ",
	"Đề mục cấp 2",
	"Đề mục cấp 3",
	"Đề mục cấp 4",
	"Danh sách gạch đầu dòng",
	"Danh sách đánh số",
	"Trích dẫn",
	"Đoạn mã",
	"Khối mã",
	"Chèn liên kết",
	"Đường kẻ ngang",
	"Hoàn tác",
	"Làm lại",
];

describe("toolbar a11y (issue #438)", () => {
	it("renders 16 buttons with a single roving tab stop and explicit focus ring", async () => {
		const { container, getByRole } = render(
			<RichTextEditor
				value="<p>x</p>"
				onChange={() => {}}
				placeholder="test"
			/>,
		);
		const toolbar = await getByRole("toolbar", { name: "Định dạng văn bản" });
		const buttons = within(toolbar).getAllByRole("button");
		expect(buttons).toHaveLength(16);

		// Roving tabindex: exactly one tab stop while Undo/Redo are disabled
		// (fresh editor, no history).
		const tabbable = buttons.filter((b) => b.tabIndex >= 0);
		expect(tabbable).toHaveLength(1);
		expect(TOOLBAR_LABELS).toContain(tabbable[0].getAttribute("aria-label"));

		// REVIEW.md: explicit focus-visible ring class on every control.
		expect(tabbable[0].className).toContain(
			"focus-visible:shadow-[var(--focus-ring)]",
		);
		// The link trigger is a popover disclosure — it still carries an icon.
		expect(
			within(toolbar)
				.getByRole("button", { name: "Chèn liên kết" })
				.querySelector("svg"),
		).not.toBeNull();
		// Wrapper ring only lights while the editable area has focus — a
		// toolbar-focused editor must not glow as a whole frame.
		expect(container.firstElementChild?.className).toContain(
			"has-[.ProseMirror:focus]:ring-[3px]",
		);
		expect(container.firstElementChild?.className).not.toContain(
			"focus-within:ring",
		);
	});

	it("orders H4 immediately after H3", async () => {
		const { getByRole, getAllByRole } = render(
			<RichTextEditor
				value="<p>x</p>"
				onChange={() => {}}
				placeholder="test"
			/>,
		);
		await getByRole("toolbar", { name: "Định dạng văn bản" });
		const labels = getAllByRole("button").map((b) =>
			b.getAttribute("aria-label"),
		);
		expect(labels.indexOf("Đề mục cấp 4")).toBe(
			labels.indexOf("Đề mục cấp 3") + 1,
		);
	});

	it("moves focus with arrows, skips disabled Undo/Redo, and keeps one tab stop when history exists", async () => {
		const { getByRole, getAllByRole } = render(
			<RichTextEditor
				value="<p>x</p>"
				onChange={() => {}}
				placeholder="test"
			/>,
		);
		await getByRole("toolbar", { name: "Định dạng văn bản" });
		const byLabel = (name: string): HTMLElement => {
			const btn = getAllByRole("button").find(
				(b) => b.getAttribute("aria-label") === name,
			);
			if (!btn) throw new Error(`missing toolbar button: ${name}`);
			return btn;
		};

		const first = byLabel("In đậm");
		first.focus();
		expect(document.activeElement).toBe(first);

		fireEvent.keyDown(first, { key: "ArrowRight" });
		const second = byLabel("In nghiêng");
		await waitFor(() => expect(document.activeElement).toBe(second));
		fireEvent.keyDown(second, { key: "ArrowLeft" });
		await waitFor(() => expect(document.activeElement).toBe(first));
		fireEvent.keyDown(first, { key: "End" });
		const lastEnabled = byLabel("Đường kẻ ngang");
		await waitFor(() => expect(document.activeElement).toBe(lastEnabled));

		// From the last enabled button, ArrowRight skips the disabled Undo +
		// Redo and wraps to the first button.
		fireEvent.keyDown(lastEnabled, { key: "ArrowRight" });
		await waitFor(() => expect(document.activeElement).toBe(first));

		// After a real document change Undo/Redo enable — the toolbar must
		// still expose exactly one tab stop (roving index follows state).
		fireEvent.click(lastEnabled);
		await waitFor(() =>
			expect(byLabel("Hoàn tác").getAttribute("disabled")).toBeNull(),
		);
		const tabbable = getAllByRole("button").filter((b) => b.tabIndex >= 0);
		expect(tabbable).toHaveLength(1);
	});
});

describe("H4 heading (issue #438)", () => {
	it("setHeading level 4 emits <h4> that survives the render sanitizer", () => {
		const editor = new Editor({
			extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] } })],
			content: "<p>đề mục</p>",
		});
		editor.commands.setTextSelection({ from: 1, to: 7 });
		editor.commands.setHeading({ level: 4 });
		const html = editor.getHTML();
		expect(html).toContain("<h4>đề mục</h4>");
		expect(sanitizeRichText(html)).toContain("<h4>đề mục</h4>");
		editor.destroy();
	});
});

describe("link popover (issue #438)", () => {
	function renderEditor(value: string, onChange = () => {}) {
		const utils = render(
			<RichTextEditor value={value} onChange={onChange} placeholder="test" />,
		);
		return { ...utils, onChange };
	}

	// ProseMirror ignores selectionchange while it has no focus — focus the
	// editable first, then sync the DOM selection into PM state (its observer
	// flushes on a timer).
	async function setCaretSelection(start: number, end: number) {
		const prosemirror = document.querySelector(".ProseMirror");
		if (!prosemirror) throw new Error("ProseMirror not mounted");
		const textNode = prosemirror.querySelector("p")?.firstChild;
		if (!textNode) throw new Error("no paragraph text node");
		(prosemirror as HTMLElement).focus();
		document.getSelection()?.setBaseAndExtent(textNode, start, textNode, end);
		document.dispatchEvent(new Event("selectionchange"));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 80));
		});
	}

	async function openLinkPopover() {
		fireEvent.click(screen.getByRole("button", { name: "Chèn liên kết" }));
		const input = await screen.findByLabelText("Địa chỉ liên kết");
		await waitFor(() => expect(document.activeElement).toBe(input));
		return input;
	}

	function applyHref(input: HTMLElement, href: string) {
		fireEvent.change(input, { target: { value: href } });
		fireEvent.keyDown(input, { key: "Enter" });
	}

	function anchorOf(html: string | undefined) {
		if (!html) throw new Error("no onChange html");
		return new DOMParser()
			.parseFromString(html, "text/html")
			.querySelector("a");
	}

	it("applies a link to the selected text and closes (case a)", async () => {
		const onChange = vi.fn();
		renderEditor("<p>hello</p>", onChange);
		await screen.findByText("hello");
		await setCaretSelection(0, 5);
		const input = await openLinkPopover();
		applyHref(input, "https://example.com");
		await waitFor(() => expect(onChange).toHaveBeenCalled());
		const anchor = anchorOf(onChange.mock.lastCall?.[0] as string);
		expect(anchor?.getAttribute("href")).toBe("https://example.com");
		expect(anchor?.textContent).toBe("hello");
		await waitFor(() =>
			expect(
				screen
					.getByRole("button", { name: "Chèn liên kết" })
					.getAttribute("aria-expanded"),
			).toBe("false"),
		);
	});

	it("removes the active link without opening the popover (case b)", async () => {
		const onChange = vi.fn();
		renderEditor("<p>hello</p>", onChange);
		await screen.findByText("hello");
		await setCaretSelection(0, 5);
		const input = await openLinkPopover();
		applyHref(input, "https://example.com");
		await waitFor(() =>
			expect(anchorOf(onChange.mock.lastCall?.[0] as string)).not.toBeNull(),
		);
		// Caret is still inside the link: pressing the trigger unsets it.
		fireEvent.click(screen.getByRole("button", { name: "Chèn liên kết" }));
		await waitFor(() =>
			expect(anchorOf(onChange.mock.lastCall?.[0] as string)).toBeNull(),
		);
		expect(
			screen
				.getByRole("button", { name: "Chèn liên kết" })
				.getAttribute("aria-expanded"),
		).toBe("false");
		expect(screen.queryByLabelText("Địa chỉ liên kết")).toBeNull();
	});

	it("closes on Escape and returns focus to the trigger (case c)", async () => {
		renderEditor("<p>hello</p>");
		await screen.findByText("hello");
		const input = await openLinkPopover();
		fireEvent.keyDown(input, { key: "Escape" });
		await waitFor(() =>
			expect(screen.queryByLabelText("Địa chỉ liên kết")).toBeNull(),
		);
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Chèn liên kết" }),
		);
	});

	it("keeps an empty-selection apply as a stored mark without changing the doc (case d)", async () => {
		const onChange = vi.fn();
		renderEditor("<p>hello</p>", onChange);
		await screen.findByText("hello");
		await setCaretSelection(0, 0);
		const input = await openLinkPopover();
		applyHref(input, "https://x.dev");
		await waitFor(() =>
			expect(screen.queryByLabelText("Địa chỉ liên kết")).toBeNull(),
		);
		// Empty selection set a stored mark — the doc itself must not change,
		// and focus must return to the editable area (a user who has to click
		// back into the text first would clear the stored mark; jsdom cannot
		// simulate PM typing, so the typed-text-becomes-link assertion lives
		// in the e2e spec — see phase-02 Task 2.3).
		expect(onChange).not.toHaveBeenCalled();
		expect(document.activeElement?.classList.contains("ProseMirror")).toBe(
			true,
		);
	});

	it("rejects javascript/data URLs with an inline error and stores nothing (case e)", async () => {
		const onChange = vi.fn();
		renderEditor("<p>hello</p>", onChange);
		await screen.findByText("hello");
		await setCaretSelection(0, 5);
		const input = await openLinkPopover();
		applyHref(input, "javascript:alert(1)");
		const error = await screen.findByText(/Chỉ hỗ trợ liên kết/);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.getAttribute("aria-describedby")).toBe(
			error.getAttribute("id"),
		);
		expect(input.closest("[role='dialog']")).not.toBeNull();
		expect(onChange).not.toHaveBeenCalled();

		applyHref(input, "data:text/html,<b>x</b>");
		await waitFor(() => expect(onChange).not.toHaveBeenCalled());
		applyHref(input, "//evil.com/path");
		await waitFor(() => expect(onChange).not.toHaveBeenCalled());
	});

	it("closes on click-outside and returns focus to the trigger (case f)", async () => {
		renderEditor("<p>hello</p>");
		await screen.findByText("hello");
		await openLinkPopover();
		// Base UI modal popovers dismiss only on an intentional full press:
		// pointerdown → mousedown → pointerup → mouseup → click.
		fireEvent.pointerDown(document.body);
		fireEvent.mouseDown(document.body);
		fireEvent.pointerUp(document.body);
		fireEvent.mouseUp(document.body);
		fireEvent.click(document.body);
		await waitFor(() =>
			expect(screen.queryByLabelText("Địa chỉ liên kết")).toBeNull(),
		);
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Chèn liên kết" }),
		);
	});

	it("does not submit an enclosing page form on Enter (case g)", async () => {
		const submitSpy = vi.fn();
		render(
			<form
				onSubmit={(e) => {
					e.preventDefault();
					submitSpy();
				}}
			>
				<RichTextEditor value="<p>hello</p>" onChange={() => {}} />
			</form>,
		);
		await screen.findByText("hello");
		await setCaretSelection(0, 5);
		const input = await openLinkPopover();
		applyHref(input, "https://example.com");
		await waitFor(() =>
			expect(screen.queryByLabelText("Địa chỉ liên kết")).toBeNull(),
		);
		expect(submitSpy).not.toHaveBeenCalled();
	});

	it("keeps caret keys inside the popover input (case h)", async () => {
		renderEditor("<p>hello</p>");
		await screen.findByText("hello");
		const input = await openLinkPopover();
		fireEvent.keyDown(input, { key: "Home" });
		expect(document.activeElement).toBe(input);
		fireEvent.keyDown(input, { key: "ArrowRight" });
		expect(document.activeElement).toBe(input);
		// NOTE: the modal Tab-cycle trap cannot be driven from jsdom (Base UI
		// moves focus in its own key handling, which fireEvent does not
		// exercise) — a fake assertion here would be pass-only. The trap is
		// verified in the e2e/Playwright pass (phase-02 Task 2.2 focus-state
		// capture) and manually in the REVIEW.md keyboard check.
	});
});
