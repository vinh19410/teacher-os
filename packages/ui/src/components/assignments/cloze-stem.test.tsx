import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClozeStemText } from "./cloze-stem";

describe("ClozeStemText — summary and fill_blank table stems", () => {
	it.each(["summary", "fill_blank"])(
		"renders [table] stems as labeled Hàng r — Cột c rows for %s",
		(typeId) => {
			const html = renderToStaticMarkup(
				<ClozeStemText
					stem="[table] r2 c3: 19th Century / Material"
					answer="brick"
					typeId={typeId}
					number={5}
				/>,
			);
			expect(html).toContain("Hàng 2 — Cột 3:");
			expect(html).toContain("19th Century / Material");
			expect(html).toContain("<input");
			expect(html).toContain('aria-label="Điền đáp án câu 5"');
			expect(html).not.toContain("brick");
		},
	);

	it.each(["summary", "fill_blank"])(
		"renders normal ____ cloze stems inline for %s",
		(typeId) => {
			const html = renderToStaticMarkup(
				<ClozeStemText
					stem="The tower was built of ____ in 1890."
					value="stone"
					onChange={() => {}}
					typeId={typeId}
					number={6}
				/>,
			);
			expect(html).toContain("The tower was built of");
			expect(html).toContain("in 1890.");
			expect(html).toContain('value="stone"');
			expect(html).not.toContain("Hàng ");
		},
	);
});
