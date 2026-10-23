import { describe, expect, it } from "vitest";

import { questionSummary } from "./question-summary";

describe("questionSummary (#424 Task 1.5)", () => {
	it("MCQ có 4 lựa chọn → choiceCount 4", () => {
		const summary = questionSummary(
			{ stem: "Main idea?", answer: "B", opts: ["1", "2", "3", "4"], alts: "" },
			"mcq",
		);
		expect(summary.choiceCount).toBe(4);
		expect(summary.hasAnswer).toBe(true);
	});

	it("MCQ chưa nhập opts → fallback độ dài bộ đáp án chuẩn", () => {
		const summary = questionSummary(
			{ stem: "Q?", answer: "", opts: null, alts: "" },
			"mcq",
		);
		expect(summary.choiceCount).toBe(4);
	});

	it("dạng note (gõ chữ) → choiceCount null", () => {
		const summary = questionSummary(
			{ stem: "a ____ b", answer: "", opts: null, alts: "" },
			"note",
		);
		expect(summary.choiceCount).toBeNull();
		expect(summary.hasAnswer).toBe(false);
	});

	it("letter không có bank → null; có optionBank 3 mục → 3", () => {
		const noBank = questionSummary(
			{ stem: "Item", answer: "A", opts: null, alts: "" },
			"features",
		);
		expect(noBank.choiceCount).toBeNull();
		const banked = questionSummary(
			{ stem: "Item", answer: "A", opts: null, alts: "" },
			"features",
			["Ada", "Brunel", "Curie"],
		);
		expect(banked.choiceCount).toBe(3);
	});

	it("câu override item.type khác typeId → đếm theo item.type", () => {
		const summary = questionSummary(
			{
				stem: "Q",
				answer: "A",
				opts: ["1", "2", "3"],
				alts: "",
				type: "mcq",
			},
			"note",
		);
		expect(summary.choiceCount).toBe(3);
	});

	it("stem HTML dài bị rút gọn 90 ký tự kèm …, bỏ tag", () => {
		const summary = questionSummary(
			{
				stem: `<p>${"x".repeat(120)}</p>`,
				answer: "A",
				opts: null,
				alts: "",
			},
			"note",
		);
		expect(summary.excerpt.length).toBe(91);
		expect(summary.excerpt.endsWith("…")).toBe(true);
		expect(summary.excerpt).not.toContain("<");
	});

	it("stem rỗng → excerpt rỗng; thiếu đáp án", () => {
		const summary = questionSummary(
			{ stem: "", answer: "   ", opts: null, alts: "" },
			"tfng",
		);
		expect(summary.excerpt).toBe("");
		expect(summary.hasAnswer).toBe(false);
	});

	it("hasExplanation theo explanation đã có", () => {
		expect(
			questionSummary(
				{
					stem: "s",
					answer: "A",
					opts: null,
					alts: "",
					explanation: "<p>e</p>",
				},
				"note",
			).hasExplanation,
		).toBe(true);
		expect(
			questionSummary({ stem: "s", answer: "A", opts: null, alts: "" }, "note")
				.hasExplanation,
		).toBe(false);
	});
});
