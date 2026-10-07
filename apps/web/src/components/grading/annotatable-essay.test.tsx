// @vitest-environment jsdom

import type {
	EssayAnnotation,
	EssayAnnotationCreate,
} from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { AnnotatableEssay } from "./annotatable-essay";

// jsdom không dựng hình: Range.getBoundingClientRect và scrollIntoView vắng
// mặt — stub mức prototype, không đổi code production.
beforeAll(() => {
	Range.prototype.getBoundingClientRect = () =>
		({
			bottom: 20,
			left: 10,
			top: 10,
			right: 50,
			width: 40,
			height: 10,
			x: 10,
			y: 10,
			toJSON: () => ({}),
		}) as DOMRect;
	Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

const ESSAY = "Living in a city has many benefits for young people.";

function annotation(
	id: string,
	start: number,
	end: number,
	note = "",
): EssayAnnotation {
	return { id, start, end, note };
}

function baseProps(
	overrides: Partial<Parameters<typeof AnnotatableEssay>[0]> = {},
) {
	const resolve = () => Promise.resolve() as Promise<unknown>;
	return {
		essay: ESSAY,
		annotations: [] as EssayAnnotation[],
		pending: false,
		onCreate: vi.fn(resolve),
		onUpdate: vi.fn(resolve),
		onDelete: vi.fn(resolve),
		...overrides,
	};
}

/** Đặt Range cho `text` trong khối essay (không bắn sự kiện). */
function setSelection(text: string): HTMLElement {
	const container = screen.getByTestId("essay-text");
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	while (node) {
		const index = node.textContent?.indexOf(text) ?? -1;
		if (index >= 0) {
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + text.length);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			return container;
		}
		node = walker.nextNode();
	}
	throw new Error(`text not found in essay: ${text}`);
}

/** Mô phỏng thao tác bôi đen thật: nhấn chuột → selection hình thành → thả
 * tay — popover chỉ được mở ở bước thả tay. Render với `props` trước. */
function selectText(text: string, props = baseProps()) {
	render(<AnnotatableEssay {...props} />);
	const container = screen.getByTestId("essay-text");
	fireEvent.pointerDown(container);
	setSelection(text);
	fireEvent.pointerUp(container);
	return props;
}

describe("AnnotatableEssay (#332)", () => {
	test("bôi đen một phần từ → popover hiện trích đoạn bắt dính cả từ", () => {
		selectText("many benef");
		const dialog = screen.getByRole("dialog", { name: "Thêm highlight" });
		expect(dialog.textContent).toContain("many benefits");
	});

	test("đang kéo (pointer chưa thả) selectionchange không bật popover; thả tay mới bật", async () => {
		render(<AnnotatableEssay {...baseProps()} />);
		const container = screen.getByTestId("essay-text");
		fireEvent.pointerDown(container);
		setSelection("benefits");
		document.dispatchEvent(new Event("selectionchange"));
		// Chờ đủ qua debounce 250ms — handler chạy nhưng bị gate đang-kéo chặn.
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(screen.queryByRole("dialog", { name: "Thêm highlight" })).toBeNull();
		fireEvent.pointerUp(container);
		expect(screen.getByRole("dialog", { name: "Thêm highlight" })).toBeTruthy();
	});

	test("gõ ghi chú rồi Lưu highlight → onCreate nhận offset đúng", async () => {
		const props = selectText("many benef");
		fireEvent.change(screen.getByLabelText("Ghi chú"), {
			target: { value: "Dùng 'plenty of'." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu highlight" }));
		await waitFor(() => expect(props.onCreate).toHaveBeenCalledTimes(1));
		const input = (props.onCreate as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[0] as EssayAnnotationCreate;
		expect(input).toEqual({
			start: ESSAY.indexOf("many benefits"),
			end: ESSAY.indexOf("many benefits") + "many benefits".length,
			note: "Dùng 'plenty of'.",
		});
		// Lưu xong popover đóng.
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("vùng chọn đè highlight có sẵn → alert trùng, nút lưu disable", () => {
		const start = ESSAY.indexOf("many");
		const end = start + "many benefits".length;
		selectText(
			"many benefits",
			baseProps({
				annotations: [annotation("a-1", start, end)],
			}),
		);
		const dialog = screen.getByRole("dialog", { name: "Thêm highlight" });
		expect(dialog.textContent).toContain("Đoạn này trùng với highlight khác.");
		expect(
			(
				screen.getByRole("button", {
					name: "Lưu highlight",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test("vùng chọn chỉ có khoảng trắng → không mở popover", () => {
		selectText(" ");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("Esc đóng popover và không gọi onCreate", () => {
		selectText("benefits");
		fireEvent.keyDown(screen.getByRole("dialog", { name: "Thêm highlight" }), {
			key: "Escape",
		});
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("Enter trên highlight nhảy focus tới mục danh sách tương ứng", () => {
		const start = ESSAY.indexOf("benefits");
		render(
			<AnnotatableEssay
				{...baseProps({
					annotations: [annotation("ann-1", start, start + 8, "OK")],
				})}
			/>,
		);
		const mark = screen.getByRole("button", {
			name: "Highlight 1: OK",
		});
		fireEvent.keyDown(mark, { key: "Enter" });
		const item = document.getElementById("annotation-ann-1");
		expect(document.activeElement).toBe(item);
	});

	test("Sửa ghi chú từ danh sách gọi onUpdate(id, note)", async () => {
		const start = ESSAY.indexOf("benefits");
		const props = baseProps({
			annotations: [annotation("ann-1", start, start + 8, "Cũ")],
		});
		render(<AnnotatableEssay {...props} />);
		fireEvent.click(screen.getByRole("button", { name: "Sửa ghi chú 1" }));
		fireEvent.change(screen.getByLabelText("Ghi chú highlight 1"), {
			target: { value: "Mới" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
		await waitFor(() =>
			expect(props.onUpdate).toHaveBeenCalledWith("ann-1", "Mới"),
		);
	});

	test("Xoá highlight qua xác nhận tại chỗ gọi onDelete(id)", async () => {
		const start = ESSAY.indexOf("benefits");
		const props = baseProps({
			annotations: [annotation("ann-1", start, start + 8)],
		});
		render(<AnnotatableEssay {...props} />);
		fireEvent.click(screen.getByRole("button", { name: "Xoá highlight 1" }));
		fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
		await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith("ann-1"));
	});

	test("pending disable nút lưu highlight", () => {
		selectText("benefits", baseProps({ pending: true }));
		expect(
			(
				screen.getByRole("button", {
					name: "Lưu highlight",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test("danh sách rỗng hiện gợi ý bôi đen", () => {
		render(<AnnotatableEssay {...baseProps()} />);
		expect(
			screen.getByText(
				"Bôi đen từ hoặc cụm từ trong bài để highlight và ghi chú.",
			),
		).toBeTruthy();
	});
});
