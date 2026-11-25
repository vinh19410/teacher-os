import {
	AnnotatableReadingPassage,
	type ReadingAnnotationConfig,
} from "@teacher-os/ui/components/quiz/annotatable-reading-passage";
import {
	buildPassageModel,
	type ReadingAnnotation,
} from "@teacher-os/ui/lib/reading-annotations";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";

let originalPointerEvent: typeof window.PointerEvent | undefined;

beforeAll(() => {
	originalPointerEvent = window.PointerEvent;
	if (typeof window.PointerEvent === "undefined") {
		class PointerEventPolyfill extends window.MouseEvent {
			pointerId: number;
			pointerType: string;
			isPrimary: boolean;
			constructor(type: string, params: PointerEventInit = {}) {
				super(type, params);
				this.pointerId = params.pointerId ?? 1;
				this.pointerType = params.pointerType ?? "mouse";
				this.isPrimary = params.isPrimary ?? true;
			}
		}
		Object.defineProperty(window, "PointerEvent", {
			configurable: true,
			writable: true,
			value: PointerEventPolyfill,
		});
		Object.defineProperty(globalThis, "PointerEvent", {
			configurable: true,
			writable: true,
			value: PointerEventPolyfill,
		});
	}
});

afterAll(() => {
	Object.defineProperty(window, "PointerEvent", {
		configurable: true,
		writable: true,
		value: originalPointerEvent,
	});
	Object.defineProperty(globalThis, "PointerEvent", {
		configurable: true,
		writable: true,
		value: originalPointerEvent,
	});
});

afterEach(() => {
	cleanup();
	window.getSelection()?.removeAllRanges();
	vi.useRealTimers();
});

function selectTextInNode(node: Node, startOffset: number, endOffset: number) {
	const range = document.createRange();
	range.setStart(node, startOffset);
	range.setEnd(node, endOffset);
	// jsdom Range.getBoundingClientRect returns 0s; mock non-zero rect for positioning.
	range.getBoundingClientRect = () =>
		({
			top: 200,
			bottom: 220,
			left: 120,
			right: 260,
			width: 140,
			height: 20,
			x: 120,
			y: 200,
			toJSON: () => ({}),
		}) as DOMRect;
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	return range;
}

function selectAcrossNodes(
	startNode: Node,
	startOffset: number,
	endNode: Node,
	endOffset: number,
) {
	const range = document.createRange();
	range.setStart(startNode, startOffset);
	range.setEnd(endNode, endOffset);
	range.getBoundingClientRect = () =>
		({
			top: 200,
			bottom: 220,
			left: 120,
			right: 300,
			width: 180,
			height: 20,
			x: 120,
			y: 200,
			toJSON: () => ({}),
		}) as DOMRect;
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	return range;
}

function StatefulPassage({
	passage,
	initial = [],
	mode = "edit",
}: {
	passage: string;
	initial?: ReadingAnnotation[];
	mode?: ReadingAnnotationConfig["mode"];
}) {
	const [items, setItems] = useState<ReadingAnnotation[]>(initial);
	return (
		<AnnotatableReadingPassage
			passage={passage}
			annotations={{
				mode,
				items,
				onChange: mode === "edit" ? setItems : undefined,
			}}
		/>
	);
}

describe("AnnotatableReadingPassage", () => {
	it("preserves RICH_TEXT_CONTENT_CLASSES, wraps <table> in overflow-x-auto, downgrades unsafe <a>, and applies whitespace-pre-line for plain text", () => {
		const html =
			'<p>An là <strong>học sinh</strong> giỏi.</p><blockquote>Trích dẫn</blockquote><table><tbody><tr><td>Ô 1</td></tr></tbody></table><p><a href="https://example.com">Nguồn</a> và <a href="javascript:alert(1)">Bad</a></p>';
		const { container, rerender } = render(
			<AnnotatableReadingPassage
				passage={html}
				annotations={{ mode: "edit", items: [] }}
			/>,
		);

		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		);
		expect(content?.className).toContain("[&_blockquote]");
		expect(content?.className).toContain("[&_table]");

		const table = content?.querySelector("table");
		expect(table?.parentElement?.className).toContain("overflow-x-auto");

		const goodLink = screen.getByRole("link", { name: "Nguồn" });
		expect(goodLink.getAttribute("href")).toBe("https://example.com");
		expect(goodLink.getAttribute("target")).toBe("_blank");
		expect(goodLink.getAttribute("rel")).toBe("noopener noreferrer");

		// Unsafe javascript: anchor downgraded to <span>
		expect(screen.queryByRole("link", { name: "Bad" })).toBeNull();
		expect(screen.getByText("Bad").tagName).toBe("SPAN");

		rerender(
			<AnnotatableReadingPassage
				passage={"Line 1\nLine 2"}
				annotations={{ mode: "edit", items: [] }}
			/>,
		);
		const plainContent = container.querySelector(
			'[data-testid="reading-passage-content"]',
		);
		expect(plainContent?.className).toContain("whitespace-pre-line");
	});

	it("highlights cross-tag text from floating selection toolbar and renders mark.reading-hl", () => {
		const html = "<p>An là <strong>học sinh</strong> giỏi.</p><p>Đoạn hai.</p>";
		const { container } = render(<StatefulPassage passage={html} />);
		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const p1 = content.querySelectorAll("p")[0] as HTMLElement;
		const strongText = p1.querySelector("strong")?.firstChild as Node;

		selectAcrossNodes(p1.firstChild as Node, 3, strongText, 8);
		fireEvent.pointerDown(content, { button: 0 });
		fireEvent.pointerUp(window, { button: 0 });

		const toolbar = screen.getByRole("toolbar", { name: "Công cụ bài đọc" });
		expect(toolbar).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Tô sáng" }));
		const marks = content.querySelectorAll("mark.reading-hl");
		expect(marks.length).toBeGreaterThanOrEqual(2);
		expect(
			Array.from(marks)
				.map((m) => m.textContent)
				.join(""),
		).toBe("là học sinh");
		expect(screen.queryByRole("toolbar")).toBeNull();
	});

	it("does not freeze after mobile touch pointercancel and opens toolbar on selectionchange", () => {
		vi.useFakeTimers();
		const html = "<p>History of tea in ancient China.</p>";
		const { container } = render(<StatefulPassage passage={html} />);
		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const textNode = content.querySelector("p")?.firstChild as Node;

		fireEvent.pointerDown(content, { button: 0 });
		fireEvent.pointerCancel(window);
		selectTextInNode(textNode, 0, 7);
		fireEvent(document, new Event("selectionchange"));
		act(() => {
			vi.advanceTimersByTime(300);
		});

		expect(
			screen.getByRole("toolbar", { name: "Công cụ bài đọc" }),
		).toBeTruthy();
	});

	it("opens context menu on right-click without duplicating floating toolbar, and supports mark right-click", () => {
		const html = "<p>History of tea in ancient China.</p>";
		const { container } = render(
			<StatefulPassage
				passage={html}
				initial={[{ id: "h1", start: 0, end: 7, note: "" }]}
			/>,
		);
		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const p = content.querySelector("p") as HTMLElement;
		const plainText = p.lastChild as Node; // " of tea in ancient China."

		selectTextInNode(plainText, 4, 7);
		fireEvent.pointerDown(content, { button: 2 });
		fireEvent.contextMenu(content, { clientX: 150, clientY: 220 });
		fireEvent.pointerUp(window, { button: 2 });

		expect(screen.getByRole("menu", { name: "Menu bài đọc" })).toBeTruthy();
		expect(screen.queryByRole("toolbar")).toBeNull();

		// Right-click directly on existing mark with collapsed selection
		window.getSelection()?.removeAllRanges();
		const mark = content.querySelector("mark.reading-hl") as HTMLElement;
		fireEvent.contextMenu(mark, { clientX: 100, clientY: 200 });
		expect(screen.getByRole("menuitem", { name: "Thêm ghi chú" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Bỏ tô sáng" })).toBeTruthy();

		// Right-click on blank plain text closes previous context menu
		fireEvent.contextMenu(p, { clientX: 180, clientY: 220 });
		expect(screen.queryByRole("menu")).toBeNull();

		// Keyboard/synthetic contextmenu with clientX=0, clientY=0 falls back to valid numeric coordinates
		mark.getBoundingClientRect = () =>
			({
				top: 160,
				bottom: 180,
				left: 90,
				right: 160,
				width: 70,
				height: 20,
				x: 90,
				y: 160,
				toJSON: () => ({}),
			}) as DOMRect;
		fireEvent.contextMenu(mark, { clientX: 0, clientY: 0 });
		const kbMenu = screen.getByRole("menu", { name: "Menu bài đọc" });
		expect(kbMenu.style.left).not.toContain("NaN");
		expect(kbMenu.style.top).not.toContain("NaN");
		expect(Number.parseFloat(kbMenu.style.left)).toBeGreaterThanOrEqual(8);
		expect(Number.parseFloat(kbMenu.style.top)).toBeGreaterThanOrEqual(8);
	});

	it("supports creating, viewing, editing notes with zero extra text nodes inside passageRef, and alerts on multi-note overlap", () => {
		const html = "<p>Alpha beta gamma delta epsilon.</p>";
		const model = buildPassageModel(html);
		const { container } = render(<StatefulPassage passage={html} />);
		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const textNode = content.querySelector("p")?.firstChild as Node;

		selectTextInNode(textNode, 0, 5);
		fireEvent.pointerDown(content, { button: 0 });
		fireEvent.pointerUp(window, { button: 0 });
		const toolbar = screen.getByRole("toolbar", { name: "Công cụ bài đọc" });
		fireEvent.click(within(toolbar).getByRole("button", { name: "Ghi chú" }));

		const dialog = screen.getByRole("dialog", { name: "Ghi chú bài đọc" });
		const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
		expect(textarea.maxLength).toBe(1000);
		fireEvent.change(textarea, { target: { value: "Ghi chú đầu tiên" } });
		fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));

		// Golden invariant: zero extra text nodes injected inside passageRef (note trigger contains SVG only)
		expect(content.textContent).toBe(model.canonicalText);
		const trigger = content.querySelector(
			'[data-reading-ui="true"]',
		) as HTMLElement;
		expect(trigger).toBeTruthy();
		expect(trigger.textContent).toBe("");

		// Click mark (collapsed selection) opens popover showing existing note
		window.getSelection()?.removeAllRanges();
		const mark = content.querySelector("mark.reading-hl") as HTMLElement;
		fireEvent.click(mark);
		const editDialog = screen.getByRole("dialog", { name: "Ghi chú bài đọc" });
		expect(
			(editDialog.querySelector("textarea") as HTMLTextAreaElement).value,
		).toBe("Ghi chú đầu tiên");

		// Multi-note overlap shows inline alert instead of silently dropping
		cleanup();
		const { container: c2 } = render(
			<StatefulPassage
				passage={html}
				initial={[
					{ id: "n1", start: 0, end: 5, note: "Note 1" },
					{ id: "n2", start: 11, end: 16, note: "Note 2" },
				]}
			/>,
		);
		const content2 = c2.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const p2 = content2.querySelector("p") as HTMLElement;
		selectAcrossNodes(p2, 0, p2, p2.childNodes.length);
		fireEvent.pointerDown(content2, { button: 0 });
		fireEvent.pointerUp(window, { button: 0 });
		const toolbar2 = screen.getByRole("toolbar", { name: "Công cụ bài đọc" });
		fireEvent.click(within(toolbar2).getByRole("button", { name: "Ghi chú" }));
		const dialog2 = screen.getByRole("dialog", { name: "Ghi chú bài đọc" });
		fireEvent.change(dialog2.querySelector("textarea") as HTMLTextAreaElement, {
			target: { value: "Merged attempt" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
		expect(screen.getByRole("alert")).toBeTruthy();
	});

	it("does not hijack non-collapsed selection inside <mark> and prevents navigation inside <a>", () => {
		const html =
			'<p><a href="https://example.com">Important source link</a></p>';
		const { container } = render(
			<StatefulPassage
				passage={html}
				initial={[{ id: "h1", start: 0, end: 21, note: "Citation" }]}
			/>,
		);
		const content = container.querySelector(
			'[data-testid="reading-passage-content"]',
		) as HTMLElement;
		const anchor = content.querySelector("a") as HTMLAnchorElement;
		// Never nest <button> inside <a>
		expect(anchor.querySelector("button")).toBeNull();
		const noteTrigger = anchor.querySelector(
			'[data-note-trigger="h1"]',
		) as HTMLElement;
		expect(noteTrigger.tagName).toBe("SPAN");

		const mark = content.querySelector("mark.reading-hl") as HTMLElement;
		// Non-collapsed selection inside mark inside <a> -> click does NOT open Note Popover AND prevents <a> navigation
		selectTextInNode(mark.firstChild as Node, 0, 9);
		const dragClickEv = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
		});
		expect(fireEvent(mark, dragClickEv)).toBe(false);
		expect(dragClickEv.defaultPrevented).toBe(true);
		expect(
			screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
		).toBeNull();

		// Collapsed click on mark inside <a> prevents default navigation, stops React propagation & opens Note Popover
		window.getSelection()?.removeAllRanges();
		const docClickSpy = vi.fn();
		document.addEventListener("click", docClickSpy);
		try {
			const clickEv = new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			});
			expect(fireEvent(mark, clickEv)).toBe(false);
			expect(clickEv.defaultPrevented).toBe(true);
			expect(docClickSpy).not.toHaveBeenCalled();
			expect(
				screen.getByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeTruthy();

			// Collapsed click on <span data-note-trigger> inside <a> also prevents navigation
			fireEvent.keyDown(window, { key: "Escape" });
			const triggerClickEv = new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			});
			expect(fireEvent(noteTrigger, triggerClickEv)).toBe(false);
			expect(triggerClickEv.defaultPrevented).toBe(true);
			expect(
				screen.getByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeTruthy();
		} finally {
			document.removeEventListener("click", docClickSpy);
		}
	});

	it("handles outside-click dismiss, modal-aware portal, Escape guard, Tab stopPropagation, and scroll filtering", () => {
		const html = "<p>Sample reading passage text.</p>";
		const docEscapeSpy = vi.fn();
		const modalTabSpy = vi.fn();
		document.addEventListener("keydown", docEscapeSpy);

		try {
			const { container, rerender } = render(
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Test preview"
					onKeyDown={(e) => {
						if (e.key === "Tab") modalTabSpy();
					}}
				>
					<div data-testid="ancestor-scroller">
						<AnnotatableReadingPassage
							passage={html}
							annotations={{
								mode: "edit",
								items: [{ id: "h1", start: 0, end: 6, note: "Demo" }],
								onChange: vi.fn(),
							}}
						/>
					</div>
					<div data-testid="sibling-scroller" />
				</div>,
			);

			const modal = screen.getByRole("dialog", { name: "Test preview" });
			const mark = container.querySelector("mark.reading-hl") as HTMLElement;
			fireEvent.click(mark);

			// Portal stays inside aria-modal dialog
			const popover = screen.getByRole("dialog", { name: "Ghi chú bài đọc" });
			expect(modal.contains(popover)).toBe(true);

			// Tab inside popover stops propagation AND wraps focus in both directions
			const focusables = Array.from(
				popover.querySelectorAll<HTMLElement>(
					'button, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
				),
			).filter((el) => !el.hasAttribute("disabled"));
			const firstFocusable = focusables[0] as HTMLElement;
			const lastFocusable = focusables[focusables.length - 1] as HTMLElement;
			lastFocusable.focus();
			fireEvent.keyDown(popover, { key: "Tab" });
			expect(modalTabSpy).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(firstFocusable);
			fireEvent.keyDown(popover, { key: "Tab", shiftKey: true });
			expect(modalTabSpy).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(lastFocusable);

			// Scroll on sibling does NOT close Note Popover; scroll on ancestor keeps Note Popover open
			fireEvent.scroll(screen.getByTestId("sibling-scroller"));
			fireEvent.scroll(screen.getByTestId("ancestor-scroller"));
			expect(
				screen.getByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeTruthy();

			// Escape closes popover and blocks document bubble listener
			fireEvent.keyDown(window, { key: "Escape" });
			expect(
				screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeNull();
			expect(docEscapeSpy).not.toHaveBeenCalled();

			// Outside-click closes open popover (sibling outside passage AND plain text inside passage)
			fireEvent.click(mark);
			expect(
				screen.getByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeTruthy();
			fireEvent.pointerDown(screen.getByTestId("sibling-scroller"));
			expect(
				screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeNull();

			fireEvent.click(mark);
			expect(
				screen.getByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeTruthy();
			const passageP = container.querySelector(
				'[data-testid="reading-passage-content"] p',
			) as HTMLElement;
			fireEvent.pointerDown(passageP, { button: 0 });
			expect(
				screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeNull();

			// Ancestor scroll closes floating toolbar; sibling scroll does NOT close it
			const passageContent = container.querySelector(
				'[data-testid="reading-passage-content"]',
			) as HTMLElement;
			selectTextInNode(passageP.lastChild as Node, 1, 8);
			fireEvent.pointerDown(passageContent, { button: 0 });
			fireEvent.pointerUp(window, { button: 0 });
			expect(
				screen.getByRole("toolbar", { name: "Công cụ bài đọc" }),
			).toBeTruthy();
			fireEvent.scroll(screen.getByTestId("sibling-scroller"));
			expect(
				screen.getByRole("toolbar", { name: "Công cụ bài đọc" }),
			).toBeTruthy();
			fireEvent.scroll(screen.getByTestId("ancestor-scroller"));
			expect(screen.queryByRole("toolbar")).toBeNull();
			window.getSelection()?.removeAllRanges();

			// If alertdialog is open, Escape is NOT swallowed by reading overlay
			fireEvent.click(mark);
			const alertDialog = document.createElement("div");
			alertDialog.setAttribute("role", "alertdialog");
			alertDialog.setAttribute("aria-modal", "true");
			document.body.appendChild(alertDialog);
			fireEvent.keyDown(document, { key: "Escape" });
			expect(docEscapeSpy).toHaveBeenCalledTimes(1);
			alertDialog.remove();

			// Changing passage resets open popover
			rerender(
				<div role="dialog" aria-modal="true" aria-label="Test preview">
					<AnnotatableReadingPassage
						passage="<p>Different passage.</p>"
						annotations={{ mode: "edit", items: [], onChange: vi.fn() }}
					/>
				</div>,
			);
			expect(
				screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
			).toBeNull();
		} finally {
			document.removeEventListener("keydown", docEscapeSpy);
		}
	});

	it("renders collapsible Notes Panel with aria-hidden count badge, jump-to-mark, clear-all confirmation, and readonly mode", () => {
		const html = "<p>Tea originated in China thousands of years ago.</p>";
		const onChange = vi.fn();
		const scrollIntoViewSpy = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoViewSpy;

		const { container, rerender } = render(
			<AnnotatableReadingPassage
				passage={html}
				annotations={{
					mode: "edit",
					items: [
						{ id: "hl-1", start: 0, end: 3, note: "Keyword 1" },
						{ id: "hl-2", start: 18, end: 23, note: "" },
					],
					onChange,
				}}
			/>,
		);

		// Notes toggle button accessible name excludes aria-hidden count badge
		const notesBtn = screen.getByRole("button", { name: "Ghi chú" });
		expect(notesBtn.getAttribute("aria-expanded")).toBe("false");
		expect(
			notesBtn.querySelector('span[aria-hidden="true"]')?.textContent,
		).toBe("2");

		fireEvent.click(notesBtn);
		expect(notesBtn.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText("Keyword 1")).toBeTruthy();

		// Clicking an item scrolls to & focuses matching <mark>
		const jumpBtn = screen.getByRole("button", { name: /Đi tới đoạn.*Tea/i });
		fireEvent.click(jumpBtn);
		const mark1 = container.querySelector(
			'mark[data-highlight-id="hl-1"]',
		) as HTMLElement;
		expect(scrollIntoViewSpy).toHaveBeenCalled();
		expect(document.activeElement).toBe(mark1);

		// Clear all requires confirmation
		fireEvent.click(screen.getByRole("button", { name: "Xoá tất cả" }));
		expect(screen.getByText("Xoá tất cả?")).toBeTruthy();
		expect(onChange).not.toHaveBeenCalled();
		fireEvent.click(
			screen.getByRole("button", { name: "Xác nhận xoá tất cả" }),
		);
		expect(onChange).toHaveBeenCalledWith([]);

		// Readonly mode: shows marks & read-only popover, hides edit controls & clear all, uses readonly aria-label, and clicking plain text closes popover
		rerender(
			<AnnotatableReadingPassage
				passage={html}
				annotations={{
					mode: "readonly",
					items: [
						{ id: "hl-1", start: 0, end: 3, note: "Readonly note" },
						{ id: "hl-2", start: 18, end: 23, note: "" },
					],
				}}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Xoá tất cả" })).toBeNull();
		const readonlyPlainMark = container.querySelector(
			'mark[data-highlight-id="hl-2"]',
		) as HTMLElement;
		expect(readonlyPlainMark.getAttribute("aria-label")).toBe(
			"Đoạn tô sáng, bấm để xem chi tiết",
		);
		const readonlyMark = container.querySelector(
			'mark[data-highlight-id="hl-1"]',
		) as HTMLElement;
		fireEvent.click(readonlyMark);
		const roDialog = screen.getByRole("dialog", { name: "Ghi chú bài đọc" });
		expect(roDialog.textContent).toContain("Readonly note");
		expect(roDialog.querySelector("textarea")).toBeNull();
		expect(screen.queryByRole("button", { name: "Lưu ghi chú" })).toBeNull();

		const roPassageP = container.querySelector(
			'[data-testid="reading-passage-content"] p',
		) as HTMLElement;
		fireEvent.pointerDown(roPassageP, { button: 0 });
		expect(
			screen.queryByRole("dialog", { name: "Ghi chú bài đọc" }),
		).toBeNull();
	});
});
