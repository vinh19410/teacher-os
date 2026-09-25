import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { QuestionItem } from "./assignment-presets";
import { TableGridEditor } from "./table-grid-editor";

const item = (overrides: Partial<QuestionItem> = {}): QuestionItem => ({
	stem: "",
	opts: null,
	answer: "",
	alts: "",
	...overrides,
});

describe("TableGridEditor — grid layout (phase-03 FR4)", () => {
	it("renders a titled grid: column headers, row labels and data cells", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor items={[]} onApply={vi.fn()} />,
		);
		expect(html).toContain("Tiêu đề cột 1");
		expect(html).toContain("Tiêu đề cột 2");
		expect(html).toContain("Tiêu đề hàng 1");
		expect(html).toContain("Tiêu đề hàng 2");
		expect(html).toContain("Ô hàng 1 cột 1");
		expect(html).toContain("Ô hàng 2 cột 2");
	});

	it("offers row/column add and remove, guarded at the 1×1 minimum", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor items={[]} onApply={vi.fn()} />,
		);
		expect(html).toContain("Thêm hàng");
		expect(html).toContain("Thêm cột");
		expect(html).toContain("Xóa hàng 1");
		expect(html).toContain("Xóa cột 2");
	});

	it("shows the blank counter and gates apply until a cell is blanked", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor items={[]} onApply={vi.fn()} />,
		);
		expect(html).toContain("0/40 ô trống");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào bảng/);
	});
});

describe("TableGridEditor — blanking cells (phase-03 FR4)", () => {
	const blanked = {
		colTitles: ["Invention", "Year"],
		rowTitles: ["Steam engine", ""],
		cells: [
			["", "1769"],
			["", ""],
		],
		blanks: [{ row: 0, col: 0, answer: "piston", alts: "" }],
	};

	it("renders a blanked cell as the ____ placeholder with its stored answer in the popover path", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor
				items={[]}
				onApply={vi.fn()}
				initialGrid={blanked}
			/>,
		);
		expect(html).toContain("Chỗ trống ô hàng 1 cột 1");
		expect(html).toContain("____");
		expect(html).toContain("1/40 ô trống");
		expect(html).toContain("Số câu sẽ tạo: 1");
		// The answer must never render inside the grid (it lives in the popover).
		expect(html).not.toContain('value="piston"');
		// Apply is enabled now.
		expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào bảng/);
	});

	it("opens the popover with the answer and alts for an active blank", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor
				items={[]}
				onApply={vi.fn()}
				initialGrid={blanked}
				initialActiveCell={[0, 0]}
			/>,
		);
		expect(html).toContain('value="piston"');
		expect(html).toContain("Bỏ chỗ trống");
	});

	it("warns that applying replaces composed items (confirm before overwrite)", () => {
		const html = renderToStaticMarkup(
			<TableGridEditor
				items={[item({ stem: "old", answer: "key" })]}
				onApply={vi.fn()}
				initialGrid={blanked}
			/>,
		);
		expect(html).toContain("thay thế 1 câu");
	});
});

describe("TableGridEditor — caps (phase-03 FR2 parity)", () => {
	it("blocks apply above 40 blanks with the cap message", () => {
		const blanks = Array.from({ length: 41 }, (_, index) => ({
			row: index % 7,
			col: (index * 3) % 7,
			answer: "x",
			alts: "",
		}));
		const html = renderToStaticMarkup(
			<TableGridEditor
				items={[]}
				onApply={vi.fn()}
				initialGrid={{
					colTitles: Array.from({ length: 7 }, () => ""),
					rowTitles: Array.from({ length: 7 }, () => ""),
					cells: Array.from({ length: 7 }, () =>
						Array.from({ length: 7 }, () => ""),
					),
					blanks,
				}}
			/>,
		);
		expect(html).toContain("Tối đa 40 ô trống");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào bảng/);
	});

	it("blocks apply when a label stem would exceed 500 chars", () => {
		const longTitle = "t".repeat(480);
		const html = renderToStaticMarkup(
			<TableGridEditor
				items={[]}
				onApply={vi.fn()}
				initialGrid={{
					colTitles: [longTitle],
					rowTitles: [longTitle],
					cells: [[""]],
					blanks: [{ row: 0, col: 0, answer: "x", alts: "" }],
				}}
			/>,
		);
		expect(html).toContain("vượt quá 500 ký tự");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào bảng/);
	});
});
