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

describe("PromptComposer writing type selection (#577)", () => {
	it("không chọn sẵn dạng đề nào khi type rỗng và hiển thị lỗi khi showErrors=true", () => {
		const htmlNoErrors = renderToStaticMarkup(
			<PromptComposer
				value={{
					skill: "writing",
					part: "task2",
					type: "",
					band: "7.0",
					...emptyComposer("writing", ""),
					title: "Writing Task 2",
				}}
				showErrors={false}
				status="ready"
				errors={{ type: "Chọn dạng đề trước khi lưu sẵn sàng giao." }}
				onFieldChange={vi.fn()}
			/>,
		);
		expect(htmlNoErrors).toContain("Discuss both views");
		expect(htmlNoErrors).toContain("Opinion");
		expect(htmlNoErrors).toContain("Advantages");
		expect(htmlNoErrors).toContain("Problem / Solution");
		expect(htmlNoErrors).not.toMatch(
			/aria-pressed="true"[^>]*>Discuss both views/,
		);
		expect(htmlNoErrors).not.toMatch(/aria-pressed="true"[^>]*>Opinion/);
		expect(htmlNoErrors).not.toMatch(/aria-pressed="true"[^>]*>Advantages/);
		expect(htmlNoErrors).not.toMatch(
			/aria-pressed="true"[^>]*>Problem \/ Solution/,
		);
		expect(htmlNoErrors).not.toContain(
			"Chọn dạng đề trước khi lưu sẵn sàng giao.",
		);

		const htmlWithErrors = renderToStaticMarkup(
			<PromptComposer
				value={{
					skill: "writing",
					part: "task2",
					type: "",
					band: "7.0",
					...emptyComposer("writing", ""),
					title: "Writing Task 2",
				}}
				showErrors={true}
				status="ready"
				errors={{ type: "Chọn dạng đề trước khi lưu sẵn sàng giao." }}
				onFieldChange={vi.fn()}
			/>,
		);
		expect(htmlWithErrors).toContain(
			"Chọn dạng đề trước khi lưu sẵn sàng giao.",
		);
	});

	it("kích hoạt chip khi type được chọn", () => {
		const html = renderToStaticMarkup(
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
		expect(html).toMatch(/aria-pressed="true"[^>]*>Discuss both views/);
		expect(html).toMatch(/aria-pressed="false"[^>]*>Opinion/);
	});
});
