import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BrandPanel from "./brand-panel";

describe("BrandPanel (issue #171 - dynamic demo date)", () => {
	it("renders dynamic date for the current date by default", () => {
		const html = renderToStaticMarkup(<BrandPanel />);
		const expectedDate = new Intl.DateTimeFormat("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		}).format(new Date());

		expect(html).toContain(`${expectedDate} · 3 classes`);
	});

	it("renders deterministic date when now prop is provided", () => {
		// August 20, 2026 was a Thursday (the original hardcoded demo date)
		const aug20 = new Date(2026, 7, 20);
		const htmlAug20 = renderToStaticMarkup(<BrandPanel now={aug20} />);
		expect(htmlAug20).toContain("Thu, Aug 20 · 3 classes");

		// September 17, 2026 was a Thursday (the QC run date from issue #171)
		const sep17 = new Date(2026, 8, 17);
		const htmlSep17 = renderToStaticMarkup(<BrandPanel now={sep17} />);
		expect(htmlSep17).toContain("Thu, Sep 17 · 3 classes");
		expect(htmlSep17).not.toContain("Thu, Aug 20 · 3 classes");

		// September 18, 2026 is a Friday
		const sep18 = new Date(2026, 8, 18);
		const htmlSep18 = renderToStaticMarkup(<BrandPanel now={sep18} />);
		expect(htmlSep18).toContain("Fri, Sep 18 · 3 classes");
		expect(htmlSep18).not.toContain("Thu, Aug 20 · 3 classes");
	});

	it("preserves marketing card header and structure", () => {
		const html = renderToStaticMarkup(<BrandPanel />);
		expect(html).toContain("Teacher OS");
		expect(html).toContain("Your whole teaching day, in one calm workspace.");
		expect(html).toContain("Today");
		expect(html).toContain("Speaking Club · Group A");
		expect(html).toContain("Mathematics 10 · Section B");
		expect(html).toContain("Physics Lab · Group C");
	});
});
