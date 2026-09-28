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
				{
					stem: "The lake is in the …… valley.",
					answer: "northern",
					opts: null,
					alts: "north",
				},
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

	it("flags an mcq option over the 500-char contract cap", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{
					stem: "Main idea?",
					answer: "A",
					opts: ["o".repeat(501), "Two", "Three", "Four"],
					alts: "",
				},
			],
			showErrors: true,
		});
		expect(html).toContain("Lựa chọn vượt quá 500 ký tự.");
	});

	it("a draft (requireFilled=false) stays quiet about missing stem/answer but still flags over-cap and invalid choices", () => {
		const draftQuiet = renderGrid({
			items: [emptyItem("tfng")],
			showErrors: true,
			requireFilled: false,
		});
		expect(draftQuiet).not.toContain("Nhập nội dung câu hỏi.");
		expect(draftQuiet).not.toContain("Khóa đáp án đúng.");

		const draftLoud = renderGrid({
			items: [{ stem: "s".repeat(501), answer: "MAYBE", opts: null, alts: "" }],
			showErrors: true,
			requireFilled: false,
		});
		expect(draftLoud).toContain("vượt quá 500 ký tự");
		expect(draftLoud).toContain("không thuộc bộ đáp án");
	});

	it("keeps rows quiet until blur or save", () => {
		const html = renderGrid({ items: [emptyItem("tfng")], showErrors: false });
		expect(html).not.toContain("Nhập nội dung câu hỏi.");
		expect(html).not.toContain("Khóa đáp án đúng.");
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

describe("AnswerKeyGrid — marker rule (phase-03 FR7)", () => {
	it("flags a stem with two or more ____ markers inside the row, in both statuses", () => {
		for (const requireFilled of [true, false]) {
			const html = renderGrid({
				typeId: "sent",
				items: [{ stem: "a ____ b ____ c", answer: "x", opts: null, alts: "" }],
				showErrors: true,
				requireFilled,
			});
			expect(html).toContain("2 chỗ trống");
			expect(html).toContain("một chỗ trống");
		}
	});

	it("one marker and zero markers stay valid", () => {
		const html = renderGrid({
			typeId: "sent",
			items: [
				{ stem: "with ____ marker", answer: "x", opts: null, alts: "" },
				{ stem: "[table] r1 c1: A / B", answer: "y", opts: null, alts: "" },
			],
			showErrors: true,
		});
		expect(html).not.toContain("chỗ trống (____)");
		expect(html).not.toContain("một chỗ trống.");
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

describe("AnswerKeyGrid — option bank chips (phase-02 FR4)", () => {
	it("sources letter chips from the bank for bankable kinds: 5 rows → A–E only", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(2, ["A", "C"]),
			optionBank: ["Ada", "Brunel", "Curie", "Darwin", "Einstein"],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: E"');
		expect(html).not.toContain('aria-label="Câu 27: F"');
		expect(html).not.toContain('aria-label="Câu 27: H"');
		// Keyed answers still render as selected.
		expect(html).toMatch(/aria-pressed="true"[^>]*>A</);
	});

	it("falls back to the full alphabet when the bank is empty (draft UX)", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(1),
			optionBank: [],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: H"');
	});

	it("sources roman chips from the bank for headings", () => {
		const html = renderGrid({
			typeId: "headings",
			skill: "reading",
			partId: "p2",
			items: tfngItems(1, ["i"]),
			optionBank: ["I", "II", "III"],
		});
		expect(html).toContain('aria-label="Câu 14: i"');
		expect(html).toContain('aria-label="Câu 14: iii"');
		expect(html).not.toContain('aria-label="Câu 14: iv"');
	});

	it("sentend used labels render disabled and faded; features may reuse", () => {
		const sentend = renderGrid({
			typeId: "sentend",
			skill: "reading",
			partId: "p2",
			items: tfngItems(2, ["A", ""]),
			optionBank: ["Nửa A", "Nửa B", "Nửa C"],
		});
		// Row 2's "A" chip is disabled + faded (row 1 already keyed it).
		expect(sentend).toContain('aria-label="Câu 15: A" disabled');
		expect(sentend).toContain("opacity-40");
		expect(sentend).not.toContain('aria-label="Câu 15: B" disabled');

		const features = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(2, ["A", ""]),
			optionBank: ["Ada", "Brunel", "Curie"],
		});
		expect(features).not.toContain('aria-label="Câu 27: A" disabled');
	});

	it("the current row's own selection stays enabled", () => {
		const html = renderGrid({
			typeId: "sentend",
			skill: "reading",
			partId: "p2",
			items: tfngItems(2, ["A", "A"]),
			optionBank: ["Nửa A", "Nửa B", "Nửa C"],
		});
		expect(html).toMatch(/aria-pressed="true"[^>]*>A</);
		expect(html).not.toContain('aria-label="Câu 14: A" disabled');
	});

	it("flags a keyed answer beyond the bank length as invalid", () => {
		const html = renderGrid({
			typeId: "features",
			skill: "reading",
			partId: "p3",
			items: tfngItems(1, ["F"]),
			optionBank: ["Ada", "Brunel"],
			showErrors: true,
		});
		expect(html).toContain("không thuộc bộ đáp án");
	});

	it("non-bankable kinds ignore the optionBank prop entirely", () => {
		const html = renderGrid({
			typeId: "mcq",
			skill: "reading",
			partId: "p3",
			items: [
				{ stem: "Main idea?", answer: "A", opts: ["", "", "", ""], alts: "" },
			],
			optionBank: ["Ada", "Brunel"],
		});
		expect(html).toContain('aria-label="Câu 27: A"');
		expect(html).toContain('aria-label="Câu 27: D"');
	});
});
