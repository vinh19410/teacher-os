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
