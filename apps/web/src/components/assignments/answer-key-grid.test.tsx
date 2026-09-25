import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnswerKeyGrid } from "./answer-key-grid";
import { emptyItem } from "./assignment-presets";

function tfngItems(count: number, answers: string[] = []) {
	return Array.from({ length: count }, (_, index) => ({
		stem: `Statement ${index + 1}`,
		answer: answers[index] ?? "",
		opts: null,
		alts: "",
	}));
}

function renderGrid(props: Partial<Parameters<typeof AnswerKeyGrid>[0]>) {
	return renderToStaticMarkup(
		<AnswerKeyGrid
			typeId="tfng"
			skill="reading"
			partId="p1"
			items={tfngItems(1)}
			showErrors={false}
			onItemsChange={vi.fn()}
			onAddQuestion={vi.fn()}
			{...props}
		/>,
	);
}

describe("AnswerKeyGrid — three row kinds (phase-01 FR1/FR2/FR4)", () => {
	it("renders tfng rows with REAL question numbers from qStart, not 1..n", () => {
		const html = renderGrid({
			typeId: "ynng",
			skill: "listening",
			partId: "s4",
			items: tfngItems(3),
		});
		expect(html).toContain("Câu 31");
		expect(html).toContain("Câu 32");
		expect(html).toContain("Câu 33");
		expect(html).not.toMatch(/Câu 1</);
		expect(html).toContain("YES");
		expect(html).toContain("NOT GIVEN");
	});

	it("wires aria-pressed and per-chip aria-labels on the answer chips", () => {
		const html = renderGrid({
			items: tfngItems(1, ["TRUE"]),
		});
		expect(html).toContain('aria-label="Câu 1: TRUE"');
		expect(html).toContain('aria-label="Câu 1: FALSE"');
		expect(html).toContain('aria-label="Câu 1: NOT GIVEN"');
		// Exactly the selected chip is pressed.
		expect(html).toMatch(/aria-pressed="true"[^>]*>TRUE</);
		expect(html).toMatch(/aria-pressed="false"[^>]*>FALSE</);
	});

	it("carries data-qindex on each row for focus management", () => {
		const html = renderGrid({ items: tfngItems(3) });
		expect(html).toContain('data-qindex="0"');
		expect(html).toContain('data-qindex="1"');
		expect(html).toContain('data-qindex="2"');
	});

	it("renders mcq rows with stem input, A–D chips and option inputs", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{
					stem: "What is the main idea?",
					answer: "B",
					opts: ["One", "Two", "Three", "Four"],
					alts: "",
				},
			],
		});
		expect(html).toContain("Câu 27");
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toMatch(/aria-pressed="true"[^>]*>B</);
		expect(html).toContain('placeholder="Lựa chọn A"');
		expect(html).toContain('placeholder="Lựa chọn D"');
		expect(html).toContain("Four");
	});

	it("renders letter rows with A–H chips and no free-text answer/alts inputs", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: [{ stem: "29 is", answer: "B", opts: null, alts: "" }],
		});
		expect(html).toContain(">A<");
		expect(html).toContain(">H<");
		expect(html).not.toContain("Chấp nhận thêm, cách nhau bằng /");
	});

	it("renders roman rows with i–viii chips", () => {
		const html = renderGrid({
			typeId: "headings",
			skill: "reading",
			partId: "p2",
			items: [{ stem: "Paragraph A", answer: "iii", opts: null, alts: "" }],
		});
		expect(html).toContain(">i<");
		expect(html).toContain(">viii<");
		expect(html).toMatch(/aria-pressed="true"[^>]*>iii</);
	});

	it("renders text rows with stem, answer and alts inputs in one grid row", () => {
		const html = renderGrid({
			typeId: "sent",
			skill: "reading",
			partId: "p1",
			items: [
				{ stem: "The lake is in the …… valley.", answer: "northern", opts: null, alts: "north" },
			],
		});
		expect(html).toContain('aria-label="Nội dung câu hỏi phía học viên"');
		expect(html).toContain('aria-label="Đáp án chấm tự động"');
		expect(html).toContain('aria-label="Chấp nhận thêm, cách nhau bằng /"');
		expect(html).toContain("northern");
		expect(html).not.toContain('aria-label="Câu 1: TRUE"');
	});
});

describe("AnswerKeyGrid — per-row validation (phase-01 FR9)", () => {
	it("shows missing stem/answer errors inside the row when showErrors is on", () => {
		const html = renderGrid({
			items: [emptyItem("tfng")],
			showErrors: true,
		});
		expect(html).toContain("Nhập nội dung câu hỏi.");
		expect(html).toContain("Khóa đáp án đúng.");
	});

	it("keeps rows quiet until blur or save", () => {
		const html = renderGrid({ items: [emptyItem("tfng")], showErrors: false });
		expect(html).not.toContain("Nhập nội dung câu hỏi.");
		expect(html).not.toContain("Khóa đáp án đúng.");
	});

	it("flags over-cap stem (500), answer (200) and alts (500) — contract caps", () => {
		const html = renderGrid({
			items: [
				{
					stem: "s".repeat(501),
					answer: "a".repeat(201),
					opts: null,
					alts: "x".repeat(501),
				},
			],
			typeId: "sent",
			showErrors: true,
		});
		expect(html).toContain("vượt quá 500 ký tự");
		expect(html).toContain("vượt quá 200 ký tự");
	});

	it("flags a stored answer outside the choice set", () => {
		const html = renderGrid({
			items: [{ stem: "S", answer: "MAYBE", opts: null, alts: "" }],
			showErrors: true,
		});
		expect(html).toContain("không thuộc bộ đáp án");
	});

	it("does not flag an empty alts field (alts are optional)", () => {
		const html = renderGrid({
			typeId: "sent",
			items: [{ stem: "S", answer: "x", opts: null, alts: "" }],
			showErrors: true,
		});
		expect(html).not.toContain("vượt quá");
	});
});

describe("AnswerKeyGrid — row actions", () => {
	it("keeps the per-row delete button hidden while a single row remains", () => {
		const single = renderGrid({ items: [emptyItem("tfng")] });
		expect(single).not.toContain("Xóa");
		const many = renderGrid({ items: tfngItems(2) });
		expect(many).toContain("Xóa");
	});
});
