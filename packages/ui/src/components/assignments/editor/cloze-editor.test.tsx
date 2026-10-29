import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { QuestionItem } from "./assignment-presets";
import { ClozeEditor } from "./cloze-editor";

const item = (overrides: Partial<QuestionItem> = {}): QuestionItem => ({
	stem: "",
	opts: null,
	answer: "",
	alts: "",
	...overrides,
});

describe("ClozeEditor — visual paste stage (phase-03 FR1)", () => {
	it("renders the paste textarea and the tokenize gate (disabled while empty)", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor typeId="summary" items={[]} onApply={vi.fn()} />,
		);
		expect(html).toContain("Dán đoạn văn bản");
		expect(html).toContain("Chọn chỗ trống");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Chọn chỗ trống/);
		// No tokens yet — the click-to-blank surface only appears after the gate.
		expect(html).not.toContain("Áp vào câu hỏi");
	});

	it("enables the tokenize gate once a source exists", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource="Monsoon rains refill the stepwells."
				initialStage="paste"
			/>,
		);
		expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>\s*Chọn chỗ trống/);
	});

	it("offers a transcript-flavored placeholder for listening completion types", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor typeId="notes" items={[]} onApply={vi.fn()} />,
		);
		expect(html).toContain("transcript");
	});
});

describe("ClozeEditor — visual token stage (phase-03 FR1/FR2)", () => {
	const source = "Monsoon rains refill the stepwells each year.";
	const blanks = [{ tokenIndex: 4, answer: "the", alts: "" }];

	it("renders clickable word tokens with the blank toggled on", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource={source}
				initialStage="tokens"
				initialBlanks={blanks}
			/>,
		);
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain("Monsoon");
		expect(html).toContain("stepwells");
		expect(html).toContain("Áp vào câu hỏi");
		// FR2: blanks count == questions it will create.
		expect(html).toContain("1/40 chỗ trống");
		expect(html).toContain("Số câu sẽ tạo: 1");
	});

	it("shows the expected question count for several blanks", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource={source}
				initialStage="tokens"
				initialBlanks={[
					{ tokenIndex: 1, answer: "rains", alts: "" },
					{ tokenIndex: 4, answer: "the", alts: "" },
					{ tokenIndex: 5, answer: "stepwells", alts: "" },
				]}
			/>,
		);
		expect(html).toContain("3/40 chỗ trống");
		expect(html).toContain("Số câu sẽ tạo: 3");
	});

	it("disables apply while nothing is blanked", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource={source}
				initialStage="tokens"
			/>,
		);
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào câu hỏi/);
	});

	it("caps the rendered tokens and hints to shorten the text", () => {
		const long = Array.from({ length: 5100 }, (_, index) => `w${index}`).join(
			" ",
		);
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource={long}
				initialStage="tokens"
			/>,
		);
		expect(html).toContain("rút ngắn");
		const tokenButtons = html.match(/Chọn từ: /g)?.length ?? 0;
		expect(tokenButtons).toBeLessThanOrEqual(5000);
	});

	it("warns that applying replaces composed items (confirm before overwrite, FR2)", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[item({ stem: "old", answer: "key" })]}
				onApply={vi.fn()}
				initialSource={source}
				initialStage="tokens"
				initialBlanks={blanks}
			/>,
		);
		expect(html).toContain("thay thế 1 câu");
	});
});

describe("ClozeEditor — raw mode (phase-03 FR1, H5P syntax)", () => {
	it("live-parses *answer/alt* blanks and lists them under the field", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="sent"
				items={[]}
				onApply={vi.fn()}
				initialMode="raw"
				initialSource={"The *cat/feline* saw the *mat*"}
			/>,
		);
		expect(html).toContain("Tìm thấy 2 chỗ trống");
		expect(html).toContain("cat");
		expect(html).toContain("feline");
		expect(html).toContain("mat");
		expect(html).toContain("Số câu sẽ tạo: 2");
		expect(html).toContain("Áp vào câu hỏi");
	});

	it("blocks apply above the 40-blank cap with the cap message (FR2)", () => {
		const source = Array.from(
			{ length: 41 },
			(_, index) => `w${index} *x*`,
		).join(" ");
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="sent"
				items={[]}
				onApply={vi.fn()}
				initialMode="raw"
				initialSource={source}
			/>,
		);
		expect(html).toContain("Tối đa 40 chỗ trống");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào câu hỏi/);
	});

	it("blocks apply when a segment would exceed the 500-char stem cap", () => {
		const source = `${"word ".repeat(120)}*x*`;
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="sent"
				items={[]}
				onApply={vi.fn()}
				initialMode="raw"
				initialSource={source}
			/>,
		);
		expect(html).toContain("vượt quá 500 ký tự");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào câu hỏi/);
	});

	it("keeps apply disabled when the syntax has no blanks", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="sent"
				items={[]}
				onApply={vi.fn()}
				initialMode="raw"
				initialSource="no markers here"
			/>,
		);
		expect(html).toContain("Tìm thấy 0 chỗ trống");
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Áp vào câu hỏi/);
	});
});

describe("ClozeEditor — blank popover (phase-03 FR3)", () => {
	it("opens the answer/alts editor for an active blank with a remove action", () => {
		const html = renderToStaticMarkup(
			<ClozeEditor
				typeId="summary"
				items={[]}
				onApply={vi.fn()}
				initialSource="Monsoon rains refill the stepwells."
				initialStage="tokens"
				initialBlanks={[{ tokenIndex: 4, answer: "the", alts: "a" }]}
				initialActiveBlank={4}
			/>,
		);
		expect(html).toContain('value="the"');
		expect(html).toContain('value="a"');
		expect(html).toContain("Bỏ chỗ trống");
	});
});
