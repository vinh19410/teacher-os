import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BrandPanel from "./brand-panel";

describe("BrandPanel", () => {
	it("keeps the wordmark and headline copy", () => {
		const html = renderToStaticMarkup(<BrandPanel />);
		expect(html).toContain("Teacher");
		expect(html).toContain("OS");
		// The headline stays one sentence; the highlighted word is wrapped in a
		// span so assert the two halves (markup splits the text node).
		expect(html).toContain("Your whole teaching day, in one");
		expect(html).toContain("calm");
		expect(html).toContain("workspace.");
	});

	it("renders the hand-drawn teacher illustration", () => {
		const html = renderToStaticMarkup(<BrandPanel />);
		expect(html).toContain("Minh họa giáo viên đọc bài ở bàn làm việc");
	});

	it("now prop is accepted for API compatibility", () => {
		// The redesigned left column has no demo schedule widget anymore, but
		// callers may still pass `now`; it is intentionally unused.
		const html = renderToStaticMarkup(
			<BrandPanel now={new Date(2026, 7, 20)} />,
		);
		expect(html).toContain("Your whole teaching day, in one");
	});
});
