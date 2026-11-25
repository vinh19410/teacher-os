// @vitest-environment node
import { QuizReadingSplitLayout } from "@teacher-os/ui/components/quiz/quiz-reading-layout";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("QuizReadingSplitLayout SSR fallback (Node environment)", () => {
	it("renders safely without document/DOMParser when annotations are passed and emits no bare overflow-y-auto", () => {
		expect(typeof document).toBe("undefined");
		expect(typeof DOMParser).toBe("undefined");

		const html = renderToStaticMarkup(
			<QuizReadingSplitLayout
				passage="<p>Đoạn đọc SSR thuần Node.</p>"
				navigator={<footer data-testid="nav" />}
				annotations={{
					mode: "edit",
					items: [{ id: "h1", start: 0, end: 4, note: "ghi chú" }],
				}}
			>
				<p>paper</p>
			</QuizReadingSplitLayout>,
		);

		expect(html).toContain('aria-label="Bài đọc"');
		expect(html).toContain("Bài đọc");
		expect(html).toContain("Đoạn đọc SSR thuần Node.");
		expect(html).not.toMatch(/[^:]overflow-y-auto/);
		expect(html.endsWith("</footer></div>")).toBe(true);
	});
});
