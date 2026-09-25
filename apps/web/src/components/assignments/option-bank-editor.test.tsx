import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { QuestionItem } from "./assignment-presets";
import {
	bankTargetCount,
	fillBankToCount,
	OptionBankEditor,
	removeBankRow,
} from "./option-bank-editor";

function items(answers: string[]): QuestionItem[] {
	return answers.map((answer, index) => ({
		stem: `Câu ${index + 1}`,
		answer,
		opts: null,
		alts: "",
	}));
}

describe("removeBankRow (phase-02 FR3 positional reset)", () => {
	it("deleting a middle row renumbers the bank and resets answers at or after the deleted label", () => {
		const result = removeBankRow(
			["Boat builder", "Engineer", "Scientist", "Naturalist", "Explorer"],
			items(["A", "B", "C", "D"]),
			"features",
			2,
		);
		expect(result.bank).toEqual([
			"Boat builder",
			"Engineer",
			"Naturalist",
			"Explorer",
		]);
		// C (the deleted label) and D (shifted onto a different option) reset;
		// A and B still point at the same options.
		expect(result.items.map((item) => item.answer)).toEqual(["A", "B", "", ""]);
	});

	it("resets roman answers positionally for headings", () => {
		const result = removeBankRow(
			["Liệt kê I", "Liệt kê II", "Liệt kê III"],
			items(["i", "ii", "iii", "i"]),
			"headings",
			1,
		);
		expect(result.bank).toEqual(["Liệt kê I", "Liệt kê III"]);
		// "ii"/"iii" sat at or after the deleted row — reset. The last "i"
		// still points at the same option and stays.
		expect(result.items.map((item) => item.answer)).toEqual(["i", "", "", "i"]);
	});

	it("leaves empty answers and text-kind items untouched", () => {
		const result = removeBankRow(
			["Một", "Hai"],
			items(["", "A"]),
			"sentend",
			0,
		);
		expect(result.items.map((item) => item.answer)).toEqual(["", ""]);
	});

	it("tolerates answers outside the label alphabet without crashing", () => {
		const result = removeBankRow(
			["Một", "Hai", "Ba"],
			items(["TRUE", "A", "zzz"]),
			"features",
			0,
		);
		expect(result.bank).toEqual(["Hai", "Ba"]);
		expect(result.items.map((item) => item.answer)).toEqual([
			"TRUE",
			"",
			"zzz",
		]);
	});
});

describe("fillBankToCount (phase-02 FR3 'điền đủ N mục')", () => {
	it("pads to the target count and never shrinks", () => {
		expect(fillBankToCount([], 6)).toEqual(["", "", "", "", "", ""]);
		expect(fillBankToCount(["a"], 6)).toEqual(["a", "", "", "", "", ""]);
		expect(fillBankToCount(["a", "b"], 1)).toEqual(["a", "b"]);
	});

	it("bankTargetCount is min(questions + 2, 8)", () => {
		expect(bankTargetCount([])).toBe(2);
		expect(bankTargetCount(items(["", "", "", ""]))).toBe(6);
		// Cap: labels only exist up to H / viii.
		expect(bankTargetCount(items(["", "", "", "", "", "", ""]))).toBe(8);
	});
});

describe("OptionBankEditor render", () => {
	it("renders one labeled row per bank item with auto letter labels", () => {
		const html = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={["Ada", "Brunel", "Curie"]}
				items={items([])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain('aria-label="Mục A"');
		expect(html).toContain('aria-label="Mục B"');
		expect(html).toContain('aria-label="Mục C"');
		expect(html).toContain('value="Ada"');
	});

	it("renders roman labels for headings", () => {
		const html = renderToStaticMarkup(
			<OptionBankEditor
				typeId="headings"
				bank={["Liệt kê I", "Liệt kê II"]}
				items={items([])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(html).toContain('aria-label="Mục i"');
		expect(html).toContain('aria-label="Mục ii"');
	});

	it("offers 'Điền đủ N mục' with N = min(questions + 2, 8), disabled once reached", () => {
		const html = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={["Ada"]}
				items={items(["", "", "", ""])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Điền đủ 6 mục");

		const reached = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={["Ada", "B", "C", "D", "E", "F"]}
				items={items(["", "", "", ""])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(reached).toMatch(/Điền đủ 6 mục[^<]*<\/button>/);
		expect(reached).toContain("disabled=");
	});

	it("shows the panel error only when showErrors is on", () => {
		const quiet = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={[""]}
				items={items([])}
				showErrors={false}
				error="Điền nội dung cho mọi mục ngân hàng (1–200 ký tự)."
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(quiet).not.toContain("Điền nội dung cho mọi mục");

		const loud = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={[""]}
				items={items([])}
				showErrors
				error="Điền nội dung cho mọi mục ngân hàng (1–200 ký tự)."
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(loud).toContain('role="alert"');
		expect(loud).toContain("Điền nội dung cho mọi mục");
	});

	it("hides the per-row delete button while a single row remains", () => {
		const single = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={["Ada"]}
				items={items([])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(single).not.toContain('aria-label="Xóa mục A"');
		const many = renderToStaticMarkup(
			<OptionBankEditor
				typeId="features"
				bank={["Ada", "Brunel"]}
				items={items([])}
				showErrors={false}
				onBankChange={vi.fn()}
				onItemsChange={vi.fn()}
			/>,
		);
		expect(many).toContain('aria-label="Xóa mục A"');
		expect(many).toContain('aria-label="Xóa mục B"');
	});
});
