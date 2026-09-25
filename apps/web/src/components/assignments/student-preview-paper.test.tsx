import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyItem } from "./assignment-presets";
import { StudentPreviewPaper } from "./student-preview-paper";

function base(
	overrides: Partial<Parameters<typeof StudentPreviewPaper>[0]> = {},
) {
	return {
		skill: "reading",
		part: "p3",
		type: "features",
		title: "QC-271 Features",
		band: "7.0",
		source: "",
		prompt: "",
		note: "",
		status: "ready",
		passage: "The canal builders changed the landscape forever.",
		intro: "Questions 27–30 · Match each feature with the correct person.",
		items: [
			{ ...emptyItem("features"), stem: "27 The first boat" },
			{ ...emptyItem("features"), stem: "28 The iron bridge" },
		],
		...overrides,
	};
}

describe("StudentPreviewPaper — option bank (phase-02 FR6)", () => {
	it("renders the bank as a labeled list for bankable types", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					optionBank: ["Isambard Kingdom Brunel", "Charles Darwin"],
				})}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Isambard Kingdom Brunel");
		expect(html).toContain("Charles Darwin");
		expect(html).toMatch(/A\s*<\/span>/);
		expect(html).toMatch(/B\s*<\/span>/);
		// Never silent: no warning when the bank exists.
		expect(html).not.toContain("Thiếu ngân hàng lựa chọn");
		// The answer keys never leak into the student paper.
		expect(html).not.toContain("answer");
	});

	it("renders roman labels for headings", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					part: "p2",
					type: "headings",
					optionBank: ["Liệt kê I", "Liệt kê II"],
				})}
			/>,
		);
		expect(html).toMatch(/i\s*<\/span>/);
		expect(html).toMatch(/ii\s*<\/span>/);
	});

	it("an empty bank on a bankable type keeps the intro fallback AND shows the warning", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper {...base({ optionBank: [] })} />,
		);
		// Old behavior (intro text) stays — the fallback is not removed.
		expect(html).toContain("Match each feature");
		expect(html).toContain("Thiếu ngân hàng lựa chọn");
	});

	it("non-bankable types show neither the bank nor the warning", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					part: "p1",
					type: "tfng",
					optionBank: [],
				})}
			/>,
		);
		expect(html).not.toContain("Ngân hàng lựa chọn");
		expect(html).not.toContain("Thiếu ngân hàng lựa chọn");
		expect(html).toContain("Match each feature");
	});

	it("keeps rendering the question stems next to the bank", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper {...base({ optionBank: ["Brunel", "Darwin"] })} />,
		);
		expect(html).toContain("27 The first boat");
		expect(html).toContain("28 The iron bridge");
	});
});
