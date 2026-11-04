import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyComposer } from "./assignment-presets";
import { PromptComposer } from "./prompt-composer";

function readingComposer() {
	return {
		skill: "reading",
		part: "p1",
		type: "tfng",
		band: "7.0",
		...emptyComposer("reading", "tfng"),
		title: "Passage 1 TFNG",
	};
}

describe("PromptComposer lockPart (phase-03 Task 3.2)", () => {
	it("mặc định (không lockPart) vẫn render ChipFilter skill/part như cũ", () => {
		const html = renderToStaticMarkup(
			<PromptComposer
				value={readingComposer()}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Kỹ năng");
		expect(html).toContain("Writing");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("Passage 2");
		expect(html).toContain("Passage 3");
		expect(html).toContain('aria-pressed="true"');
	});

	it("lockPart: chip tĩnh skill/part, không ChipFilter đổi skill/part", () => {
		const html = renderToStaticMarkup(
			<PromptComposer
				value={readingComposer()}
				showErrors={false}
				status="ready"
				lockPart
				onFieldChange={vi.fn()}
			/>,
		);
		// Label tĩnh từ value: đúng skill + part của slot.
		expect(html).toContain("Reading");
		expect(html).toContain("Passage 1");
		// Không còn chip đổi skill/part: option các skill/part khác biến mất.
		expect(html).not.toContain("Writing");
		expect(html).not.toContain("Listening");
		expect(html).not.toContain("Speaking");
		expect(html).not.toContain("Passage 2");
		expect(html).not.toContain("Passage 3");
		// Dạng câu hỏi vẫn đổi được (ChipFilter type giữ nguyên).
		expect(html).toContain("True / False / NG");
	});
});

describe("PromptComposer showExplanation (#571)", () => {
	it("render ô Giải thích câu 1 cho kỹ năng chấm tự động (reading, grammar) và ẩn ở writing", () => {
		const readingHtml = renderToStaticMarkup(
			<PromptComposer
				value={readingComposer()}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(readingHtml).toContain("Giải thích câu 1");

		const grammarHtml = renderToStaticMarkup(
			<PromptComposer
				value={{
					skill: "grammar",
					part: "g1",
					type: "mcq",
					band: "6.5",
					...emptyComposer("grammar", "mcq"),
					title: "Grammar MCQ",
				}}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(grammarHtml).toContain("Giải thích câu 1");

		const writingHtml = renderToStaticMarkup(
			<PromptComposer
				value={{
					skill: "writing",
					part: "task2",
					type: "discuss",
					band: "7.0",
					...emptyComposer("writing", "discuss"),
					title: "Writing Task 2",
				}}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(writingHtml).not.toContain("Giải thích câu");
	});
});

describe("PromptComposer — optional Writing section on auto skills (#574)", () => {
	it("shows 'Thêm phần Writing' on auto skills when !lockPart, hides on writing/speaking and when lockPart=true", () => {
		const autoHtml = renderToStaticMarkup(
			<PromptComposer
				value={readingComposer()}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(autoHtml).toContain("Thêm phần Writing");

		const lockedHtml = renderToStaticMarkup(
			<PromptComposer
				value={readingComposer()}
				showErrors={false}
				status="ready"
				lockPart
				onFieldChange={vi.fn()}
			/>,
		);
		expect(lockedHtml).not.toContain("Thêm phần Writing");

		const withWritingHtml = renderToStaticMarkup(
			<PromptComposer
				value={{
					...readingComposer(),
					writing: {
						part: "task2",
						type: "discuss",
						prompt: "<p>Write about urbanization.</p>",
					},
				}}
				showErrors={false}
				status="ready"
				onFieldChange={vi.fn()}
			/>,
		);
		expect(withWritingHtml).toContain("Phần Writing đi kèm");
		expect(withWritingHtml).toContain("Bỏ phần Writing");
	});
});
