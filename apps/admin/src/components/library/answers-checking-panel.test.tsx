// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnswersCheckingPanel } from "./answers-checking-panel";
import type { AnswerOverviewRow } from "./answers-overview";

function row(overrides: Partial<AnswerOverviewRow>): AnswerOverviewRow {
	return {
		number: 1,
		part: "p1",
		partLabel: "Passage 1",
		groupIndex: 0,
		questionOffset: 0,
		answer: "A",
		alts: [],
		missing: false,
		...overrides,
	};
}

const render = (rows: AnswerOverviewRow[]) =>
	renderToStaticMarkup(<AnswersCheckingPanel rows={rows} onJump={vi.fn()} />);

describe("AnswersCheckingPanel (render tĩnh)", () => {
	it("dòng tóm tắt đếm đúng tổng số câu và số câu thiếu đáp án", () => {
		const html = render([
			row({ number: 1 }),
			row({ number: 2, answer: "", missing: true }),
			row({ number: 3, answer: "", missing: true }),
		]);
		expect(html).toContain("3 câu · 2 câu thiếu đáp án");
	});

	it("nhóm theo part với nhãn slot ở h3; đáp án + alts phân cách ' / '", () => {
		const html = render([
			row({ number: 1, answer: "TRUE", alts: ["YES"] }),
			row({
				number: 4,
				part: "p2",
				partLabel: "Passage 2",
				answer: "FALSE",
			}),
		]);
		expect(html).toContain("Passage 1</h3>");
		expect(html).toContain("Passage 2</h3>");
		expect(html).toContain("TRUE / YES");
		expect(html).toContain("FALSE");
	});

	it("câu thiếu đáp án có nhãn 'Thiếu đáp án'", () => {
		const html = render([row({ number: 1, answer: "", missing: true })]);
		expect(html).toContain("Thiếu đáp án");
	});

	it("đề chưa có câu hỏi hiển thị trạng thái rỗng", () => {
		const html = render([]);
		expect(html).toContain("0 câu · 0 câu thiếu đáp án");
		expect(html).toContain("Chưa có câu hỏi nào để kiểm tra.");
	});

	it("mỗi câu có nút số câu để nhảy tới vị trí soạn", () => {
		const html = render([row({ number: 7 })]);
		expect(html).toMatch(/<button[^>]*>\s*7\s*<\/button>/);
	});

	it("nhắc dán đáp án hàng loạt ở tab Câu hỏi", () => {
		const html = render([]);
		expect(html).toContain(
			"Dán đáp án hàng loạt nằm trong tab Câu hỏi của từng nhóm.",
		);
	});
});
