// @vitest-environment jsdom
import {
	locatePlacementErrors,
	type PlacementError,
} from "@teacher-os/api/placement-test-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlacementErrorHighlighter } from "./placement-error-highlighter";

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
	window.getSelection()?.removeAllRanges();
	cleanup();
});

const TEXT = "I goes to school yesterday and I buyed a book.";

function err(
	id: string,
	quote: string,
	overrides: Partial<PlacementError> = {},
): PlacementError {
	return {
		id,
		category: "grammar",
		quote,
		start: null,
		end: null,
		correction: "",
		explanation: "",
		...overrides,
	};
}

const SEED = locatePlacementErrors(TEXT, [
	err("e1", "goes", { correction: "went", explanation: "Quá khứ đơn" }),
	err("e2", "buyed", { category: "spelling", correction: "bought" }),
]);

function Harness({
	initial = SEED,
	onChange,
}: {
	initial?: PlacementError[];
	onChange?: (next: PlacementError[]) => void;
}) {
	const [errors, setErrors] = useState(initial);
	return (
		<PlacementErrorHighlighter
			skill="writing"
			text={TEXT}
			emptyText="(trống)"
			errors={errors}
			onChange={(next) => {
				setErrors(next);
				onChange?.(next);
			}}
		/>
	);
}

/** Bôi đen [start, end) trên văn bản nguồn qua DOM thật rồi thả chuột. */
function selectSource(start: number, end: number) {
	const container = screen.getByTestId("writing-highlight-text");
	const segs = Array.from(
		container.querySelectorAll<HTMLElement>("[data-start]"),
	);
	const locate = (offset: number) => {
		for (const seg of segs) {
			const s = Number(seg.dataset.start);
			const len = seg.textContent?.length ?? 0;
			if (offset >= s && offset <= s + len) {
				return { node: seg.firstChild as Node, off: offset - s };
			}
		}
		throw new Error(`no segment for ${offset}`);
	};
	const a = locate(start);
	const b = locate(end);
	const range = document.createRange();
	range.setStart(a.node, a.off);
	range.setEnd(b.node, b.off);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	fireEvent.mouseUp(container);
}

describe("PlacementErrorHighlighter", () => {
	it("tô lỗi theo loại kèm số thứ tự, aria-label và chú giải màu", () => {
		render(<Harness />);
		const marks = screen.getAllByTestId("writing-error-mark");
		expect(marks.map((m) => m.textContent)).toEqual(["goes", "buyed"]);
		expect(marks[0]?.getAttribute("aria-label")).toContain("Lỗi 1: Ngữ pháp");
		expect(marks[1]?.getAttribute("aria-label")).toContain("Lỗi 2: Chính tả");
		expect(marks[1]?.className).toContain("decoration-wavy");
		expect(screen.getAllByText("①")).toHaveLength(2); // badge trong bài + nút số trên thẻ
		expect(
			within(screen.getByLabelText("Chú giải loại lỗi")).getByText("Phát âm"),
		).toBeTruthy();
		const cards = screen.getAllByTestId("writing-error-card");
		expect(cards[0]?.textContent).toContain("goes");
		expect(cards[0]?.textContent).toContain("went");
		expect(cards[0]?.textContent).toContain("Quá khứ đơn");
	});

	it("Enter trên mark focus thẻ lỗi; nút số trên thẻ focus lại mark", () => {
		render(<Harness />);
		const mark = screen.getAllByTestId("writing-error-mark")[1] as HTMLElement;
		fireEvent.keyDown(mark, { key: "Enter" });
		const cards = screen.getAllByTestId("writing-error-card");
		expect(document.activeElement).toBe(cards[1]);
		fireEvent.click(screen.getByLabelText("Xem lỗi 1 trong bài viết"));
		expect(document.activeElement).toBe(
			screen.getAllByTestId("writing-error-mark")[0],
		);
	});

	it("thêm lỗi từ đoạn bôi đen với offset theo văn bản nguồn và đánh số lại", () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);
		const addBtn = screen.getByTestId("writing-add-error-btn");
		expect((addBtn as HTMLButtonElement).disabled).toBe(true);

		// " yesterday" (có khoảng trắng đầu) nằm sau mark "goes" + badge ① trong DOM.
		const start = TEXT.indexOf(" yesterday");
		selectSource(start, start + " yesterday".length);
		expect((addBtn as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(addBtn);

		const form = screen.getByTestId("writing-error-form");
		fireEvent.change(within(form).getByLabelText("Loại lỗi"), {
			target: { value: "vocabulary" },
		});
		fireEvent.change(within(form).getByLabelText("Cách sửa"), {
			target: { value: "last week" },
		});
		fireEvent.change(within(form).getByLabelText("Giải thích"), {
			target: { value: "Sai mốc thời gian" },
		});
		fireEvent.click(screen.getByTestId("writing-error-save-btn"));

		const next = onChange.mock.lastCall?.[0] as PlacementError[];
		expect(next.map((e) => e.quote)).toEqual(["goes", "yesterday", "buyed"]);
		const added = next[1];
		expect(added).toMatchObject({
			category: "vocabulary",
			quote: "yesterday",
			start: TEXT.indexOf("yesterday"),
			end: TEXT.indexOf("yesterday") + "yesterday".length,
			correction: "last week",
			explanation: "Sai mốc thời gian",
		});
		expect(added?.id.length).toBeLessThanOrEqual(40);
		const marks = screen.getAllByTestId("writing-error-mark");
		expect(marks[1]?.getAttribute("aria-label")).toContain("Lỗi 2: Từ vựng");
		expect(marks[2]?.getAttribute("aria-label")).toContain("Lỗi 3: Chính tả");
	});

	it("chặn thêm lỗi khi đoạn chọn trùng lỗi đã có", () => {
		render(<Harness />);
		const start = TEXT.indexOf("goes");
		selectSource(start, start + 2);
		expect(
			(screen.getByTestId("writing-add-error-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(screen.getByText(/trùng với lỗi ①/)).toBeTruthy();
	});

	it("sửa loại/cách sửa của thẻ và xoá thẻ", () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);
		fireEvent.click(screen.getByLabelText("Sửa lỗi 2"));
		const form = screen.getByTestId("writing-error-form");
		fireEvent.change(within(form).getByLabelText("Loại lỗi"), {
			target: { value: "grammar" },
		});
		fireEvent.change(within(form).getByLabelText("Cách sửa"), {
			target: { value: "bought (quá khứ của buy)" },
		});
		fireEvent.click(screen.getByTestId("writing-error-save-btn"));
		let next = onChange.mock.lastCall?.[0] as PlacementError[];
		expect(next[1]).toMatchObject({
			id: "e2",
			category: "grammar",
			correction: "bought (quá khứ của buy)",
			start: TEXT.indexOf("buyed"),
		});

		fireEvent.click(screen.getByLabelText("Xoá lỗi 1"));
		next = onChange.mock.lastCall?.[0] as PlacementError[];
		expect(next.map((e) => e.id)).toEqual(["e2"]);
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);
		expect(
			screen.getByTestId("writing-error-mark").getAttribute("aria-label"),
		).toContain("Lỗi 1: Ngữ pháp");
	});

	it("sửa quote thành đoạn không có trong bài → thẻ vẫn còn nhưng không tô", () => {
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);
		fireEvent.click(screen.getByLabelText("Sửa lỗi 1"));
		const form = screen.getByTestId("writing-error-form");
		fireEvent.change(within(form).getByLabelText("Đoạn bị sai"), {
			target: { value: "không có" },
		});
		fireEvent.click(screen.getByTestId("writing-error-save-btn"));
		const next = onChange.mock.lastCall?.[0] as PlacementError[];
		expect(next.map((e) => [e.id, e.start])).toEqual([
			["e2", TEXT.indexOf("buyed")],
			["e1", null],
		]);
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);
		expect(screen.getByText(/Không tìm thấy đoạn này/)).toBeTruthy();
	});

	it("báo lỗi validate khi xoá trống đoạn bị sai", () => {
		render(<Harness />);
		fireEvent.click(screen.getByLabelText("Sửa lỗi 1"));
		const form = screen.getByTestId("writing-error-form");
		fireEvent.change(within(form).getByLabelText("Đoạn bị sai"), {
			target: { value: "  " },
		});
		fireEvent.click(screen.getByTestId("writing-error-save-btn"));
		expect(screen.getByRole("alert").textContent).toContain(
			"không được để trống",
		);
	});
});
