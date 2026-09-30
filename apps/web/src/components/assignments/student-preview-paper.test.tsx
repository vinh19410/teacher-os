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

describe("StudentPreviewPaper — cloze marker rendering (phase-03 FR5)", () => {
	it("renders a markered completion stem as before-text + input + after-text without leaking the key", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					part: "p2",
					type: "summary",
					items: [
						{
							...emptyItem("summary"),
							stem: "Rains refill the ____ each year.",
							answer: "stepwells",
						},
					],
				})}
			/>,
		);
		expect(html).toContain("Rains refill the");
		expect(html).toContain("each year.");
		expect(html).toContain("<input");
		// The auto-grading key never appears in the student paper.
		expect(html).not.toContain("stepwells");
	});

	it("renders tablecomp stems as labeled Hàng — Cột rows (no full grid)", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					part: "p2",
					type: "tablecomp",
					items: [
						{
							...emptyItem("tablecomp"),
							stem: "[table] r1 c2: Steam engine / Invention",
							answer: "piston",
						},
					],
				})}
			/>,
		);
		expect(html).toContain("Hàng 1 — Cột 2:");
		expect(html).toContain("Steam engine / Invention");
		expect(html).toContain("<input");
		expect(html).not.toContain("piston");
	});

	it("renders legacy markerless stems verbatim without a blank input", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					part: "p2",
					type: "summary",
					items: [{ ...emptyItem("summary"), stem: "An old summary stem?" }],
				})}
			/>,
		);
		expect(html).toContain("An old summary stem?");
		expect(html).not.toContain("<input");
	});
});

describe("StudentPreviewPaper — image pins (phase-04 FR5)", () => {
	const diagramBase = base({
		skill: "reading",
		part: "p1",
		type: "diagram",
		intro: "Label the diagram. ONE WORD ONLY.",
		imageUrl: "https://example.com/machine.png",
		items: [
			{
				...emptyItem("diagram"),
				stem: "Part 4 of the machine",
				answer: "piston",
				pin: { x: 30, y: 60 },
			},
			{
				...emptyItem("diagram"),
				stem: "Part 5 of the machine",
				answer: "valve",
			},
		],
	});

	it("renders numbered pins at their percents beside a fill-in input", () => {
		const html = renderToStaticMarkup(<StudentPreviewPaper {...diagramBase} />);
		expect(html).toContain('alt="Ảnh đề"');
		expect(html).toMatch(/left:30%/);
		expect(html).toMatch(/top:60%/);
		expect(html).toContain('aria-label="Điền đáp án câu 1"');
		// The pin-less second question renders no overlay pin.
		expect(html).not.toContain('aria-label="Điền đáp án câu 2"');
	});

	it("keeps the plain thumbnail when no question carries a pin (legacy)", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...diagramBase}
				items={[{ ...emptyItem("diagram"), stem: "Part 4", answer: "piston" }]}
			/>,
		);
		expect(html).toContain('alt="Ảnh biểu đồ đề Reading"');
		expect(html).not.toContain('aria-label="Điền đáp án câu 1"');
	});

	it("listening map renders the image with pins too (skill-qualified)", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					skill: "listening",
					part: "s2",
					type: "map",
					imageUrl: "https://example.com/campus.png",
					optionBank: ["Reception", "Cafe"],
					items: [
						{
							...emptyItem("map"),
							stem: "11",
							answer: "A",
							pin: { x: 40, y: 40 },
						},
					],
				})}
			/>,
		);
		expect(html).toContain('alt="Ảnh đề"');
		expect(html).toMatch(/left:40%/);
	});
});

describe("StudentPreviewPaper — rich text render (rich text plan phase 4)", () => {
	it("legacy plain rows keep newlines via the pre-line branch", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					skill: "writing",
					part: "task2",
					type: "discuss",
					passage: undefined,
					prompt: "Dòng 1\nDòng 2",
				})}
			/>,
		);
		expect(html).toContain("Dòng 1\nDòng 2");
		expect(html).toContain("whitespace-pre-line");
	});

	it("tag-only note hides the extra-guidance tag", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper {...base({ note: "<p></p>" })} />,
		);
		expect(html).not.toContain("Có hướng dẫn thêm");
		const withNote = renderToStaticMarkup(
			<StudentPreviewPaper {...base({ note: "<p>Chú ý</p>" })} />,
		);
		expect(withNote).toContain("Có hướng dẫn thêm");
	});

	it("word count runs on plain text extracted from HTML", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					skill: "writing",
					part: "task2",
					type: "discuss",
					passage: undefined,
					prompt: "<p>one two</p>",
				})}
			/>,
		);
		expect(html).toContain("2 từ");
	});
});

describe("StudentPreviewPaper — per-question type (mixed prompts)", () => {
	it("renders the row widget by the question type, not the prompt type", () => {
		const html = renderToStaticMarkup(
			<StudentPreviewPaper
				{...base({
					type: "note",
					items: [
						// Câu tablecomp trong đề note: layout "Hàng — Cột" của riêng
						// type câu (trước đây key theo prompt type nên render thô).
						{
							stem: "[table] r1 c2: chế tác / vật liệu",
							answer: "iron",
							opts: null,
							alts: "",
							type: "tablecomp",
						},
						{ ...emptyItem("note"), stem: "plain note row ____" },
					],
				})}
			/>,
		);
		expect(html).toContain("Hàng 1 — Cột 2:");
		expect(html).toContain("chế tác / vật liệu");
	});
});
